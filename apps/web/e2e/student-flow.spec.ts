import { test, expect, Page } from "@playwright/test";

async function loginAsStudent(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.student@formmaps.dev");
  await page.fill('input[name="password"], input[type="password"]', "Test1234!");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Student Flow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test("dashboard loads with key sections", async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    // Page should have some content loaded (not just loading skeleton)
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body?.length).toBeGreaterThan(100);
  });

  test("can navigate to career paths", async ({ page }) => {
    await page.click('a[href*="career-path"], text=Career');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/career/);
  });

  test("can navigate to university finder", async ({ page }) => {
    await page.click('a[href*="university"], text=Universit');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/university/);
  });

  test("can navigate to resume builder", async ({ page }) => {
    await page.click('a[href*="resume"], text=Resume');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/resume/);
  });

  test("can navigate to profile", async ({ page }) => {
    await page.click('a[href*="profile"], text=Profile');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/profile/);
  });
});
