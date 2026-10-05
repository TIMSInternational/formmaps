import { test, expect, Page, BrowserContext } from "@playwright/test";

/**
 * PCA secure mode must behave like LIA's: answering the assessment never trips the
 * "Return to the assessment" warning; really leaving does.
 *
 * PCA's questions are a cross-origin TIMS survey in an iframe. Every click inside it moves
 * focus into the frame, which fires `blur` on our window — the proctoring hook used to treat
 * that as leaving, so a student answering correctly got the warning on every click.
 *
 * The TIMS create call is stubbed to return a survey served from a genuinely different origin
 * (`https://pca-e2e.timshr.com`), so the frame is cross-origin exactly as in production.
 *
 * LOCAL STACK: logs in as the local test student.
 *   E2E_BASE_URL=http://localhost:3000 E2E_PASSWORD=... npx playwright test e2e/pca-lockdown.spec.ts
 */

const PASSWORD = process.env.E2E_PASSWORD || "test1234$";
// Must be a CSP `frame-src` origin (next.config.ts); intercepted below, never hits the network.
const SURVEY = "https://pca-e2e.timshr.com/survey";

const SURVEY_HTML = `<!doctype html><html><body style="font:16px sans-serif;padding:24px">
  <h1>PCA survey</h1>
  <label><input type="radio" name="q1" value="a"> Answer A</label>
  <label><input type="radio" name="q1" value="b"> Answer B</label>
  <input id="free" placeholder="Type here">
  <button id="next" type="button">Next</button>
</body></html>`;

async function loginAsStudent(page: Page) {
  // Pre-answer the cookie banner (necessary only), which otherwise covers the login form.
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[name="email"], input[type="email"]', "test.student@formmaps.dev");
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
}

async function stubTims(page: Page) {
  await page.route(`${SURVEY}**`, (r) => r.fulfill({ contentType: "text/html", body: SURVEY_HTML }));
  await page.route("**/api/pcaapi/**", (r) =>
    r.request().url().includes("/add-evaluation")
      ? r.fulfill({ json: { success: true, data: { surveyLink: SURVEY, PcaCod: 999001 } } })
      : r.fulfill({ status: 404, json: { success: false } }),
  );
}

const warning = (page: Page) => page.getByRole("heading", { name: /Return to the assessment|Regresa a la evaluación/ });

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;

test.describe("PCA secure mode", () => {
  test.setTimeout(180_000);
  // Log in once: the API rate-limits /authapi/login, and every test needs the same student.
  let session: Session;
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await loginAsStudent(await context.newPage());
    session = await context.storageState();
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies(session.cookies);
    await page.addInitScript((origins) => {
      const here = origins.find((o) => o.origin === window.location.origin);
      for (const { name, value } of here?.localStorage ?? []) window.localStorage.setItem(name, value);
    }, session.origins);
    await stubTims(page);
    await page.goto("/dashboard/assessments/pca");
    await page.getByRole("button", { name: /Start|Resume|Comenzar|Iniciar|Reanudar/i }).last().click();
    await expect(page.locator(`iframe[src="${SURVEY}"]`)).toBeVisible({ timeout: 60_000 });
    // begin() asks for fullscreen after an await, outside the click gesture; the shell then
    // shows the return-to-fullscreen prompt, exactly as for LIA.
    const fs = page.getByRole("button", { name: /^(Enter\ fullscreen|Entrar\ en\ pantalla\ completa)$/ });
    // The prompt can flash and unmount as fullscreen resolves, so the click is best-effort.
    await fs.click({ timeout: 3000 }).catch(() => {});
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  });

  test("answering inside the survey never shows the 'left the assessment' warning", async ({ page }) => {
    const survey = page.frameLocator(`iframe[src="${SURVEY}"]`);
    await survey.getByLabel("Answer A").click();
    await survey.locator("#free").fill("my answer");
    await survey.getByRole("button", { name: "Next" }).click();
    await survey.getByLabel("Answer B").click();

    // Focus really is inside the cross-origin frame (this is what used to fire `blur`)…
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
    expect(await page.evaluate(() => document.hasFocus())).toBe(true);
    // …and the warning stays away across the hook's 1s focus poll.
    await page.waitForTimeout(2500);
    await expect(warning(page)).toHaveCount(0);

    // Clicking back on the page chrome is fine too.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(500);
    await expect(warning(page)).toHaveCount(0);
  });

  // Headless Chromium keeps every page visible and focused (Playwright emulates focus), so it
  // cannot really switch tabs or apps. These drive the hook's real listeners by making the browser
  // report what a real switch reports; the OS-level switch itself is checked in real Chrome.
  test("switching tab still shows the warning, and it clears on return", async ({ page }) => {
    await page.frameLocator(`iframe[src="${SURVEY}"]`).getByLabel("Answer A").click();
    const setHidden = (hidden: boolean) => page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

    await setHidden(true);
    await expect(warning(page)).toBeVisible();
    await setHidden(false);
    await expect(warning(page)).toHaveCount(0);
  });

  test("leaving the window from INSIDE the survey still shows the warning, and it clears on return", async ({ page }) => {
    await page.frameLocator(`iframe[src="${SURVEY}"]`).getByLabel("Answer A").click();
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
    // Alt-tab while focus is in the frame: no new blur reaches our window, only hasFocus() flips.
    await page.evaluate(() => { document.hasFocus = () => false; });
    await expect(warning(page)).toBeVisible({ timeout: 3000 });
    await page.evaluate(() => { document.hasFocus = () => true; });
    await expect(warning(page)).toHaveCount(0, { timeout: 3000 });
  });
});
