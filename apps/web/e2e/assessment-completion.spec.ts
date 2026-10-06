import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Finishing an assessment must say so and update the app WITHOUT a reload.
 *
 * PCA is the hardest case: the student finishes inside TIMS's survey (a cross-origin iframe),
 * so the page cannot see it happen. Here TIMS's status flips to "completed" while the survey is
 * open, as it does when the student submits the last page. Before this fix the page sat in secure
 * mode on the finished survey forever and the assessments list kept its cached "In progress"
 * until a reload.
 *
 * TIMS is stubbed (no survey is created); the rest is the real local app. No page.reload() anywhere:
 * every navigation after login is a client-side link click.
 *
 * LOCAL STACK: E2E_BASE_URL=http://localhost:3000 E2E_PASSWORD=... npx playwright test e2e/assessment-completion.spec.ts
 */

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const SURVEY = "https://pca-e2e.timshr.com/survey"; // a CSP frame-src origin; intercepted, never fetched
const en = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/lib/i18n/locales/en/common.json"), "utf8"));
const COMPLETED_BADGE = en.dashboard.assessmentCompleted as string; // "Assessment Completed!"
const STATUS_COMPLETED = en.dashboard.statusCompleted as string;
const STATUS_IN_PROGRESS = en.dashboard.statusInProgress as string;

async function login(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[type="email"]', "test.student@formmaps.dev");
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("timcare-global-store");
    const store = raw ? JSON.parse(raw) : { state: {} };
    store.state = { ...store.state, language: "english" };
    window.localStorage.setItem("timcare-global-store", JSON.stringify(store));
    window.localStorage.setItem("i18nextLng", "en");
    for (const k of Object.keys(window.localStorage)) if (k.startsWith("pcaData_")) window.localStorage.removeItem(k);
  });
}

/** TIMS for this student: one PCA started, not finished — until `finish()` is called. */
async function stubTims(page: Page, userId: string) {
  let finished = false;
  await page.route(`${SURVEY}**`, (r) => r.fulfill({ contentType: "text/html", body: "<h1>PCA survey</h1><p>Last page</p>" }));
  await page.route("**/api/pcaapi/**", (r) => {
    const url = r.request().url();
    if (url.includes("/add-evaluation")) return r.fulfill({ json: { success: true, data: { surveyLink: SURVEY, PcaCod: "990001" } } });
    if (url.includes("/evaluations")) return r.fulfill({ json: { success: true, data: [{ userId, pcaCod: "990001", createdAt: new Date().toISOString() }] } });
    return r.fulfill({ status: 404, json: { success: false } });
  });
  // The server's completion verdict, with TIMS's PCA answer patched in (the real route may not
  // exist on a .NET-only local stack, so always answer 200).
  await page.route("**/api/v1/assessment/completion", async (r) => {
    const res = await r.fetch().catch(() => null);
    const real = res && res.ok() ? await res.json().catch(() => ({})) : {};
    const data = { allDone: false, ...(real?.data ?? {}), pcaCompleted: finished };
    return r.fulfill({ status: 200, json: { success: true, data } });
  });
  return { finish: () => { finished = true; } };
}

test("finishing the PCA survey says 'completed' and updates the assessments list with no reload", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await page.evaluate(() => JSON.parse(window.localStorage.getItem("timcare-global-store") || "{}").state?.user?.id as string);
  expect(userId).toBeTruthy();
  const tims = await stubTims(page, userId);

  // The assessments list caches PCA as in progress (React Query, 5-minute staleTime).
  await page.goto("/dashboard/assessments");
  const pcaCard = page.locator('a[href^="/dashboard/assessments/pca"]').filter({ hasText: en.dashboard.pcaTitle });
  await expect(pcaCard).toContainText(STATUS_IN_PROGRESS, { ignoreCase: true, timeout: 60_000 });

  // Client-side into PCA, start, and the survey opens in secure mode.
  await pcaCard.click();
  await page.getByRole("button", { name: en.dashboard.resumePCA }).click();
  await expect(page.locator(`iframe[src="${SURVEY}"]`)).toBeVisible();

  // The student submits TIMS's last page.
  tims.finish();

  // No click, no reload: within a status check the page leaves secure mode and says so.
  await expect(page.locator(`iframe[src="${SURVEY}"]`)).toHaveCount(0, { timeout: 25_000 });
  await expect(page.getByText(COMPLETED_BADGE).first()).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(en.dashboard.viewResults) })).toBeVisible();

  // Client-side back to the list: PCA is completed there too, still without a reload.
  await page.locator('main a[href="/dashboard/assessments"]').first().click(); // the page's "← Assessments"
  await page.waitForURL("**/dashboard/assessments");
  await expect(pcaCard).toContainText(STATUS_COMPLETED, { ignoreCase: true, timeout: 15_000 });

  // Leave no completed-PCA placeholder behind for the next run.
  await page.evaluate(() => { for (const k of Object.keys(window.localStorage)) if (k.startsWith("pcaData_")) window.localStorage.removeItem(k); });
});
