/**
 * Audit 2026-10-09, decision D3 — manual monthly coach payouts, on the local stack with seed data.
 * Seeds a coach with two paid, completed sessions and one refunded session in March 2001 (a month no other data
 * uses) with psql against E2E_DB (default formmaps_dev), and removes everything it created in `finally`.
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-e3.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const DB = process.env.E2E_DB || "formmaps_dev";
const MONTH = "2001-03";

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

// Local seed/cleanup helper (single-row/scalar results).
function sql(query: string): string {
  return execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
}

test.describe("Audit batch E3 — manual monthly coach payouts", () => {
  test("D3 — generate the month (refund excluded, commission taken), idempotently, then mark it paid", async ({ page }) => {
    const tag = `e2e-e3-${Date.now()}`;
    const coachId = `${tag}-coach`;
    const coachName = `E2E Payout Coach ${tag.slice(-6)}`;
    const student = sql(`SELECT id FROM users WHERE email = 'test.student@formmaps.dev'`);
    const booking = (id: string) => sql(`INSERT INTO bookings (id, "coachId", "studentId", "startTime", "endTime", status, amount, currency, "isPaymentDone", "paidAt", "completedAt", "updatedAt")
      VALUES ('${tag}-${id}', '${coachId}', '${student}', '2001-03-10 09:00', '2001-03-10 10:00', 'completed', 5000, 'USD', true, '2001-03-01', '2001-03-10 10:00', now())`);
    const payment = (id: string, status: string) => sql(`INSERT INTO payments (id, "userId", "paymentIntentId", amount, currency, status, "bookingId", "updatedAt")
      VALUES ('${tag}-pay-${id}', '${student}', 'pi_${tag}_${id}', 5000, 'usd', '${status}', '${tag}-${id}', now())`);

    sql(`INSERT INTO coaches (id, "userId", email, name, "platformCommission", "updatedAt") VALUES ('${coachId}', '${tag}-user', '${tag}@example.test', '${coachName}', 20, now())`);
    try {
      booking("a"); booking("b"); booking("refunded");
      payment("a", "succeeded"); payment("b", "succeeded"); payment("refunded", "refunded");

      await login(page, "test.admin@formmaps.dev");
      await page.goto("/admin/payouts");
      const panel = page.getByTestId("monthly-payouts");
      await expect(panel).toBeVisible({ timeout: 30000 });
      await panel.getByLabel("Month").fill(MONTH);

      const row = panel.getByTestId("monthly-payout-row").filter({ hasText: coachName });
      await expect(row).toBeVisible({ timeout: 20000 });
      // Two paid sessions of $50 (the refunded one is out), minus 20% commission.
      await expect(row.getByRole("cell").nth(1)).toHaveText("2");
      await expect(row.getByTestId("monthly-payout-net")).toHaveText("$80.00");
      await expect(row).toContainText("Not generated");

      await panel.getByRole("button", { name: "Generate payouts" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Generate", exact: true }).click();
      await expect(row).toContainText("Pending", { timeout: 20000 });

      const again = await api(page, "POST", "/api/v1/admin/payouts/generate", { month: MONTH });
      expect(again.status).toBe(200);
      expect(again.json.data.created).toBe(0);
      expect(Number(sql(`SELECT count(*) FROM payouts WHERE "coachId" = '${coachId}'`))).toBe(1);

      await row.getByRole("button", { name: /Mark as paid/ }).click();
      const dialog = page.getByTestId("mark-paid-dialog");
      await expect(dialog).toContainText("$80.00");
      await dialog.getByLabel("Date paid").fill("2001-04-05");
      await dialog.getByLabel("Reference (optional)").fill("TRF-E2E-1");
      await dialog.getByRole("button", { name: "Mark as paid" }).click();
      await expect(row).toContainText("Paid", { timeout: 20000 });
      await expect(row).toContainText("TRF-E2E-1");

      const view = await api(page, "GET", `/api/v1/admin/payouts/monthly?month=${MONTH}`);
      const mine = view.json.data.rows.find((r: { coachId: string }) => r.coachId === coachId);
      expect(mine.payout).toMatchObject({ status: "completed", netCents: 8000, commissionCents: 2000, reference: "TRF-E2E-1" });
      expect(mine.payout.paidAt.slice(0, 10)).toBe("2001-04-05");
      // A paid payout is never rewritten by a later run.
      const third = await api(page, "POST", "/api/v1/admin/payouts/generate", { month: MONTH });
      expect(third.json.data.locked).toBe(1);
    } finally {
      const payoutIds = sql(`SELECT coalesce(string_agg(quote_literal(id), ','), '''''') FROM payouts WHERE "coachId" = '${coachId}'`);
      sql(`DELETE FROM audit_logs WHERE (action = 'PAYOUT_GENERATE' AND "resourceId" = '${MONTH}') OR (action = 'PAYOUT_APPROVE' AND "resourceId" IN (${payoutIds}))`);
      sql(`DELETE FROM payouts WHERE "coachId" = '${coachId}'`);
      sql(`DELETE FROM payments WHERE id LIKE '${tag}-pay-%'`);
      sql(`DELETE FROM bookings WHERE id LIKE '${tag}-%'`);
      sql(`DELETE FROM coaches WHERE id = '${coachId}'`);
    }
  });
});
