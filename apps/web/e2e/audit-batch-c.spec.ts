/**
 * Audit 2026-10-09, batch C (broken flows), on the local stack with seed data.
 * Seeds what it needs itself with psql against E2E_DB (default formmaps_dev); every test cleans up after itself.
 * Not covered here: C11 Switch plan (needs an independent student with a live Stripe subscription).
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-c.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page, Browser } from "@playwright/test";
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

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

const PAYWALL_402 = { status: 402, contentType: "application/json", body: JSON.stringify({ success: false, message: "Payment required", code: "PAYMENT_REQUIRED" }) };

test.describe("Audit batch C — school admin", () => {
  test("C17 — iSAMS Test connection calls the real test endpoint; a failed save never says saved", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    await page.goto("/school-admin/settings?tab=integrations");
    await page.getByPlaceholder("https://api.isams.cloud/v1").fill("https://isams.example.test/api");
    await page.getByPlaceholder("Enter your API key").fill("e2e-key");

    const testCall = page.waitForRequest((r) => r.url().includes("/integrations/isams/test") && r.method() === "POST");
    await page.getByRole("button", { name: /test connection/i }).click();
    const req = await testCall;
    expect(req.postDataJSON()).toMatchObject({ endpoint: "https://isams.example.test/api", credentials: "e2e-key" });

    await page.route("**/integrations/isams?schoolId=*", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "boom" }) })
        : route.continue());
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(/Could not save the configuration/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Configuration saved/i)).toHaveCount(0);
    expect(await page.evaluate(() => window.sessionStorage.getItem("isams_config_local"))).toBeNull();
  });
});

test.describe("Audit batch C — student paywall (402)", () => {
  test("C18 — a 402 on a results page shows the unlock state with a purchase link", async ({ page }) => {
    await login(page, "test.student@formmaps.dev");
    await page.route("**/api/v1/personality/user/*/results**", (route) => route.fulfill(PAYWALL_402));
    await page.goto("/dashboard/assessments/personality/results");
    await expect(page.getByRole("heading", { name: "Unlock your results" })).toBeVisible({ timeout: 30000 });
    const unlock = page.getByRole("link", { name: "Unlock my results" });
    await expect(unlock).toHaveAttribute("href", /\/complete-purchase\?returnTo=%2Fdashboard%2Fassessments%2Fpersonality%2Fresults/);
  });

  test("C18 — a 402 elsewhere redirects to purchase with returnTo", async ({ page }) => {
    await login(page, "test.student@formmaps.dev");
    await page.route("**/api/v1/**", (route) => route.fulfill(PAYWALL_402));
    await page.goto("/dashboard/career-paths");
    await page.waitForURL(/\/complete-purchase\?returnTo=%2Fdashboard%2Fcareer-paths/, { timeout: 30000 });
  });
});

test.describe("Audit batch C — Super Admin", () => {
  test("E4 — Super Admin sees the student coverage report", async ({ page }) => {
    await login(page, "test.admin@formmaps.dev");
    const r = await api(page, "GET", "/api/v1/admin/coverage?limit=100");
    expect(r.status).toBe(200);
    expect(typeof r.json.paywallEnabled).toBe("boolean");
    const rows = r.json.data as Array<{ id: string; covered: boolean; reason: string; students: number }>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(["active_contract", "school_inactive", "status_not_active", "no_end_date", "not_started", "expired"]).toContain(row.reason);

    await page.goto("/admin/schools");
    await expect(page.getByRole("heading", { name: "Student coverage" })).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("coverage-paywall")).toBeVisible();
    await expect(page.getByTestId(`coverage-row-${rows[0].id}`)).toBeVisible({ timeout: 20000 });
  });

  test("E4 — the coverage report is Super Admin only", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const r = await api(page, "GET", "/api/v1/admin/coverage");
    expect([401, 403]).toContain(r.status);
  });
});

