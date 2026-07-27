import { test, expect } from "@playwright/test";

// Wave 2 Batch 4 acceptance: /school-admin (main dashboard) calls
// /api/v1/school-admin/assessments/status on mount (page.tsx:189, query key
// "sa-assess-status") — now .NET-served.
const FIXTURE_EMAIL = "test.schooladmin@formmaps.dev";
const FIXTURE_PASSWORD = process.env.E2E_FIXTURE_SCHOOLADMIN_PASSWORD;

async function dismissCookieConsent(page: import("@playwright/test").Page) {
  const acceptAll = page.getByRole("button", { name: /accept all/i });
  if (await acceptAll.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptAll.click();
  }
}

test.describe("Wave 2 Batch 4 — school-admin reads served by .NET", () => {
  test.skip(!FIXTURE_PASSWORD, "Set E2E_FIXTURE_SCHOOLADMIN_PASSWORD to run this spec.");

  test("fixture school admin's dashboard triggers assessments/status via .NET", async ({ page }) => {
    const calls: { url: string; header: string | null }[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/school-admin/assessments/status")) {
        calls.push({ url: response.url(), header: response.headers()["x-formmaps-service"] ?? null });
      }
    });

    await page.goto("/login");
    await dismissCookieConsent(page);
    await page.fill('input[name="email"], input[type="email"]', FIXTURE_EMAIL);
    await page.fill('input[name="password"], input[type="password"]', FIXTURE_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/school-admin/, { timeout: 15000 });

    await expect(page.getByRole("heading", { name: "School Dashboard" })).toBeVisible({ timeout: 15000 });

    await expect
      .poll(() => calls.length, { timeout: 15000 })
      .toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.header).toBe("formmaps-api");
    }
  });
});
