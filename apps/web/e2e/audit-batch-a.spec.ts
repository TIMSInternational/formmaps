/**
 * Audit 2026-10-09, batch A (privacy / integrity), on the local stack with seed data:
 *   A1 counselor alerts ?studentId stays inside the caseload;
 *   A2 a counselor's PRIVATE note is visible to its author only (not on the school admin's Session Notes);
 *   A4 a write that fails with a 5xx is sent once (no automatic retry);
 *   A6 a staff invite can't take over another school's pending account.
 * Local seed: test.counselor's caseload excludes qa.lia@formmaps.dev, who has the alert "E2E A1 alert (not in caseload)"
 * (inserted into formmaps_dev as id e2e-a1-alert).
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-a.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page, Browser } from "@playwright/test";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";

async function login(page: Page, email: string, landing: string) {
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${landing}**`, { timeout: 30000 });
}

// Calls the API the way the app does: same origin, cookies + the store's Bearer.
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

async function newPage(browser: Browser) {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

async function studentId(page: Page, email: string) {
  const r = await api(page, "GET", `/api/v1/school-admin/students?search=${encodeURIComponent(email)}&limit=10`);
  const rows = r.json?.data?.data ?? r.json?.data ?? [];
  const row = rows.find((s: { email: string }) => s.email === email);
  expect(row, `seed student ${email}`).toBeTruthy();
  return row.id as string;
}

test.describe("Audit batch A", () => {
  test("A1 — a counselor cannot read alerts of a student outside their caseload", async ({ browser }) => {
    const admin = await newPage(browser);
    await login(admin, "test.schooladmin@formmaps.dev", "/school-admin");
    const outsider = await studentId(admin, "qa.lia@formmaps.dev");

    const counselor = await newPage(browser);
    await login(counselor, "test.counselor@formmaps.dev", "/counselor");

    const narrowed = await api(counselor, "GET", `/api/v1/counselor/me/alerts?studentId=${outsider}`);
    expect(narrowed.status).toBe(200);
    expect(narrowed.json.data.total).toBe(0);
    expect(narrowed.json.data.data).toEqual([]);

    const all = await api(counselor, "GET", "/api/v1/counselor/me/alerts?limit=100");
    expect(all.status).toBe(200);
    expect(all.json.data.data.some((a: { studentId: string }) => a.studentId === outsider)).toBe(false);

    // The school admin CAN see that alert exists (it's a real row, not an empty table).
    const schoolAlerts = await api(admin, "GET", "/api/v1/school-admin/alerts?limit=100");
    if (schoolAlerts.status === 200) {
      const rows = schoolAlerts.json?.data?.data ?? schoolAlerts.json?.data ?? [];
      expect(JSON.stringify(rows)).toContain("E2E A1 alert");
    }
  });

  test("A2 — a private counselor note is shown to its author and hidden from the school admin", async ({ browser }) => {
    const admin = await newPage(browser);
    await login(admin, "test.schooladmin@formmaps.dev", "/school-admin");
    const student = await studentId(admin, "test.student@formmaps.dev");

    const counselor = await newPage(browser);
    await login(counselor, "test.counselor@formmaps.dev", "/counselor");
    const stamp = Date.now();
    const privateText = `E2E private note ${stamp}`;
    const sharedText = `E2E shared note ${stamp}`;
    const mk = async (content: string, isPrivate: boolean) => {
      const r = await api(counselor, "POST", `/api/v1/counselor/students/${student}/notes`, { content, type: "general", isPrivate });
      expect(r.status).toBe(201);
      return r.json.data.id as string;
    };
    const privateId = await mk(privateText, true);
    const sharedId = await mk(sharedText, false);

    try {
      // Author: sees both, on the student's Notes tab.
      await counselor.goto(`/counselor/students/${student}?tab=notes`);
      const notesTab = counselor.getByRole("tab", { name: /notes/i });
      if (await notesTab.count()) await notesTab.first().click();
      await expect(counselor.getByText(privateText)).toBeVisible({ timeout: 20000 });
      await expect(counselor.getByText(sharedText)).toBeVisible();

      // School admin: Session Notes lists the shared note, never the private one (with and without a search).
      await admin.goto("/school-admin/notes");
      await expect(admin.getByText(sharedText)).toBeVisible({ timeout: 20000 });
      await expect(admin.getByText(privateText)).toHaveCount(0);
      const box = admin.getByPlaceholder(/search/i).first();
      await box.fill(`${stamp}`);
      await expect(admin.getByText(sharedText)).toBeVisible({ timeout: 20000 });
      await expect(admin.getByText(privateText)).toHaveCount(0);

      // …and the API agrees for the per-student list the school admin can call directly.
      const direct = await api(admin, "GET", `/api/v1/counselor/students/${student}/notes?limit=50`);
      expect(direct.status).toBe(200);
      const contents = direct.json.data.data.map((n: { content: string }) => n.content);
      expect(contents).toContain(sharedText);
      expect(contents).not.toContain(privateText);
    } finally {
      await api(counselor, "DELETE", `/api/v1/counselor/notes/${privateId}`);
      await api(counselor, "DELETE", `/api/v1/counselor/notes/${sharedId}`);
    }
  });

  test("A4 — a save that fails with a server error is sent once, not three times", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev", "/school-admin");
    let posts = 0;
    await page.route("**/api/v1/school-admin/staff/invite", async (route) => {
      if (route.request().method() === "POST") posts++;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "down" }) });
    });

    await page.goto("/school-admin/users?tab=staff");
    // Through the real Staff → Invite dialog, so the app's own apiRequest retry policy is what's under test.
    await page.getByRole("button", { name: /invite staff/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input:not([type=email])").first().fill("E2E Retry Probe");
    await dialog.locator("input[type=email]").fill(`e2e.retry.${Date.now()}@example.test`);
    await dialog.getByRole("button", { name: /send invite/i }).click();
    await page.waitForTimeout(8000); // longer than the old 1s + 2s backoff
    expect(posts).toBe(1);
  });

  test("A6 — inviting another school's pending account as staff is refused", async ({ browser }) => {
    // School 2's admin invites a student (pending, no password); school 1's admin then tries to invite that email as a counselor.
    const admin2 = await newPage(browser);
    await login(admin2, "test.schooladmin2@formmaps.dev", "/school-admin");
    const email = `e2e.a6.${Date.now()}@example.test`;
    const inv = await api(admin2, "POST", "/api/v1/school-admin/students/invite", { students: [{ email, name: "E2E A6 Pending" }] });
    expect([200, 201]).toContain(inv.status);

    const admin1 = await newPage(browser);
    await login(admin1, "test.schooladmin@formmaps.dev", "/school-admin");
    const r = await api(admin1, "POST", "/api/v1/school-admin/staff/invite", { name: "Takeover", email, roleName: "counselor" });
    expect(r.status).toBe(409);
    expect(r.json.message).toBe("Unable to invite this email");

    // Still school 2's: their roster still lists the pending student.
    const roster = await api(admin2, "GET", `/api/v1/school-admin/students?search=${encodeURIComponent(email)}`);
    const rows = roster.json?.data?.data ?? roster.json?.data ?? [];
    expect(rows.map((s: { email: string }) => s.email)).toContain(email);
  });
});
