import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3006";

test.describe("Authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1, h2, [data-testid='login-title']")).toBeVisible();
  });

  test("student can login and reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"], input[type="email"]', "test.student@nexa.dev");
    await page.fill('input[name="password"], input[type="password"]', "Test1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await expect(page).toHaveURL(/dashboard/);
  });

  test("school admin can login and reach dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"], input[type="email"]', "test.schooladmin@nexa.dev");
    await page.fill('input[name="password"], input[type="password"]', "Test1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/school-admin**", { timeout: 10000 });
    await expect(page).toHaveURL(/school-admin/);
  });

  test("invalid credentials show error", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"], input[type="email"]', "fake@test.com");
    await page.fill('input[name="password"], input[type="password"]', "WrongPassword1!");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid, text=error, [role='alert']").first()).toBeVisible({ timeout: 5000 });
  });

  test("404 page renders for unknown routes", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("text=404")).toBeVisible();
  });

  test("privacy policy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("text=Privacy Policy")).toBeVisible();
  });

  test("terms of service page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator("text=Terms of Service")).toBeVisible();
  });
});
