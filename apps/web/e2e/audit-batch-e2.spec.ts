/**
 * Audit 2026-10-09, batch E2: the counselor's student page has "Results & Answers" (the school admin's record view).
 * Local stack with seed data; seeds what it needs with psql against E2E_DB (default formmaps_dev) and removes it.
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-e2.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

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

async function api(page: Page, method: string, path: string) {
  return page.evaluate(async ({ method, path }) => {
    const token = JSON.parse(window.localStorage.getItem("timcare-global-store") || "{}").state?.user?.accessToken;
    const r = await fetch(path, { method, credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { method, path });
}

const DB = process.env.E2E_DB || "formmaps_dev";
// Local seed/cleanup helper (single-row/scalar results).
function sql(query: string): string {
  return execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
}

const COUNSELOR = "test.counselor@formmaps.dev";
const STUDENT = "test.student@formmaps.dev"; // actively assigned to the seed counselor, personality test done

test.describe("Audit batch E2 — counselor Results & Answers", () => {
  test("the counselor opens an assigned student's answers", async ({ page }) => {
    const studentId = sql(`SELECT id FROM users WHERE email = '${STUDENT}'`);
    expect(sql(`SELECT count(*) FROM counselor_student_assignments a JOIN users c ON c.id = a."counselorId"
      WHERE c.email = '${COUNSELOR}' AND a."studentId" = '${studentId}' AND a."isActive"`)).toBe("1");

    await login(page, COUNSELOR);
    await page.goto(`/counselor/students/${studentId}`);
    await page.getByRole("tab", { name: "Results & Answers" }).click();
    const row = page.getByTestId("record-assessment-personality");
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole("button", { name: /view answers/i }).click();
    const answers = page.locator("#record-answers-personality table tbody tr");
    await expect(answers.first()).toBeVisible({ timeout: 30000 });
    expect(await answers.count()).toBeGreaterThan(0);
  });

  test("a counselor of another school, or one not assigned, cannot read the record (404, no existence oracle)", async ({ page }) => {
    const studentId = sql(`SELECT id FROM users WHERE email = '${STUDENT}'`);
    const id = `e2e-e2-${Date.now()}`;
    const email = `${id}@example.test`;
    // A copy of the seed counselor (same password and role) in the other seed school, with no assignments.
    sql(`INSERT INTO users SELECT (jsonb_populate_record(NULL::users, to_jsonb(u)
      || jsonb_build_object('id', '${id}', 'email', '${email}', 'schoolId', 'test-school-2'))).*
      FROM users u WHERE email = '${COUNSELOR}'`);
    try {
      await login(page, email);
      for (const p of [`/api/v1/student-record/${studentId}`, `/api/v1/student-record/${studentId}/answers/personality`]) {
        expect((await api(page, "GET", p)).status, p).toBe(404);
      }
      // Same school but not assigned: still 404.
      sql(`UPDATE users SET "schoolId" = 'test-school-1' WHERE id = '${id}'`);
      expect((await api(page, "GET", `/api/v1/student-record/${studentId}/answers/personality`)).status).toBe(404);
    } finally {
      sql(`DELETE FROM users WHERE id = '${id}'`);
    }
  });
});
