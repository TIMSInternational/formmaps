/**
 * Audit F4 — deactivating a coach from the admin Users page cancels their paid upcoming sessions and refunds
 * them. Seeds a coach (user + coach row) with one paid future booking via psql against E2E_DB (default
 * formmaps_dev) and removes everything it created in `finally`.
 *
 * Stripe: run the Node API WITHOUT a STRIPE_SECRET_KEY (or with a test key). With no key the refund attempt
 * fails before any network call and is reported back as a refund to issue by hand — the test accepts either
 * outcome and asserts the attempt was recorded. It never needs, and must never be pointed at, live Stripe.
 *   E2E_BASE_URL=http://localhost:3090 E2E_PASSWORD=... npx playwright test e2e/audit-batch-f4.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const DB = process.env.E2E_DB || "formmaps_dev";

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

// Local seed/cleanup helper (single-row/scalar results).
function sql(query: string): string {
  return execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
}

test.describe("Audit batch F4 — coach deactivation refunds", () => {
  test("deactivating a coach from Users names, cancels and refunds their paid upcoming session", async ({ page }) => {
    const tag = `e2e-f4-${Date.now()}`;
    const userId = `${tag}-user`;
    const coachId = `${tag}-coach`;
    const bookingId = `${tag}-booking`;
    const name = `E2E Refund Coach ${tag.slice(-6)}`;
    const roleId = sql(`SELECT id FROM roles WHERE lower(name) = 'coach' LIMIT 1`);
    const student = sql(`SELECT id FROM users WHERE email = 'test.student@formmaps.dev'`);

    sql(`INSERT INTO users (id, name, email, "roleId", "roleName", "isActive", "updatedAt")
      VALUES ('${userId}', '${name}', '${tag}@example.test', '${roleId}', 'coach', true, now())`);
    sql(`INSERT INTO coaches (id, "userId", email, name, "isActive", "updatedAt") VALUES ('${coachId}', '${userId}', '${tag}@example.test', '${name}', true, now())`);
    try {
      sql(`INSERT INTO bookings (id, "coachId", "studentId", "startTime", "endTime", status, amount, currency, "isPaymentDone", "paidAt", "updatedAt")
        VALUES ('${bookingId}', '${coachId}', '${student}', now() + interval '3 days', now() + interval '3 days 1 hour', 'confirmed', 5000, 'USD', true, now(), now())`);
      sql(`INSERT INTO payments (id, "userId", "paymentIntentId", amount, currency, status, "bookingId", "updatedAt")
        VALUES ('${tag}-pay', '${student}', 'pi_${tag}', 5000, 'usd', 'succeeded', '${bookingId}', now())`);

      await login(page, "test.admin@formmaps.dev");
      await page.goto("/admin/users");
      await page.getByPlaceholder(/search users/i).fill(tag);
      const row = page.getByRole("row").filter({ hasText: name });
      await expect(row).toBeVisible({ timeout: 30000 });
      await row.getByRole("button", { name: /open menu/i }).click();
      await page.getByRole("menuitem", { name: /deactivate user/i }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("1 paid upcoming session", { timeout: 20000 });
      await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
      await expect(page.getByText(`${name} has been deactivated`)).toBeVisible({ timeout: 20000 });

      // The session is cancelled, the coach can no longer be booked, and the refund attempt is on record.
      expect(sql(`SELECT status || '|' || coalesce("cancellationReason", '') FROM bookings WHERE id = '${bookingId}'`))
        .toBe("cancelled|Coach deactivated");
      expect(sql(`SELECT "isActive"::text FROM coaches WHERE id = '${coachId}'`)).toBe("false");
      expect(sql(`SELECT "isActive"::text FROM users WHERE id = '${userId}'`)).toBe("false");
      const details = sql(`SELECT details::text FROM audit_logs WHERE action = 'COACH_BOOKINGS_CANCELLED' AND "resourceId" = '${userId}' ORDER BY "createdDate" DESC LIMIT 1`);
      expect(details).toContain(bookingId);
      const paymentStatus = sql(`SELECT status FROM payments WHERE id = '${tag}-pay'`);
      if (paymentStatus === "refunded") {
        expect(JSON.parse(details).refunded).toContain(bookingId);
      } else {
        // No Stripe key on this stack: the attempt failed and the admin is told to refund it by hand.
        expect(JSON.parse(details).refundFailed).toContain(bookingId);
        await expect(page.getByText(/Refund it manually in Stripe/)).toBeVisible();
      }
    } finally {
      sql(`DELETE FROM audit_logs WHERE "resourceId" = '${userId}'`);
      sql(`DELETE FROM payments WHERE id = '${tag}-pay'`);
      sql(`DELETE FROM bookings WHERE id = '${bookingId}'`);
      sql(`DELETE FROM coaches WHERE id = '${coachId}'`);
      sql(`DELETE FROM refresh_tokens WHERE "userId" = '${userId}'`);
      sql(`DELETE FROM users WHERE id = '${userId}'`);
    }
  });
});
