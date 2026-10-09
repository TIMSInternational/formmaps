/**
 * School Admin → Students: every student with each assessment's status; a row opens the student's
 * "Results & Answers"; previous / next walk the same filtered list and keep the open tab; the
 * breadcrumb returns to the same filters. The page's "Assessments n / 7" agrees with the list.
 *
 * Run against a local stack with the seeded data (FormMaps Test Academy has 7 students, "Test Student"
 * has personality ESTJ and all 5 MIL exams):
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/school-admin-students.spec.ts
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

function recordApiFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("response", (res) => {
    if (/\/api\/v1\/student-record/.test(res.url()) && res.status() >= 400) failures.push(`${res.status()} ${res.url()}`);
  });
  return failures;
}

test.describe("School Admin walks through their students' results", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSchoolAdmin(page);
  });

  test("the sidebar's Students lists everyone with each assessment's status", async ({ page }) => {
    const failures = recordApiFailures(page);
    await page.goto("/school-admin");
    await page.getByRole("link", { name: "Students", exact: true }).click();
    await expect(page).toHaveURL(/\/school-admin\/students$/);
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();

    const rows = page.getByTestId("student-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(2);

    const testStudent = rows.filter({ hasText: "test.student@formmaps.dev" });
    await expect(testStudent.getByRole("img", { name: /^Personality · Completed · ESTJ/ })).toBeVisible();
    await expect(testStudent.getByRole("img", { name: /^MIL exams · Completed · 5\/5/ })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("filter → open → next keeps the tab → breadcrumb returns to the same filter", async ({ page }) => {
    const failures = recordApiFailures(page);
    await page.goto("/school-admin/students");
    await page.getByRole("button", { name: /^MIL/ }).click(); // the MIL card: who hasn't started it
    await expect(page).toHaveURL(/assessment=mil&state=not_started/);
    const rows = page.getByTestId("student-row");
    // The previous list stays on screen while the filtered one loads: wait until it is gone.
    await expect(rows.filter({ hasText: "test.student@formmaps.dev" })).toHaveCount(0);
    await expect(page.getByText(/^1–\d+ of \d+$/)).toBeVisible();
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(2);

    await rows.first().click();
    await expect(page).toHaveURL(/\/school-admin\/users\/[^?]+\?assessment=mil&state=not_started&tab=record/);
    await expect(page.getByRole("tab", { name: "Results & Answers" })).toHaveAttribute("data-state", "active");
    await expect(page.getByText(`1 of ${total}`)).toBeVisible();

    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page).toHaveURL(/tab=notes/);
    const firstUrl = page.url();
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).not.toHaveURL(firstUrl);
    await expect(page).toHaveURL(/assessment=mil&state=not_started&tab=notes/);
    await expect(page.getByText(`2 of ${total}`)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("data-state", "active");

    await page.reload();
    await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("data-state", "active");

    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Students" }).click();
    await expect(page).toHaveURL(/\/school-admin\/students\?assessment=mil&state=not_started$/);
    await expect(page.getByRole("button", { name: "Clear filters" })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test("the student page's Assessments count matches the list", async ({ page }) => {
    await page.goto("/school-admin/students?search=test.student%40formmaps.dev");
    const row = page.getByTestId("student-row").first();
    const done = (await row.getByLabel(/assessments completed/).getAttribute("aria-label"))!.match(/^(\d+) of 7/)![1];
    await row.click();
    await expect(page.getByText(`${done} / 7`, { exact: true })).toBeVisible();
  });

  test("Export CSV downloads every student's statuses", async ({ page }) => {
    await page.goto("/school-admin/students");
    await expect(page.getByTestId("student-row").first()).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("students-results-en.csv");
    const body = await (await download.createReadStream()).toArray();
    const text = Buffer.concat(body).toString("utf8").replace(/^﻿/, "");
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toMatch(/^Name,Email,Grade,LIA assessment,/);
    expect(lines.length).toBe((await page.getByTestId("student-row").count()) + 1);
  });
});

test.describe("A Super Admin inside a school gets the same Students list", () => {
  test("open school → Students → a student → next", async ({ page }) => {
    const failures = recordApiFailures(page);
    await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
      version: "1.0", timestamp: new Date().toISOString(),
      preferences: { necessary: true, analytics: false, marketing: false },
    })));
    await page.goto("/login");
    await page.fill('input[name="email"], input[type="email"]', "test.admin@formmaps.dev");
    await page.fill('input[name="password"], input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/admin**", { timeout: 30000 });

    // With no school open, Students is the school picker (never another school's list).
    await page.goto("/school-admin/students");
    await expect(page.getByTestId("school-picker")).toBeVisible();
    await page.getByTestId("school-picker-option").filter({ has: page.getByText("FormMaps Test Academy", { exact: true }) }).click();
    await expect(page.getByTestId("acting-school-bar")).toContainText("FormMaps Test Academy");

    await page.goto("/school-admin/students");
    const rows = page.getByTestId("student-row");
    await expect(rows.first()).toBeVisible();
    await rows.first().click();
    await expect(page.getByRole("tab", { name: "Results & Answers" })).toHaveAttribute("data-state", "active");
    await expect(page.getByText(/^1 of \d+$/)).toBeVisible();
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page.getByText(/^2 of \d+$/)).toBeVisible();
    expect(failures).toEqual([]);
  });
});
