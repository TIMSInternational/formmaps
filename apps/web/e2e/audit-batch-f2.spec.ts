/**
 * Audit 2026-10-09, batch F2 (language polish), on the local stack with seed data.
 * Seeds what it needs with psql against E2E_DB (default formmaps_dev) and restores it.
 *   E2E_BASE_URL=http://localhost:3070 E2E_PASSWORD=... npx playwright test e2e/audit-batch-f2.spec.ts --project=chromium --workers=1
 */
import { test, expect, Page, Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
const DB = process.env.E2E_DB || "formmaps_dev";
const sql = (query: string): string =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-Atqc", query], { encoding: "utf8" }).trim();
const userId = (email: string) => sql(`SELECT id FROM users WHERE email = '${email}'`);

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

async function api(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const token = JSON.parse(window.localStorage.getItem("timcare-global-store") || "{}").state?.user?.accessToken;
    const r = await fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const type = r.headers.get("content-type") || "";
    if (type.includes("pdf")) return { status: r.status, bytes: Array.from(new Uint8Array(await r.arrayBuffer())) };
    return { status: r.status, json: await r.json().catch(() => null) };
  }, path);
}

async function loginPageHeading(browser: Browser, locale: string): Promise<string> {
  const ctx = await browser.newContext({ locale });
  const page = await ctx.newPage();
  await page.goto("/login");
  // The form's heading (the first heading on the page is the brand panel's tagline).
  const heading = page.getByRole("heading", { name: /^(Hola de nuevo|Welcome back)$/ });
  await expect(heading).toBeVisible({ timeout: 30000 });
  // Let the detector + provider settle on the final language.
  await page.waitForTimeout(500);
  const text = (await heading.textContent()) ?? "";
  await ctx.close();
  return text.trim();
}

test.describe("Audit batch F2 — language", () => {
  test("the login page follows the browser: Spanish for es-*, English for en-*, Spanish for anything else", async ({ browser }) => {
    expect(await loginPageHeading(browser, "es-CO")).toBe("Hola de nuevo");
    expect(await loginPageHeading(browser, "en-US")).toBe("Welcome back");
    expect(await loginPageHeading(browser, "fr-FR")).toBe("Hola de nuevo");
  });

  test("a Spanish school admin reads a generated alert in Spanish", async ({ page }) => {
    const admin = userId("test.schooladmin@formmaps.dev");
    const student = userId("test.student@formmaps.dev");
    const before = sql(`SELECT language FROM user_settings WHERE "userId" = '${admin}'`);
    const tag = `e2e-f2-${Date.now()}`;
    sql(`UPDATE user_settings SET language = 'es' WHERE "userId" = '${admin}'`);
    try {
      await login(page, "test.schooladmin@formmaps.dev");
      // Run (and debounce) the generator first so it cannot resolve the seeded row mid-test.
      expect((await api(page, "/api/v1/alerts?limit=1")).status).toBe(200);
      sql(`INSERT INTO student_alerts (id, "schoolId", "studentId", type, severity, title, message, details, "createdBy", "updatedAt")
        VALUES ('${tag}', 'test-school-1', '${student}', 'low_gpa', 'high', 'Low GPA', 'GPA is 1.11 — below the 2.0 threshold.',
        '{"i18n":{"key":"low_gpa","params":{"gpa":"1.11"}}}', '${tag}', now())`);
      const list = await api(page, "/api/v1/alerts?limit=50");
      const row = (list.json.data.data as Array<{ id: string; details: string | null }>).find((a) => a.id === tag);
      expect(row?.details).toContain('"key":"low_gpa"');
      await page.goto("/school-admin/messages?tab=alerts");
      await expect(page.getByText("El promedio es 1.11, por debajo del mínimo de 2.0.").first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText("GPA is 1.11 — below the 2.0 threshold.")).toHaveCount(0);
    } finally {
      sql(`DELETE FROM student_alerts WHERE id = '${tag}'`);
      sql(`UPDATE user_settings SET language = '${before || "en"}' WHERE "userId" = '${admin}'`);
    }
  });

  test("the Personality answers PDF draws no missing glyph (the Detail column read 'EI ⊠ E')", async ({ page }) => {
    const student = userId("test.student@formmaps.dev");
    await login(page, "test.schooladmin@formmaps.dev");
    const r = await api(page, `/api/v1/student-record/${student}/answers/personality/pdf?lang=es`);
    expect(r.status).toBe(200);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(r.bytes!) }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    expect(text).toMatch(/[EI] -> [EI]|[SN] -> [SN]|[TF] -> [TF]|[JP] -> [JP]/);
    expect(text).not.toContain("→");
    expect(text).not.toContain("⊠");
  });
});