test.describe("Audit batch C — onboarding and invites", () => {
  test("C1 — a school admin invitation link opens, completes in two steps and never stores the password", async ({ page }) => {
    const token = `e2e-c1-${Date.now()}`;
    const email = "e2e.c1.head@example.test";
    sql(`DELETE FROM users WHERE email = '${email}'`);
    sql(`INSERT INTO schools (id, name, "adminEmail", "maxStudents", status, "isActive", "invitationToken", "invitationTokenExpiresAt", "invitedAt", "updatedAt")
         VALUES ('e2e-c1-school', 'E2E C1 School', '${email}', 25, 'invited', true, '${token}', now() + interval '1 day', now(), now())
         ON CONFLICT (id) DO UPDATE SET "invitationToken" = EXCLUDED."invitationToken", "invitationTokenExpiresAt" = EXCLUDED."invitationTokenExpiresAt", status = 'invited', "isActive" = true`);
    try {
      await page.goto(`/onboarding/school/${token}`);
      await expect(page.getByText("E2E C1 School").first()).toBeVisible({ timeout: 30000 });
      await page.locator("#name").fill("E2E C1 Head");
      await page.locator("#name").press("Enter"); // submits step 1 ("Continue")
      await page.getByPlaceholder("Enter your password").fill("E2eC1pass!");
      await page.getByPlaceholder("Confirm your password").fill("E2eC1pass!");
      const stored = await page.evaluate((t) => window.localStorage.getItem(`school_onboarding_data_${t}`) || "", token);
      expect(stored).not.toContain("E2eC1pass!");
      // The step buttons lift on hover (translate-y), so Playwright never sees them "stable"; submit with Enter instead.
      await page.getByPlaceholder("Confirm your password").press("Enter"); // "Complete Setup"
      await page.waitForURL("**/school-admin**", { timeout: 30000 });

      expect(sql(`SELECT r.name FROM users u JOIN roles r ON r.id = u."roleId" WHERE u.email = '${email}' AND u."schoolId" = 'e2e-c1-school'`)).toBe("school_admin");
      expect(sql(`SELECT status || ':' || coalesce("invitationToken", 'null') FROM schools WHERE id = 'e2e-c1-school'`)).toBe("active:null");
      const used = await page.request.get(`/authapi/school-admin/invite-status?token=${token}`);
      expect(used.status()).toBe(404);
    } finally {
      sql(`DELETE FROM users WHERE email = '${email}'`);
      sql(`DELETE FROM schools WHERE id = 'e2e-c1-school'`);
    }
  });

  test("C1 — an unknown invitation token goes to login", async ({ page }) => {
    await page.goto("/onboarding/school/e2e-no-such-token");
    await page.waitForURL("**/login**", { timeout: 30000 });
  });

  test("C2 (#252) — a pending counselor invite lists as invited, and resend issues a fresh counselor invite", async ({ browser }) => {
    const email = `e2e.c2.${Date.now()}@example.test`;
    const admin = await newPage(browser);
    await login(admin, "test.schooladmin@formmaps.dev");
    const inv = await api(admin, "POST", "/api/v1/school-admin/staff/invite", { name: "E2E C2 Counselor", email, roleName: "counselor" });
    expect([200, 201]).toContain(inv.status);
    try {
      const sa = await newPage(browser);
      await login(sa, "test.admin@formmaps.dev");
      const list = await api(sa, "GET", `/api/v1/admin/users?status=invited&search=${encodeURIComponent(email)}&limit=100`);
      expect(list.status).toBe(200);
      const items = list.json?.data?.items ?? list.json?.items ?? [];
      const row = items.find((u: { email: string }) => u.email === email);
      expect(row, "pending counselor in ?status=invited").toBeTruthy();
      expect(row.inviteStatus).toBe("invited");

      const resend = await api(sa, "POST", `/api/v1/admin/users/${row.id}/resend-invite`, {});
      expect(resend.status).toBe(200);
      expect(sql(`SELECT count(*) FROM counselor_invites WHERE email = '${email}'`)).toBe("2");
      expect(sql(`SELECT count(*) FROM counselor_invites WHERE email = '${email}' AND "expiresAt" > (now() AT TIME ZONE 'utc') AND "usedAt" IS NULL`)).toBe("1");
    } finally {
      sql(`DELETE FROM counselor_invites WHERE email = '${email}'`);
      sql(`DELETE FROM users WHERE email = '${email}'`);
    }
  });
});

