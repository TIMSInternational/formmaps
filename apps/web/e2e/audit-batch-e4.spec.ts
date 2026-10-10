/**
 * Audit 2026-10-09, batch E — E5 complimentary access (decision D6), on the local stack with seed data.
 * A Super Admin grants an independent student 30 days of free access from the user detail dialog; the
 * student's entitlement then reports "complimentary" (full access, its expiry); Revoke puts the student
 * back exactly where they were. Seeds a throw-away independent student with psql against E2E_DB (default
 * formmaps_dev) and deletes it — with its grants and audit rows — in finally.
 * Needs prisma/migrations/20261010120000_complimentary_access applied to that database.
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-e4.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page, Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const DAY = 24 * 60 * 60 * 1000;

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

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe("Audit batch E — E5 complimentary access", () => {
  test("Super Admin grants a student 30 days free; entitlement says complimentary; Revoke restores the student", async ({ browser }) => {
    const tag = `e2e-e4-${Date.now()}`;
    const email = `${tag}@formmaps.dev`;
    // A copy of the seed student (same password) with no school: an independent student, the paying audience.
    sql(`INSERT INTO users SELECT (jsonb_populate_record(NULL::users, to_jsonb(u) || jsonb_build_object(
           'id', '${tag}', 'email', '${email}', 'name', 'E2E Comp ${tag.slice(-6)}', 'schoolId', NULL, 'stripeCustomerId', NULL))).*
         FROM users u WHERE u.email = 'test.student@formmaps.dev'`);
    const student = await newPage(browser);
    const admin = await newPage(browser);
    try {
      await login(student.page, email);
      const before = (await api(student.page, "GET", "/api/v1/user/subscription/status")).json.data;
      expect(before.isComplimentary).toBeUndefined();
      expect(before.planId).not.toBe("complimentary");

      // Grant from the admin UI: Users → search → open the student → Grant free access (30 days by default).
      await login(admin.page, "test.admin@formmaps.dev");
      await admin.page.goto("/admin/users");
      await admin.page.getByPlaceholder("Search users...").fill(email);
      await admin.page.getByRole("row").filter({ hasText: email }).first().click({ timeout: 30000 });
      const panel = admin.page.getByTestId("complimentary-access");
      await expect(panel.getByLabel("Days")).toHaveValue("30");
      await panel.getByRole("button", { name: "Grant free access" }).click();
      await expect(panel.getByTestId("complimentary-badge")).toContainText("Complimentary until", { timeout: 30000 });

      const [startsAt, expiresAt] = sql(`SELECT extract(epoch from "startsAt")*1000 || '|' || extract(epoch from "expiresAt")*1000
        FROM complimentary_access_grants WHERE "userId" = '${tag}' AND "revokedAt" IS NULL`).split("|").map(Number);
      expect(Math.round(expiresAt - startsAt)).toBe(30 * DAY);
      expect(sql(`SELECT count(*) FROM audit_logs WHERE action = 'COMPLIMENTARY_ACCESS_GRANT' AND "resourceId" = '${tag}'`)).toBe("1");
      // Never a sale: no subscription row, no payment row.
      expect(sql(`SELECT count(*) FROM user_subscriptions WHERE "userId" = '${tag}'`)).toBe("0");
      expect(sql(`SELECT count(*) FROM payments WHERE "userId" = '${tag}'`)).toBe("0");

      const granted = (await api(student.page, "GET", "/api/v1/user/subscription/status")).json.data;
      expect(granted).toMatchObject({ hasActiveSubscription: true, hasPaidAccess: true, planId: "complimentary", isComplimentary: true });
      expect(Math.abs(new Date(granted.expiryDate).getTime() - expiresAt)).toBeLessThan(1000);
      expect((await api(student.page, "GET", "/api/v1/entitlement/results-preview")).json.data.resultsLocked).toBe(false);

      // Revoke from the same dialog.
      await panel.getByRole("button", { name: "Revoke" }).click();
      await admin.page.getByRole("alertdialog").or(admin.page.getByRole("dialog").last())
        .getByRole("button", { name: "Revoke" }).last().click();
      await expect(panel.getByRole("button", { name: "Grant free access" })).toBeVisible({ timeout: 30000 });
      expect(sql(`SELECT count(*) FROM complimentary_access_grants WHERE "userId" = '${tag}' AND "revokedAt" IS NOT NULL`)).toBe("1");

      const after = (await api(student.page, "GET", "/api/v1/user/subscription/status")).json.data;
      expect({ has: after.hasActiveSubscription, plan: after.planId, comp: after.isComplimentary })
        .toEqual({ has: before.hasActiveSubscription, plan: before.planId, comp: before.isComplimentary });
    } finally {
      await student.context.close();
      await admin.context.close();
      sql(`DELETE FROM audit_logs WHERE "resourceId" = '${tag}'`);
      sql(`DELETE FROM users WHERE id = '${tag}'`); // grants, tokens, consents cascade
    }
  });
});
