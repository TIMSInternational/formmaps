/**
 * Super Admin "act as a school" — end to end through the real web app and both backends.
 *
 * Before: a Super Admin opening /school-admin got a crashed dashboard ("Something went wrong") and empty lists,
 * because every school-admin endpoint resolved "my school" to null (production, 2026-10-07).
 * After: /school-admin asks which school; choosing one shows that school's real data under a banner naming it;
 * Admin → Schools has "Open school"; "Back to Admin" leaves the school.
 *
 * Run against a local stack with the seeded data (FormMaps Test Academy has students):
 *   E2E_BASE_URL=http://localhost:3000 E2E_PASSWORD=... npx playwright test e2e/superadmin-acting-school.spec.ts
 */
import { test, expect, Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const SCHOOL = "FormMaps Test Academy";

async function loginAsSuperAdmin(page: Page) {
  // Pre-answer the cookie banner (necessary only), which otherwise covers the login form.
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.admin@formmaps.dev");
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin**", { timeout: 30000 });
}

/** Every school-scoped API response the page makes, so a regression to 400 "No school" fails loudly. */
function recordSchoolApiFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (/\/api\/v1\/(school-admin|alerts)\//.test(url) && res.status() >= 400) failures.push(`${res.status()} ${url}`);
  });
  return failures;
}

test.describe("Super Admin acts as a school", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
  });

  test("/school-admin asks which school instead of crashing, and the chosen school's data loads", async ({ page }) => {
    const failures = recordSchoolApiFailures(page);
    await page.goto("/school-admin");

    await expect(page.getByTestId("school-picker")).toBeVisible();
    await page.getByTestId("school-picker-option").filter({ has: page.getByText(SCHOOL, { exact: true }) }).click();

    const bar = page.getByTestId("acting-school-bar");
    await expect(bar).toContainText(SCHOOL);
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);

    // The students list is that school's, not the empty list a school-less caller gets.
    await page.goto("/school-admin/users");
    await expect(page.getByTestId("acting-school-bar")).toContainText(SCHOOL);
    await expect(page.getByRole("row").filter({ hasText: "@" }).first()).toBeVisible({ timeout: 15000 });

    expect(failures).toEqual([]);
  });

  test("Admin → Schools → Open school enters it, and Back to Admin leaves it", async ({ page }) => {
    await page.goto("/admin/schools");
    const row = page.getByRole("row").filter({ hasText: SCHOOL }).filter({ hasNotText: `${SCHOOL} 2` });
    await row.getByTestId("open-school").click();

    await page.waitForURL("**/school-admin");
    await expect(page.getByTestId("acting-school-bar")).toContainText(SCHOOL);

    await page.getByTestId("acting-school-bar").getByRole("button", { name: /back to admin|volver a admin/i }).click();
    await page.waitForURL(/\/admin$/);

    // Leaving forgets the school: /school-admin asks again.
    await page.goto("/school-admin");
    await expect(page.getByTestId("school-picker")).toBeVisible();
  });
});
