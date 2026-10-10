/**
 * Audit 2026-10-09, batch D (wrong numbers and silent caps), on the local stack with seed data.
 * Seeds what it needs itself with psql against E2E_DB (default formmaps_dev); every test restores what it changed.
 * Covered by unit tests only (they need hundreds of seeded rows): D4 >100 paging and the 2000-recipient broadcast
 * limit, D6 graduation search across pages, D9 GPA engine, D11 course CSV, D14 MIL CSV downloads.
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-d.spec.ts --project=chromium --workers=1
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

async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ method, path, body }) => {
    const token = JSON.parse(window.localStorage.getItem("timcare-global-store") || "{}").state?.user?.accessToken;
    const r = await fetch(path, {
      method, credentials: "include",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { method, path, body });
}

const DB = process.env.E2E_DB || "formmaps_dev";
// Local seed/cleanup helper (single-row/scalar results).
function sql(query: string): string {
  return execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
}
const userId = (email: string) => sql(`SELECT id FROM users WHERE email = '${email}'`);

test.describe("Audit batch D — Super Admin", () => {
  test("D16 — dashboard counts match the list pages' definitions", async ({ page }) => {
    await login(page, "test.admin@formmaps.dev");
    const stats = (await api(page, "GET", "/api/v1/admin/analytics")).json.data.stats;
    expect(stats.activeSchools).toBe(Number(sql(`SELECT count(*) FROM schools WHERE status = 'active'`)));
    expect(stats.pendingInvites).toBe(stats.pendingSchoolInvites + stats.pendingCoachInvites);
    expect(stats.totalUsers).toBe((await api(page, "GET", "/api/v1/admin/users/stats")).json.data.totalUsers);

    await page.goto("/admin");
    // The count-up used to stall at 0 when the tab was not visible; the card must end on the exact value.
    const card = page.locator("div").filter({ has: page.getByText(/^total users$/i) }).filter({ hasText: String(stats.totalUsers) }).first();
    await expect(card).toBeVisible({ timeout: 30000 });
  });
});

test.describe("Audit batch D — school admin numbers", () => {
  test("D1 — the pipeline shows the real PCA next to the LIA subtests, no fake MIL column", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const rows = (await api(page, "GET", "/api/v1/school-admin/assessments/pipeline")).json.data as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r.lia as object).sort()).toEqual(["NumericVelocity", "PatternRecognition", "VerbalReasoning", "VisualRotation", "WorkingMemory"]);
      expect(["not_started", "in_progress", "done"]).toContain(r.pcaStatus);
    }
    await page.goto("/school-admin/assessments?tab=pipeline");
    const pipeline = page.locator("table").filter({ has: page.getByRole("columnheader", { name: "MIL / LIA" }) });
    await expect(pipeline).toBeVisible({ timeout: 30000 });
    await expect(pipeline.getByRole("columnheader", { name: "PCA", exact: true })).toHaveCount(1);
    await expect(pipeline.getByRole("columnheader", { name: "MIL", exact: true })).toHaveCount(0);
  });

  test("D2 — 'completed' is one definition: all four assessments, and the counts add up", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const status = (await api(page, "GET", "/api/v1/school-admin/assessments/status")).json.data;
    const rows = (await api(page, "GET", "/api/v1/school-admin/assessments/pipeline")).json.data as Array<{
      lia: Record<string, string>; pcaStatus: string; eval360: string; personality: string;
    }>;
    const allDone = rows.filter((r) => Object.values(r.lia).every((v) => v === "done") && r.pcaStatus === "done"
      && r.eval360 === "done" && r.personality === "done").length;
    expect(status.completed).toBe(allDone);
    expect(status.notStarted + status.inProgress + status.completed).toBe(status.totalStudents);
    expect(status.completionRate).toBeCloseTo(status.totalStudents ? (100 * status.completed) / status.totalStudents : 0, 0);
  });

  test("D8 — below the 90% gate the dashboard explains why the AI briefing is locked", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const status = (await api(page, "GET", "/api/v1/school-admin/assessments/status")).json.data;
    test.skip(status.completionRate >= 90, "seed school is above the gate");
    await page.goto("/school-admin");
    await page.getByRole("button", { name: "Generate Briefing" }).click();
    await expect(page.getByText(/The AI briefing unlocks at 90%/).first()).toBeVisible({ timeout: 30000 });
  });

  test("D5 — the staff list never returns students or parents, and role counts cover the whole staff", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const r = (await api(page, "GET", "/api/v1/school-admin/users?scope=staff&limit=2")).json.data;
    const all = (await api(page, "GET", `/api/v1/school-admin/users?scope=staff&limit=100`)).json.data;
    expect(all.total).toBe(r.total);
    for (const u of all.data as Array<{ roleName: string }>) expect(["student", "parent"]).not.toContain(u.roleName);
    const sum = Object.values(r.roleCounts as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.total); // counts come from the whole staff, not the 2 rows on this page
  });

  test("D10 — parents are paged by parent: each appears once and each child carries its own link", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const first = (await api(page, "GET", "/api/v1/school-admin/parents?limit=2")).json;
    const seen: string[] = [];
    for (let p = 1; p <= first.totalPages; p++) {
      const pg = (await api(page, "GET", `/api/v1/school-admin/parents?limit=2&page=${p}`)).json;
      for (const parent of pg.data as Array<{ parentEmail: string; students: Array<{ linkId: string }> }>) {
        seen.push(parent.parentEmail.toLowerCase());
        for (const s of parent.students) expect(s.linkId).toBeTruthy();
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(first.total);
    expect(first.stats.totalParents).toBe(first.total);
  });

  test("D3 — alert filters use the stored priorities, search is server-side", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const summary = (await api(page, "GET", "/api/v1/alerts/summary")).json.data;
    for (const p of ["critical", "high", "medium", "low"] as const) {
      const r = (await api(page, "GET", `/api/v1/alerts?priority=${p}&limit=1`)).json.data;
      expect(r.total, `priority=${p}`).toBe(summary.byPriority[p]);
    }
    const none = (await api(page, "GET", "/api/v1/alerts?search=zz-no-such-alert-zz&limit=5")).json.data;
    expect(none.total).toBe(0);
  });

  test("D12 — Settings shows the real contract period and the timezone it is counted in", async ({ page }) => {
    const before = sql(`SELECT coalesce("contractStartDate"::text,'') || '|' || coalesce("contractEndDate"::text,'') FROM schools WHERE id = 'test-school-1'`);
    sql(`UPDATE schools SET "contractStartDate" = '2026-01-15', "contractEndDate" = '2027-06-30' WHERE id = 'test-school-1'`);
    try {
      await login(page, "test.schooladmin@formmaps.dev");
      await page.goto("/school-admin/settings");
      await expect(page.getByText(/Whole days, .+ time/).first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(/2027/).first()).toBeVisible();
      await expect(page.getByText("Not set — contact FormMaps")).toHaveCount(0);
    } finally {
      const [s, e] = before.split("|");
      sql(`UPDATE schools SET "contractStartDate" = ${s ? `'${s}'` : "NULL"}, "contractEndDate" = ${e ? `'${e}'` : "NULL"} WHERE id = 'test-school-1'`);
    }
  });
});

test.describe("Audit batch D — counselor", () => {
  test("D15 — 'upcoming' is what is still to come, soonest first, rescheduled included", async ({ page }) => {
    const counselor = userId("test.counselor@formmaps.dev");
    const student = sql(`SELECT u.id FROM users u JOIN roles r ON r.id = u."roleId" WHERE r.name = 'student' ORDER BY u.email LIMIT 1`);
    const tag = `e2e-d15-${Date.now()}`;
    const ins = (id: string, offsetHours: number, status: string) => sql(`INSERT INTO counselor_sessions (id, "counselorId", "studentId", "startTime", "endTime", status, topic, "updatedAt")
      VALUES ('${tag}-${id}', '${counselor}', '${student}', now() + interval '${offsetHours} hours', now() + interval '${offsetHours + 1} hours', '${status}', '${tag}', now())`);
    ins("past", -30, "confirmed");
    ins("later", 50, "confirmed");
    ins("soon", 26, "rescheduled");
    try {
      await login(page, "test.counselor@formmaps.dev");
      const r = await api(page, "GET", "/api/v1/counselor/me/sessions?upcoming=true&limit=50");
      expect(r.status).toBe(200);
      const list = (r.json.data?.data ?? r.json.data) as Array<{ id: string; startTime: string }>;
      const mine = list.filter((s) => s.id.startsWith(tag)).map((s) => s.id);
      expect(mine).toEqual([`${tag}-soon`, `${tag}-later`]);
      const starts = list.map((s) => new Date(s.startTime).getTime());
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);

      await page.goto("/counselor/sessions");
      await expect(page.getByText("Rescheduled").first()).toBeVisible({ timeout: 30000 });
    } finally {
      sql(`DELETE FROM counselor_sessions WHERE id LIKE '${tag}-%'`);
    }
  });
});