test.describe("Audit batch C — academics", () => {
  test("C3 — approving a gap course adds it to the student's course plan", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    const student = userId("test.student@formmaps.dev");
    const school = sql(`SELECT "schoolId" FROM users WHERE id = '${student}'`);
    const madeYear = sql(`SELECT count(*) FROM academic_years WHERE "schoolId" = '${school}' AND "isCurrent"`) === "0";
    if (madeYear) sql(`INSERT INTO academic_years (id, "schoolId", name, "startDate", "endDate", "isCurrent", "updatedAt")
                       VALUES ('e2e-c3-year', '${school}', 'E2E current', now() - interval '60 days', now() + interval '300 days', true, now())`);
    const course = sql(`SELECT id FROM courses ORDER BY id LIMIT 1`);
    try {
      const add = await api(page, "POST", `/api/v1/school-admin/students/${student}/course-plan/courses`, { courseId: course, term: "Fall" });
      expect(add.status).toBe(201);
      expect(add.json.data.status).toBe("planned");
      const plan = await api(page, "GET", `/api/v1/school-admin/students/${student}/course-plan`);
      expect(plan.status).toBe(200);
      expect(JSON.stringify(plan.json.data)).toContain(course);
    } finally {
      sql(`DELETE FROM student_course_plans WHERE "studentId" = '${student}' AND "courseId" = '${course}' AND "createdDate" > (now() AT TIME ZONE 'utc') - interval '1 day'`);
      if (madeYear) sql(`DELETE FROM academic_years WHERE id = 'e2e-c3-year'`);
    }
  });

  test("C4 — Import Grades sends parsed CSV rows as JSON and starts a job", async ({ page }) => {
    await login(page, "test.schooladmin@formmaps.dev");
    await page.goto("/school-admin/assessments?tab=results");
    await page.getByRole("button", { name: "Import Grades" }).click();
    const csv = "student_id,student_email,course_code,semester,grade,credits,status\n,test.student@formmaps.dev,E2E101,Fall,A,3,completed\n";
    await page.locator('input[type="file"]').setInputFiles({ name: "grades.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const preview = page.getByRole("button", { name: "Preview" });
    if (await preview.isVisible().catch(() => false)) await preview.click();
    const sent = page.waitForRequest((r) => r.url().includes("/school-admin/grades/import") && r.method() === "POST");
    const answered = page.waitForResponse((r) => r.url().includes("/school-admin/grades/import") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Start Import" }).click();
    const req = await sent;
    expect(req.headers()["content-type"]).toContain("application/json");
    expect(req.postDataJSON().rows).toHaveLength(1);
    const res = await answered;
    expect(res.status()).toBe(202);
    expect((await res.json()).data.jobId).toBeTruthy();
  });
});

test.describe("Audit batch C — student", () => {
  test("C5 — a student can edit and remove a 360 rater, and a started rater is locked", async ({ page }) => {
    await login(page, "test.student@formmaps.dev");
    const me = userId("test.student@formmaps.dev");
    const stamp = Date.now();
    const mk = async (tag: string) => {
      const r = await api(page, "POST", "/evaluation/create-group", { evaluatorName: `E2E C5 ${tag}`, evaluatorEmail: `e2e.c5.${tag}.${stamp}@example.test`, relation: "Friend", groupType: "SiblingFriend", evaluatedUserId: me });
      expect([200, 201]).toContain(r.status);
      return (r.json.data?.id ?? r.json.data?.evaluationGroup?.id) as string;
    };
    const a = await mk("a");
    const b = await mk("b");
    try {
      const edited = await api(page, "PUT", `/evaluation/${a}`, { evaluatorName: "E2E C5 edited", evaluatorEmail: `e2e.c5.a2.${stamp}@example.test`, relation: "Friend", groupType: "SiblingFriend", evaluatedUserId: me });
      expect(edited.status).toBe(200);
      expect(edited.json.data.evaluatorEmail).toBe(`e2e.c5.a2.${stamp}@example.test`);
      expect(edited.json.data.invitationToken).toBeUndefined();

      expect((await api(page, "DELETE", `/evaluation/${a}`)).status).toBe(200);
      const list = await api(page, "GET", `/evaluation/user/${me}?lang=en`);
      expect(JSON.stringify(list.json)).not.toContain(`e2e.c5.a2.${stamp}`);
      expect(JSON.stringify(list.json)).toContain('"isTokenUsed"');

      sql(`UPDATE evaluation_groups SET "isTokenUsed" = true WHERE id = '${b}'`);
      const locked = await api(page, "PUT", `/evaluation/${b}`, { evaluatorName: "nope", evaluatorEmail: `e2e.c5.b2.${stamp}@example.test`, relation: "Friend", groupType: "SiblingFriend", evaluatedUserId: me });
      expect(locked.status).toBe(400);
      expect(locked.json.code).toBe("EVALUATION_STARTED");
      const lockedDel = await api(page, "DELETE", `/evaluation/${b}`);
      expect(lockedDel.status).toBe(400);
      expect(lockedDel.json.code).toBe("EVALUATION_STARTED");
    } finally {
      sql(`DELETE FROM evaluation_groups WHERE "evaluatorEmail" LIKE 'e2e.c5.%.${stamp}@example.test'`);
    }
  });

  test("C8/C8b — inviting a parent never returns a link; an onboarded parent is attached at once", async ({ page }) => {
    await login(page, "test.student@formmaps.dev");
    const me = userId("test.student@formmaps.dev");
    const fresh = `e2e.c8.${Date.now()}@example.test`;
    const hadParentLink = sql(`SELECT count(*) FROM student_parent_links WHERE "studentId" = '${me}' AND "parentEmail" = 'test.parent@formmaps.dev'`) !== "0";
    try {
      const inv = await api(page, "POST", "/api/v1/student/parents/invite", { parentEmail: fresh, parentName: "E2E C8 Parent", relation: "mother" });
      expect(inv.status).toBe(201);
      expect(inv.json.data.id).toBeTruthy();
      expect(JSON.stringify(inv.json)).not.toMatch(/invitationUrl|token=/);
      const again = await api(page, "POST", "/api/v1/student/parents/invite", { parentEmail: fresh, parentName: "E2E C8 Parent", relation: "mother" });
      expect(again.status).toBeLessThan(300);

      const list = await api(page, "GET", "/api/v1/student/parents");
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.json)).not.toContain("invitationToken");
      const rows = list.json.data as Array<{ parentEmail: string }>;
      expect(rows.filter((r) => r.parentEmail === fresh)).toHaveLength(1);

      const onboarded = await api(page, "POST", "/api/v1/student/parents/invite", { parentEmail: "test.parent@formmaps.dev", parentName: "Test Parent", relation: "father" });
      expect(onboarded.status).toBeLessThan(300);
      expect(onboarded.json.data.alreadyLinked).toBe(true);
      const after = await api(page, "GET", "/api/v1/student/parents");
      const linked = (after.json.data as Array<{ parentEmail: string; isAccepted: boolean }>).find((r) => r.parentEmail === "test.parent@formmaps.dev");
      expect(linked?.isAccepted).toBe(true);
    } finally {
      sql(`DELETE FROM student_parent_links WHERE "studentId" = '${me}' AND "parentEmail" = '${fresh}'`);
      if (!hadParentLink) sql(`DELETE FROM student_parent_links WHERE "studentId" = '${me}' AND "parentEmail" = 'test.parent@formmaps.dev'`);
    }
  });

  test("C13 — a completed 360 card links to the vocational results", async ({ page }) => {
    await login(page, "test.student@formmaps.dev");
    await page.goto("/dashboard/assessments");
    const view = page.getByRole("link", { name: /View Results/i }).filter({ has: page.locator('[href="/dashboard/assessments/vocational"]') })
      .or(page.locator('a[href="/dashboard/assessments/vocational"]'));
    await expect(view.first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('a[href="/dashboard/assessments/evaluation"]', { hasText: /View Results/i })).toHaveCount(0);
  });
});

