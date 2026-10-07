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

/**
 * Every school-scoped refusal the page gets (4xx: "No school", forbidden, not found), so a regression fails loudly.
 * 5xx is left out on purpose: the AI course recommendations call a model provider whose quota is not this test's
 * subject, and the page already falls back to basic recommendations when it fails.
 */
function recordSchoolApiFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (/\/api\/v1\/(school-admin|alerts)\//.test(url) && res.status() >= 400 && res.status() < 500) {
      failures.push(`${res.status()} ${url}`);
    }
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

  // Admin → Users → "View profile & results" (C2). Seeded: test.student@formmaps.dev is in FormMaps Test Academy;
  // an independent student (no school) is any student row without one.
  async function openResultsFor(page: Page, email: string) {
    await page.goto("/admin/users");
    await page.getByPlaceholder(/search users|buscar usuarios/i).fill(email);
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: /menu|menú/i }).click();
    await page.getByTestId("view-student-results").click();
    await page.waitForURL("**/school-admin/users/**");
  }

  test("a school student opens INSIDE their school, with results and the informe download", async ({ page }) => {
    const failures = recordSchoolApiFailures(page);
    await openResultsFor(page, "test.student@formmaps.dev");

    await expect(page.getByTestId("acting-school-bar")).toContainText(SCHOOL);
    await expect(page.getByText("test.student@formmaps.dev").first()).toBeVisible();

    // The informe PDF the Assessments tab downloads answers for a Super Admin.
    const studentId = page.url().split("/").pop()!;
    const pdf = await page.request.get(`/api/v1/career-informe/${studentId}/pdf?lang=es`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");

    expect(failures).toEqual([]);
  });

  test("an independent student opens with no school, and nothing school-only is asked for", async ({ page }) => {
    const failures = recordSchoolApiFailures(page);
    let gapsRequests = 0;
    page.on("request", (req) => { if (req.url().includes("/academic-gaps/")) gapsRequests++; });

    const res = await page.request.get("/api/v1/admin/users?role=student&limit=100");
    const items = ((await res.json()).data?.items ?? []) as Array<{ email: string; schoolId: string | null }>;
    const independent = items.find((u) => !u.schoolId);
    test.skip(!independent, "no independent student in this database");

    await openResultsFor(page, independent!.email);
    await expect(page.getByTestId("acting-school-bar")).toContainText(/outside any school|fuera de cualquier colegio/i);
    await expect(page.getByText(independent!.email).first()).toBeVisible();
    expect(gapsRequests).toBe(0);
    expect(failures).toEqual([]);
  });
});
