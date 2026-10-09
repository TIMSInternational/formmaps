/**
 * School Admin filters that used to do nothing (found 2026-10-09):
 *   - Users & invites → status select (All / Active / Pending / Inactive) was sent and ignored;
 *   - Assessment Hub → Results search box was never sent to the API.
 * Seed: FormMaps Test Academy has 7 students; "SA Invite Student" was invited and never accepted (pending).
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/school-admin-filters.spec.ts
 */
import { test, expect, Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";

async function loginAsSchoolAdmin(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.schooladmin@formmaps.dev");
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/school-admin**", { timeout: 30000 });
}

test.describe("School Admin filters", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSchoolAdmin(page);
  });

  test("roster status: Pending shows only students who haven't accepted their invite", async ({ page }) => {
    await page.goto("/school-admin/users");
    const badges = page.getByTestId("roster-status");
    await expect(badges.first()).toBeVisible();
    // All statuses: the pending student is listed and labelled as such.
    await expect(page.getByRole("row").filter({ hasText: "SA Invite Student" }).getByTestId("roster-status")).toHaveText("Pending");

    const pendingRequest = page.waitForRequest((r) => /\/school-admin\/students\?.*status=pending/.test(r.url()));
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Pending", exact: true }).click();
    await pendingRequest;
    await expect(page.getByRole("row").filter({ hasText: "Test Student" })).toHaveCount(0);
    await expect(badges.first()).toBeVisible();
    for (const s of await badges.all()) await expect(s).toHaveAttribute("data-status", "pending");

    const activeRequest = page.waitForRequest((r) => /\/school-admin\/students\?.*status=active/.test(r.url()));
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    await activeRequest;
    await expect(page.getByRole("row").filter({ hasText: "SA Invite Student" })).toHaveCount(0);
    for (const s of await badges.all()) await expect(s).toHaveAttribute("data-status", "active");
  });

  test("Results search reaches the API and narrows the table", async ({ page }) => {
    await page.goto("/school-admin/assessments?tab=results");
    const box = page.getByPlaceholder(/search/i).first();
    await expect(box).toBeVisible();
    const searched = page.waitForRequest((r) => /\/school-admin\/results\?.*search=FM052/.test(r.url()));
    await box.fill("FM052");
    await searched;
    await expect(page.getByText("test.student.fm052@formmaps.dev")).toBeVisible();
    await expect(page.getByText("qa.lia@formmaps.dev")).toHaveCount(0);
  });
});
