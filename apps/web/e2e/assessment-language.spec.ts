import { test, expect, Page, BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * One language per screen: an assessment's content is requested in the language its own
 * instructions are rendered in (the app's i18next language), never a separate default.
 *
 * Before: PCA's survey-language picker defaulted to Spanish on its own, so an English-speaking
 * student read English instructions and got a Spanish TIMS survey.
 *
 * LOCAL STACK: logs in as the local test student, sets its language through the real settings
 * endpoint, and restores English at the end. TIMS is stubbed (no survey is created).
 *   E2E_BASE_URL=http://localhost:3000 E2E_PASSWORD=... npx playwright test e2e/assessment-language.spec.ts
 */

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
type Lang = "en" | "es";
const LOCALES = path.join(__dirname, "../src/lib/i18n/locales");
const copy = (lang: Lang, key: string): string =>
  key.split(".").reduce((o: any, k) => o?.[k], JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "common.json"), "utf8")));

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;

async function setLanguage(page: Page, lang: Lang) {
  // The DB setting (legacy Node only — 404 on a .NET-only local stack) and the persisted store both
  // feed i18next on load; set both so the run is the same with or without the Node API.
  await page.request.put("/api/v1/user/settings", { data: { language: lang } }).catch(() => null);
  await page.evaluate((l) => {
    const raw = window.localStorage.getItem("timcare-global-store");
    const store = raw ? JSON.parse(raw) : { state: {} };
    store.state = { ...store.state, language: l === "es" ? "spanish" : "english" };
    window.localStorage.setItem("timcare-global-store", JSON.stringify(store));
    window.localStorage.setItem("i18nextLng", l);
  }, lang);
}

test.describe.configure({ mode: "serial" });

test.describe("assessment content follows the app language", () => {
  test.setTimeout(180_000);

  // Log in once: the API rate-limits /authapi/login.
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
      version: "1.0", timestamp: new Date().toISOString(),
      preferences: { necessary: true, analytics: false, marketing: false },
    })));
    await page.goto("/login");
    await page.fill('input[type="email"]', "test.student@formmaps.dev");
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 30_000 });
    session = await context.storageState();
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(session.cookies);
    // Seed the session once per tab; re-seeding on every navigation would undo setLanguage().
    await page.addInitScript((origins) => {
      if (window.sessionStorage.getItem("e2e-seeded")) return;
      window.sessionStorage.setItem("e2e-seeded", "1");
      const here = origins.find((o) => o.origin === window.location.origin);
      for (const { name, value } of here?.localStorage ?? []) window.localStorage.setItem(name, value);
    }, session.origins);
    await page.route("**/api/pcaapi/**", (r) =>
      r.request().url().includes("/add-evaluation")
        ? r.fulfill({ json: { success: false, message: "e2e: survey not created" } })
        : r.fulfill({ status: 404, json: { success: false } }),
    );
    await page.goto("/dashboard");
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: session });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await setLanguage(page, "en");
    await context.close();
  });

  for (const lang of ["en", "es"] as Lang[]) {
    test(`${lang}: PCA instructions, picker and survey request share one language`, async ({ page }) => {
      await setLanguage(page, lang);
      await page.goto("/dashboard/assessments/pca");
      await expect(page.getByRole("heading", { name: copy(lang, "dashboard.pcaTitle") })).toBeVisible({ timeout: 60_000 });

      const req = page.waitForRequest((r) => r.url().includes("/api/pcaapi/add-evaluation"));
      await page.getByRole("button", { name: copy(lang, "dashboard.startPCA") }).click();
      expect(new URL((await req).url()).searchParams.get("lang")).toBe(lang === "es" ? "sp" : "en");

      const ownLabel = copy(lang, lang === "es" ? "language.spanish" : "language.english");
      await expect(page.getByRole("button", { name: new RegExp(ownLabel) })).toHaveAttribute("aria-pressed", "true");
    });
  }

  test("switching PCA's language switches the instructions too, then the survey request", async ({ page }) => {
    await setLanguage(page, "en");
    await page.goto("/dashboard/assessments/pca");
    await expect(page.getByRole("heading", { name: copy("en", "dashboard.pcaTitle") })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: new RegExp(copy("en", "language.spanish")) }).click();
    await expect(page.getByRole("heading", { name: copy("es", "dashboard.pcaTitle") })).toBeVisible();
    await expect(page.getByText(copy("es", "dashboard.assessmentConfiguration"))).toBeVisible();

    const req = page.waitForRequest((r) => r.url().includes("/api/pcaapi/add-evaluation"));
    await page.getByRole("button", { name: copy("es", "dashboard.startPCA") }).click();
    expect(new URL((await req).url()).searchParams.get("lang")).toBe("sp");
  });

  for (const lang of ["en", "es"] as Lang[]) {
    test(`${lang}: the personality session starts in the app language`, async ({ page }) => {
      await setLanguage(page, lang);
      // The local test student has already finished it; pretend not, and capture the start
      // request without creating a session.
      await page.route("**/api/v1/personality/access", (r) =>
        r.fulfill({ json: { success: true, data: { has_access: true, has_completed: false } } }));
      await page.route("**/api/v1/personality/start", (r) => r.fulfill({ status: 503, json: { success: false } }));
      const start = page.waitForRequest(
        (r) => r.method() === "POST" && r.url().includes("/api/v1/personality/start"),
        { timeout: 90_000 },
      );
      await page.goto("/dashboard/assessments/personality");
      const body = (await start).postDataJSON() as { language?: string };
      expect(body.language).toBe(lang);
    });
  }
});
