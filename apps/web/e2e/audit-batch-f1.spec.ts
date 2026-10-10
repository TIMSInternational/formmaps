/**
 * Audit 2026-10-09, batch F1 (security and flow polish), on the local stack with seed data.
 * Not driven here: app/global-error.tsx — Next only renders it in production builds (dev shows the overlay),
 * and nothing in the app can crash the root layout on demand; its unit test covers render, language and Retry.
 *   E2E_BASE_URL=http://localhost:3060 E2E_PASSWORD=... npx playwright test e2e/audit-batch-f1.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";

async function login(page: Page, email: string) {
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
}

test.describe("Audit batch F1", () => {
  test("the unauthenticated /api/admin/settings stub is gone (anonymous GET and POST get 404)", async ({ request }) => {
    const get = await request.get("/api/admin/settings");
    expect(get.status()).toBe(404);
    const post = await request.post("/api/admin/settings", { data: { platformFee: 1 } });
    expect(post.status()).toBe(404);
  });

  test("a coach is sent from the student dashboard back to the coaching portal", async ({ page }) => {
    await login(page, "test.coach@formmaps.dev");
    await page.goto("/dashboard/assessments");
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard/coaching"), { timeout: 30000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/dashboard\/coaching/);
    await page.goto("/dashboard");
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard/coaching"), { timeout: 30000 });
  });

  test("the school-admin dashboard's Students card opens the student directory", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    await page.goto("/school-admin");
    const card = page.locator('a[href="/school-admin/students"]').first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(page.locator('main a[href="/school-admin/users"]')).toHaveCount(0);
    await card.click();
    await page.waitForURL((u) => u.pathname === "/school-admin/students", { timeout: 30000 });
  });
});
