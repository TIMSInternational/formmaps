/**
 * Audit 2026-10-09, batch E1 — parents see their child's results and career report (active link only, never answers).
 * Local stack with seed data; seeds/changes what it needs with psql against E2E_DB (default formmaps_dev) and restores it.
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-e1.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const PARENT = "test.parent@formmaps.dev";

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

/** GET through the app's proxy with the signed-in token; returns status, content type and parsed JSON (if any). */
async function get(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const token = JSON.parse(window.localStorage.getItem("timcare-global-store") || "{}").state?.user?.accessToken;
    const r = await fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const type = r.headers.get("content-type") || "";
    const text = type.includes("json") ? await r.text() : "";
    return { status: r.status, type, text, json: text ? JSON.parse(text) : null };
  }, path);
}

const DB = process.env.E2E_DB || "formmaps_dev";
function sql(query: string): string {
  return execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
}
const userId = (email: string) => sql(`SELECT id FROM users WHERE email = '${email}'`);

/** An ACTIVE, ACCEPTED link from the seed parent to the seed student, created if missing; returns how to restore it. */
function ensureActiveLink(parentId: string, studentId: string): { linkId: string; restore: () => void } {
  const existing = sql(`SELECT id || '|' || "isActive" || '|' || "isAccepted" FROM student_parent_links WHERE "parentUserId" = '${parentId}' AND "studentId" = '${studentId}' LIMIT 1`);
  if (existing) {
    const [linkId, active, accepted] = existing.split("|");
    sql(`UPDATE student_parent_links SET "isActive" = true, "isAccepted" = true WHERE id = '${linkId}'`);
    return { linkId, restore: () => sql(`UPDATE student_parent_links SET "isActive" = ${active === "true"}, "isAccepted" = ${accepted === "true"} WHERE id = '${linkId}'`) };
  }
  const linkId = `e2e-e1-${Date.now()}`;
  sql(`INSERT INTO student_parent_links (id, "studentId", "parentEmail", "parentUserId", "isAccepted", "acceptedAt", "isActive", "updatedAt")
       VALUES ('${linkId}', '${studentId}', '${PARENT}', '${parentId}', true, now(), true, now())`);
  return { linkId, restore: () => sql(`DELETE FROM student_parent_links WHERE id = '${linkId}'`) };
}

test.describe("Audit batch E1 — parent sees the child's results", () => {
  test("active link: results with scores but no answers, report downloads, Results tab renders", async ({ page }) => {
    const parentId = userId(PARENT);
    const studentId = userId("test.student@formmaps.dev");
    const link = ensureActiveLink(parentId, studentId);
    try {
      await login(page, PARENT);
      const r = await get(page, `/api/v1/parent/children/${studentId}/results?lang=en`);
      expect(r.status).toBe(200);
      const data = r.json.data;
      expect(data.student.id).toBe(studentId);
      expect(data.assessments.length).toBeGreaterThan(0);
      for (const a of data.assessments) {
        expect(Object.keys(a).sort()).toEqual(["completedAt", "key", "status", "summary", "title"]);
      }
      expect(data.assessments.map((a: { key: string }) => a.key)).not.toContain("careerfit");
      expect(r.text).not.toContain("test.student@formmaps.dev");
      expect(r.text).not.toMatch(/"answers"|"correct|"sections"|pcaCod/);

      const pdf = await get(page, `/api/v1/parent/children/${studentId}/report/pdf?lang=en`);
      if (data.report.available) {
        expect(pdf.status).toBe(200);
        expect(pdf.type).toContain("application/pdf");
      } else {
        expect(pdf.status).toBe(409);
      }

      await page.goto(`/parent/children/${studentId}`);
      await expect(page.getByTestId("child-results")).toBeVisible({ timeout: 60000 });
      await expect(page.getByRole("button", { name: /download report/i })).toBeVisible();
      await expect(page.getByTestId(`child-result-${data.assessments[0].key}`)).toContainText(data.assessments[0].title);
      // The fake empty "Pending Actions" tab is gone.
      await expect(page.getByRole("tab", { name: /pending actions/i })).toHaveCount(0);
    } finally {
      link.restore();
    }
  });

  test("revoked or not-yet-accepted link → 403 on results and report", async ({ page }) => {
    const parentId = userId(PARENT);
    const studentId = userId("test.student@formmaps.dev");
    const link = ensureActiveLink(parentId, studentId);
    try {
      await login(page, PARENT);
      sql(`UPDATE student_parent_links SET "isActive" = false WHERE id = '${link.linkId}'`);
      expect((await get(page, `/api/v1/parent/children/${studentId}/results`)).status).toBe(403);
      expect((await get(page, `/api/v1/parent/children/${studentId}/report/pdf`)).status).toBe(403);

      sql(`UPDATE student_parent_links SET "isActive" = true, "isAccepted" = false WHERE id = '${link.linkId}'`);
      expect((await get(page, `/api/v1/parent/children/${studentId}/results`)).status).toBe(403);
    } finally {
      link.restore();
    }
  });

  test("a student this parent is not linked to → 403", async ({ page }) => {
    const parentId = userId(PARENT);
    const stranger = sql(`SELECT u.id FROM users u WHERE u."roleName" = 'student' AND NOT EXISTS (
      SELECT 1 FROM student_parent_links l WHERE l."studentId" = u.id AND l."parentUserId" = '${parentId}') ORDER BY u.email LIMIT 1`);
    expect(stranger).toBeTruthy();
    await login(page, PARENT);
    const r = await get(page, `/api/v1/parent/children/${stranger}/results`);
    expect(r.status).toBe(403);
    expect(r.text).not.toContain("assessments");
    expect((await get(page, `/api/v1/parent/children/${stranger}/report/pdf`)).status).toBe(403);
  });
});