test.describe("Audit batch C — counselor and coach", () => {
  test("C9 — a counselor can list a caseload student's parents (no token, no 403)", async ({ page }) => {
    await login(page, "test.counselor@formmaps.dev");
    const student = userId("test.student@formmaps.dev");
    const r = await api(page, "GET", `/api/v1/counselor/students/${student}/parents`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json.data)).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain("invitationToken");
    const outsider = userId("qa.lia@formmaps.dev");
    expect((await api(page, "GET", `/api/v1/counselor/students/${outsider}/parents`)).status).toBe(404);
  });

  test("C14 — a coach sees and can message a booked student, but nobody else", async ({ page }) => {
    sql(`INSERT INTO bookings (id, "coachId", "studentId", "startTime", "endTime", status, amount, currency, "isPaymentDone", "updatedAt")
         SELECT 'e2e-booking-done', c.id, s.id, now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'completed', 5000, 'USD', true, now()
         FROM coaches c JOIN users cu ON cu.id = c."userId", users s
         WHERE cu.email = 'test.coach@formmaps.dev' AND s.email = 'test.student@formmaps.dev'
         ON CONFLICT (id) DO NOTHING`);
    await login(page, "test.coach@formmaps.dev");
    const student = userId("test.student@formmaps.dev");
    const contacts = await api(page, "GET", "/api/v1/messages/contacts");
    expect(contacts.status).toBe(200);
    expect((contacts.json.data as Array<{ id: string }>).map((c) => c.id)).toContain(student);

    const conv = await api(page, "POST", "/api/v1/messages/conversations", { recipientId: student });
    expect([200, 201]).toContain(conv.status);
    expect(conv.json.data.otherParticipant.id).toBe(student);

    const stranger = await api(page, "POST", "/api/v1/messages/conversations", { recipientId: userId("test.counselor@formmaps.dev") });
    expect(stranger.status).toBeGreaterThanOrEqual(400);
  });
});
