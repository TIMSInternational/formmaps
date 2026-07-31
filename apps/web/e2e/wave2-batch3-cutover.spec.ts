import { test, expect } from "@playwright/test";

// Wave 2 Batch 3 acceptance: /dashboard/test-scores loads getSuperScore() +
// getCollegeFit() on mount (test-scores/page.tsx:49) — both now .NET-served.
const FIXTURE_EMAIL = "test.student@formmaps.dev";
const FIXTURE_PASSWORD = process.env.E2E_FIXTURE_STUDENT_PASSWORD;

async function dismissCookieConsent(page: import("@playwright/test").Page) {
  const acceptAll = page.getByRole("button", { name: /accept all/i });
  if (await acceptAll.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptAll.click();
  }
}

test.describe("Wave 2 Batch 3 — test-scores reads served by .NET", () => {
  test.skip(!FIXTURE_PASSWORD, "Set E2E_FIXTURE_STUDENT_PASSWORD to run this spec.");

  test("fixture student's test-scores page triggers superscore + college-fit via .NET", async ({ page }) => {
    const calls: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/test-scores/superscore") || response.url().includes("/test-scores/college-fit")) {
        calls.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("/login");
    await dismissCookieConsent(page);
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 15000 });

    await page.goto("/dashboard/test-scores");
    await expect(page.getByRole("heading", { name: "Test Scores" })).toBeVisible({ timeout: 15000 });

    await expect
      .poll(() => calls.length, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call.header).toBe("formmaps-api");
    }
  });
});
