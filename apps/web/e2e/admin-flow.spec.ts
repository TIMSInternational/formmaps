import { test, expect, Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.admin@nexa.dev");
  await page.fill('input[name="password"], input[type="password"]', "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin**", { timeout: 10000 });
}

test.describe("Super Admin Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("admin dashboard loads", async ({ page }) => {
    await expect(page).toHaveURL(/admin/);
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("can navigate to users page", async ({ page }) => {
    await page.click('a[href*="admin/users"], text=Users');
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/users/);
  });

  test("can navigate to schools page", async ({ page }) => {
    await page.click('a[href*="admin/schools"], text=Schools');
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/schools/);
  });

  test("can navigate to settings page", async ({ page }) => {
    await page.click('a[href*="admin/settings"], text=Settings');
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/settings/);
  });

  test("can navigate to analytics page", async ({ page }) => {
    await page.click('a[href*="admin/analytics"], text=Analytics');
    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/analytics/);
  });
});
