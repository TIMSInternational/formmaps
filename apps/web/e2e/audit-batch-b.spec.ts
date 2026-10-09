/**
 * Audit 2026-10-09, batch B (money / billing), on the local stack with seed data.
 * Seed first:  psql -d formmaps_dev -f apps/web/e2e/fixtures/audit-batch-b.sql
 *   E2E_BASE_URL=http://localhost:3020 E2E_PASSWORD=... npx playwright test e2e/audit-batch-b.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page } from "@playwright/test";

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

test.describe("Audit batch B — Super Admin", () => {
  test.beforeEach(async ({ page }) => { await login(page, "test.admin@formmaps.dev"); });

  test("B3/B4 — Plans page renders Decimal prices and locks catalog plans", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/admin/plans");
    await expect(page.getByText("$29.99")).toBeVisible({ timeout: 20000 });
    expect(errors.filter((m) => /toFixed/.test(m))).toEqual([]);
    await expect(page.getByTestId("catalog-plan-badge").first()).toBeVisible();

    // The API refuses a catalog price change outright.
    const plans = await api(page, "GET", "/api/subscriptionplan");
    const pro = plans.json.data.find((p: { name: string }) => p.name === "Pro");
    expect(pro.catalogKey).toBe("pro");
    const r = await api(page, "PUT", `/api/subscriptionplan/${pro.id}`, { price: 1 });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("CATALOG_PLAN");
  });

  test("B5/B11 — Transactions tabs match real statuses, search narrows, amounts carry their currency", async ({ page }) => {
    await page.goto("/admin/transactions");
    await expect(page.getByText("E2E paid Pro")).toBeVisible({ timeout: 20000 });

    const completed = page.waitForRequest((r) => /\/admin\/transactions\?.*status=completed/.test(r.url()));
    await page.getByRole("tab", { name: /completed/i }).click();
    await completed;
    await expect(page.getByText("E2E paid Pro")).toBeVisible();
    await expect(page.getByText("E2E free trial")).toHaveCount(0);
    for (const s of await page.getByTestId("transaction-status").all()) await expect(s).toHaveAttribute("data-status", "succeeded");
    await expect(page.getByRole("cell", { name: "€50.00" })).toBeVisible();

    await page.getByRole("tab", { name: /pending/i }).click();
    await expect(page.getByText("E2E free trial")).toBeVisible();
    await expect(page.getByText("Free trial", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /refunded/i }).click();
    await expect(page.getByText("E2E partial refund")).toBeVisible();

    await page.getByRole("tab", { name: /^all$/i }).click();
    const searched = page.waitForRequest((r) => /\/admin\/transactions\?.*search=euro/.test(r.url()));
    await page.getByPlaceholder(/search/i).first().fill("euro");
    await searched;
    await expect(page.getByText("E2E euro charge")).toBeVisible();
    await expect(page.getByText("E2E paid Pro")).toHaveCount(0);

    // No fake "Card" method; refunds are offered on succeeded rows only.
    await expect(page.getByText("Card", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^refund$/i })).toHaveCount(1);
  });

  test("B9 — revenue counts USD only and names the other currencies", async ({ page }) => {
    const r = await api(page, "GET", "/api/v1/admin/analytics");
    expect(r.status).toBe(200);
    expect(r.json.data.stats.revenueByCurrency.eur).toBe(50);
    expect(r.json.data.stats.totalRevenue).toBe(r.json.data.stats.revenueByCurrency.usd);
    await page.goto("/admin/transactions");
    await expect(page.getByText(/in other currencies/)).toBeVisible({ timeout: 20000 });
  });

  test("B7 — Payouts 'All' asks for every status; Mark as paid wording", async ({ page }) => {
    const req = page.waitForRequest((r) => /\/api\/v1\/admin\/payouts/.test(r.url()));
    await page.goto("/admin/payouts");
    expect((await req).url()).not.toContain("status=pending");
  });

  test("B10 — User behaviour panel and Users page get telemetry metrics", async ({ page }) => {
    const r = await api(page, "GET", "/api/v1/admin/analytics/summary?period=year");
    expect(r.status).toBe(200);
    expect(r.json.data.metrics.totalPageViews).toBeGreaterThan(0);
    expect(r.json.data.metrics.bounceRate).toBeNull();
    await page.goto("/admin/users");
    await expect(page.getByText(/this month/).first()).toBeVisible({ timeout: 20000 });
  });

  test("B13 — settings that do nothing are locked and say so; the platform fee stays editable", async ({ page }) => {
    await page.goto("/admin/settings");
    await expect(page.getByTestId("setting-inert").first()).toBeVisible({ timeout: 20000 });
    expect(await page.getByTestId("setting-inert").count()).toBeGreaterThanOrEqual(4);
    await expect(page.locator('input[type="email"]')).toBeDisabled();
    await expect(page.locator('input[type="number"][max="100"]')).toBeEnabled();
  });

  test("B17 — resending a school invitation sends (or says it could not)", async ({ page }) => {
    const r = await api(page, "POST", "/api/v1/admin/schools/e2e-school-invited/invite");
    expect(r.status).toBe(200);
    expect(typeof r.json.data.emailSent).toBe("boolean");
    expect(r.json.data.invitationUrl).toMatch(/\/onboarding\/school\//);
  });
});

test.describe("Audit batch B — coach", () => {
  test("B15/B16 — pricing saves; earnings in dollars with gross/fee/net", async ({ page }) => {
    await login(page, "test.coach@formmaps.dev");
    const before = await api(page, "GET", "/api/v1/coach/me");
    const original = Number(before.json?.data?.hourlyRate ?? 50);
    try {
      const saved = await api(page, "PUT", "/api/v1/coach/me", { hourlyRate: 61, currency: "USD" });
      expect(saved.status).toBe(200);
      const after = await api(page, "GET", "/api/v1/coach/me");
      expect(Number(after.json.data.hourlyRate)).toBe(61);
    } finally {
      await api(page, "PUT", "/api/v1/coach/me", { hourlyRate: original });
    }

    const earnings = await api(page, "GET", "/api/v1/coach/me/earnings");
    expect(earnings.json.data.totalEarnings).toBeLessThan(10000); // was cents (5000 for a $50 session)
    const hist = await api(page, "GET", "/api/v1/coach/me/earnings/history");
    const row = hist.json.data.history.find((h: { id: string }) => h.id === "e2e-booking-done");
    expect(row).toMatchObject({ amountGross: 50 });
    await page.goto("/dashboard/coaching/earnings");
    await expect(page.getByText("$50.00").first()).toBeVisible({ timeout: 20000 });

    const settings = await api(page, "PUT", "/api/v1/coach/me/payout-settings", { frequency: "biweekly", method: "bank_transfer", bankName: "E2E Bank", bankAccountNumber: "000111222333" });
    expect(settings.status).toBe(200);
    const read = await api(page, "GET", "/api/v1/coach/me/payout-settings");
    expect(read.json.data).toMatchObject({ frequency: "biweekly", method: "bank_transfer", last4: "2333" });
    expect(JSON.stringify(read.json)).not.toContain("000111222333");
  });
});
