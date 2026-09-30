import { test, expect, Browser, BrowserContext, Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Language + grammar sweep. Signs in as each role, switches the account's language through the
 * real settings API, walks that role's pages in English and in Spanish, and fails on:
 *   - raw i18n keys or unrendered {{interpolation}} on screen;
 *   - a line of the OTHER language's locale copy (untranslated / hardcoded text);
 *   - any string from the grammar audit's list of known-bad copy (regressions);
 *   - (es) English sentences — function-word heuristic for hardcoded English outside the locales.
 * Plus the 360: every vocational question a student (and, given tokens, a parent / teacher /
 * sibling-friend evaluator) reads is compared with the corrected instrument text.
 *
 * LOCAL STACK ONLY — it changes the fixture accounts' language setting. Refuses any other host.
 *   E2E_BASE_URL=http://localhost:3010 E2E_PASSWORD=... npx playwright test e2e/i18n-grammar.spec.ts
 * Optional: E2E_360_TOKENS='{"parent":"…","teacher":"…","sibling_friend":"…"}' (tokens are not
 * readable by a student, so the harness creates those groups and passes them in).
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.E2E_PASSWORD || "Test1234!";
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE_URL);
const LOCALES = path.join(__dirname, "../src/lib/i18n/locales");
const FIXTURES = path.join(__dirname, "fixtures");
const REPORT_DIR = process.env.E2E_REPORT_DIR;

type Lang = "en" | "es";
type Issue = { page: string; lang: Lang; kind: string; text: string };

const ROLES: { name: string; email: string; pages: string[] }[] = [
  {
    name: "student", email: "test.student@formmaps.dev",
    pages: ["/dashboard", "/dashboard/assessments", "/dashboard/assessments/evaluation",
      "/dashboard/assessments/lia", "/dashboard/assessments/pca", "/dashboard/assessments/personality",
      "/dashboard/timeline", "/dashboard/course-plan", "/dashboard/university", "/dashboard/career-paths",
      "/dashboard/profile", "/dashboard/settings", "/dashboard/book-counselor", "/dashboard/my-sessions",
      "/dashboard/messages", "/dashboard/applications", "/dashboard/test-scores", "/dashboard/recommendations",
      "/dashboard/community-service", "/dashboard/resume-builder", "/dashboard/resumes",
      "/dashboard/portfolio", "/dashboard/learning", "/dashboard/timeline", "/dashboard/transcript",
      "/dashboard/subscriptions", "/dashboard/video", "/dashboard/book-coach", "/this-page-does-not-exist"],
  },
  { name: "parent", email: "test.parent@formmaps.dev",
    pages: ["/parent", "/parent/children", "/parent/evaluations", "/parent/notifications"] },
  { name: "teacher", email: "test.teacher@formmaps.dev",
    pages: ["/teacher", "/teacher/evaluations", "/teacher/recommendations"] },
  { name: "counselor", email: "test.counselor@formmaps.dev",
    pages: ["/counselor", "/counselor/students", "/counselor/evaluations", "/counselor/messages",
      "/counselor/calendar", "/counselor/reports", "/counselor/settings", "/counselor/academic-gaps",
      "/counselor/academics", "/counselor/activities", "/counselor/alerts", "/counselor/assessments",
      "/counselor/college-apps", "/counselor/college-list", "/counselor/college-prep", "/counselor/communication",
      "/counselor/documents", "/counselor/essays", "/counselor/insights", "/counselor/notes",
      "/counselor/recommendations", "/counselor/scheduling", "/counselor/scholarships", "/counselor/sessions",
      "/counselor/video"] },
  { name: "school-admin", email: "test.schooladmin@formmaps.dev",
    pages: ["/school-admin", "/school-admin/users", "/school-admin/parents", "/school-admin/academics",
      "/school-admin/assessments", "/school-admin/analytics", "/school-admin/insights",
      "/school-admin/reports", "/school-admin/settings", "/school-admin/academic-gaps", "/school-admin/alerts",
      "/school-admin/calendar", "/school-admin/counselor-students", "/school-admin/counselor-workload",
      "/school-admin/courses", "/school-admin/curriculum", "/school-admin/data-mappings",
      "/school-admin/evaluations", "/school-admin/gpa-config", "/school-admin/grades", "/school-admin/graduation",
      "/school-admin/integrations", "/school-admin/messages", "/school-admin/notes", "/school-admin/profile",
      "/school-admin/recommendations", "/school-admin/results", "/school-admin/students", "/school-admin/video"] },
  { name: "coach", email: "test.coach@formmaps.dev",
    pages: ["/dashboard/coaching", "/dashboard/coaching/analytics", "/dashboard/coaching/calendar",
      "/dashboard/coaching/earnings", "/dashboard/coaching/messages", "/dashboard/coaching/profile",
      "/dashboard/coaching/recommendations", "/dashboard/coaching/schedule", "/dashboard/coaching/sessions",
      "/dashboard/coaching/settings", "/dashboard/coaching/students"] },
  { name: "platform-admin", email: "test.admin@formmaps.dev",
    pages: ["/admin", "/admin/analytics", "/admin/careers", "/admin/coaches", "/admin/courses", "/admin/payouts",
      "/admin/plans", "/admin/questions", "/admin/schools", "/admin/settings", "/admin/transactions", "/admin/users"] },
];

// Signed-out pages: their language comes from the browser (the cached i18nextLng), not an account.
const PUBLIC_PAGES = ["/login", "/signup", "/forgot-password", "/terms", "/privacy", "/subscribe"];

// ---------------------------------------------------------------- locale-derived expectations
function flatten(o: Record<string, unknown>, p = "", acc: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? `${p}.${k}` : k;
    if (v && typeof v === "object") flatten(v as Record<string, unknown>, kk, acc);
    else if (typeof v === "string") acc[kk] = v;
  }
  return acc;
}
function loadLocale(lang: Lang) {
  const all: Record<string, string> = {};
  for (const f of fs.readdirSync(path.join(LOCALES, lang))) {
    const ns = f.replace(/\.json$/, "");
    const flat = flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, f), "utf8")));
    for (const [k, v] of Object.entries(flat)) all[`${ns}:${k}`] = v;
  }
  return all;
}
const en = loadLocale("en");
const es = loadLocale("es");
const keyPaths = new Set(Object.keys(en).map((k) => k.split(":")[1]));
const esValues = new Set(Object.values(es).map((v) => v.trim()));
const enValues = new Set(Object.values(en).map((v) => v.trim()));
const isSentenceLike = (s: string) => !/\{\{|<\d|\n/.test(s) && s.length >= 12 && s.trim().split(/\s+/).length >= 2;
// Copy that exists ONLY in one language's locale: seeing it in the other language is a leak.
const enOnly = new Set([...enValues].filter((v) => isSentenceLike(v) && !esValues.has(v)));
const esOnly = new Set([...esValues].filter((v) => isSentenceLike(v) && !enValues.has(v)));

const regressions: Record<Lang, string[]> = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "i18n-grammar-regressions.json"), "utf8"),
);
// lang → variant → question number → corrected text + the option labels / scale anchors it must show.
type Instrument = Record<string, Record<string, { text: string; labels: string[] }>>;
const instrument360: Partial<Record<Lang, Instrument>> = {};
for (const l of ["es", "en"] as Lang[]) {
  const f = path.join(FIXTURES, `vocational-360-${l}.json`);
  if (fs.existsSync(f)) instrument360[l] = JSON.parse(fs.readFileSync(f, "utf8"));
}

// Hardcoded English outside the locales: a line that reads as an English sentence.
const EN_WORDS = new Set(("the and your you to of with for is are this that will be from on in an have has not yet " +
  "all can please click here our we it its by or at as was were been no there their them they what when " +
  "how which who get start view see back complete completed failed loading try again").split(" "));
const ES_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|que|y|en|un|una|tu|tus|para|con|por|no|se|es|al|más|aún)\b/i;
// Free text that fixture users typed into the local DB (recommendation requests, decline reasons).
// It is user content, not UI copy, so its language is not the app's to translate.
const USER_CONTENT = ["Please write me a recommendation for college.", "I cannot write this letter at this time"];

// Profile content on specific pages: the demo coaches' tags come from seedDemoCoaches.ts and real
// coaches type their own, so their language is the coach's, not the UI's. Scoped per page so the
// same words elsewhere (e.g. booking topics) are still checked.
const PAGE_CONTENT: Record<string, string[]> = {
  "/dashboard/book-coach": ["Financial Aid", "Career Planning", "Interview Prep"],
};

// Platform-admin catalog tables list catalog RECORDS (course categories, career titles) exactly as
// stored — data in its source language, not UI copy. Only the other-language-copy check is skipped
// there; raw keys, {{vars}}, regressions and English-sentence detection still apply.
const DATA_TABLE_PAGES = new Set(["/admin/careers", "/admin/courses"]);

function looksEnglish(line: string) {
  if (USER_CONTENT.some((u) => line.includes(u))) return false;
  const words = line.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 3 || ES_HINT.test(line)) return false;
  const hits = words.filter((w) => EN_WORDS.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.25;
}

// ---------------------------------------------------------------- page helpers
async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
}

// One sign-in per account per run: the auth API rate-limits repeated sign-ins per identity, and
// 14 tests signing in back to back trip it. Tests reuse the signed-in storage state instead.
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<string, StorageState>();
async function signedIn(browser: Browser, email: string): Promise<{ page: Page; context: BrowserContext }> {
  let state = sessions.get(email);
  if (!state) {
    const first = await browser.newContext();
    await login(await first.newPage(), email);
    state = await first.storageState();
    await first.close();
    sessions.set(email, state);
  }
  const context = await browser.newContext({ storageState: state });
  return { page: await context.newPage(), context };
}

async function setLanguage(page: Page, lang: Lang) {
  // Same call the settings page makes; the app re-applies the saved language on every load.
  const res = await page.request.put("/api/v1/user/settings", { data: { language: lang } });
  expect(res.ok(), `PUT /api/v1/user/settings → ${res.status()}`).toBeTruthy();
  await page.evaluate((l) => {
    try {
      const raw = window.localStorage.getItem("timcare-global-store");
      const store = raw ? JSON.parse(raw) : { state: {} };
      store.state = { ...store.state, language: l === "es" ? "spanish" : "english" };
      window.localStorage.setItem("timcare-global-store", JSON.stringify(store));
      window.localStorage.setItem("i18nextLng", l);
    } catch { /* storage unavailable — the settings API still wins on load */ }
  }, lang);
}

async function htmlLangIssue(page: Page, lang: Lang, pageName: string): Promise<Issue[]> {
  const actual = await page.getAttribute("html", "lang");
  return actual === lang ? [] : [{ page: pageName, lang, kind: "html-lang", text: `<html lang="${actual}">` }];
}

async function visibleLines(page: Page) {
  const text = await page.innerText("body");
  return [...new Set(text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function check(lines: string[], lang: Lang, pageName: string): Issue[] {
  const issues: Issue[] = [];
  const add = (kind: string, text: string) => issues.push({ page: pageName, lang, kind, text });
  const other = lang === "es" ? enOnly : esOnly;
  const bad = new Set(regressions[lang]);
  const pageContent = new Set(PAGE_CONTENT[pageName] ?? []);
  for (const line of lines) {
    if (pageContent.has(line)) continue;
    if (/\{\{|\}\}/.test(line)) add("unrendered-interpolation", line);
    if (keyPaths.has(line) || /^(common|student|parent|counselor|teacher|school_admin|coach|platform_owner):[\w.]+$/.test(line)) {
      add("raw-i18n-key", line);
    }
    if (other.has(line) && !DATA_TABLE_PAGES.has(pageName)) add("other-language-copy", line);
    if (bad.has(line)) add("known-grammar-regression", line);
    if (lang === "es" && looksEnglish(line)) add("english-sentence-in-es", line);
  }
  return issues;
}

async function waitForContent(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  // Let client-side data + i18n settle (dev server compiles lazily; queries resolve after mount).
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

function record(testInfo: TestInfo, name: string, issues: Issue[]) {
  if (REPORT_DIR) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, `${name}.json`), JSON.stringify(issues, null, 1));
  }
  if (issues.length) testInfo.annotations.push({ type: "issues", description: JSON.stringify(issues.slice(0, 40)) });
}

// ---------------------------------------------------------------- tests
test.describe("i18n + grammar sweep", () => {
  test.skip(!LOCAL, `local stack only (E2E_BASE_URL=${BASE_URL}) — this spec changes fixture accounts' language`);
  // Every test signs in fresh and sets its own language, so they are independent — but run them
  // with --workers=1: the fixture accounts' saved language is shared state.

  for (const role of ROLES) {
    for (const lang of ["es", "en"] as Lang[]) {
      test(`${role.name} pages render clean ${lang === "es" ? "Spanish" : "English"}`, async ({ browser }, testInfo) => {
        test.setTimeout(role.pages.length * 150_000);
        const { page, context } = await signedIn(browser, role.email);
        await page.goto("/");
        await setLanguage(page, lang);
        const issues: Issue[] = [];
        for (const p of role.pages) {
          await page.goto(p, { timeout: 180_000 });
          await waitForContent(page);
          issues.push(...check(await visibleLines(page), lang, p), ...(await htmlLangIssue(page, lang, p)));
        }
        await context.close();
        record(testInfo, `${role.name}-${lang}`, issues);
        expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
      });
    }
  }

  for (const lang of ["es", "en"] as Lang[]) {
    test(`signed-out pages render clean ${lang === "es" ? "Spanish" : "English"}`, async ({ page }, testInfo) => {
      test.setTimeout(PUBLIC_PAGES.length * 150_000);
      await page.addInitScript((l) => {
        window.localStorage.setItem("i18nextLng", l);
        window.localStorage.setItem("telemetry_consent", JSON.stringify({ version: "1.0",
          timestamp: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }));
      }, lang);
      const issues: Issue[] = [];
      for (const p of PUBLIC_PAGES) {
        await page.goto(p, { timeout: 180_000 });
        await waitForContent(page);
        issues.push(...check(await visibleLines(page), lang, p), ...(await htmlLangIssue(page, lang, p)));
      }
      record(testInfo, `public-${lang}`, issues);
      expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
    });
  }

  for (const lang of ["es", "en"] as Lang[]) {
    test(`student 360: gate screen and every self-evaluation question read correctly in ${lang === "es" ? "Spanish" : "English"}`, async ({ browser }, testInfo) => {
      test.skip(!instrument360[lang], `no fixtures/vocational-360-${lang}.json`);
      test.setTimeout(300_000);
      const { page } = await signedIn(browser, "test.student@formmaps.dev");
      await page.goto("/");
      await setLanguage(page, lang);
      await page.goto("/dashboard/assessments/evaluation", { timeout: 180_000 });
      await waitForContent(page);
      const start = page.getByRole("button", { name: (lang === "es" ? es : en)["common:evaluation.page.startSelf"] });
      await expect(start, "360 gate should offer the start button in the UI language").toBeVisible();
      const gateIssues = check(await visibleLines(page), lang, "/dashboard/assessments/evaluation");
      await start.click();
      await page.waitForURL(/\/evaluation\/evaluator\?token=/, { timeout: 120_000 });
      const issues = [...gateIssues, ...(await check360(page, "self", lang))];
      record(testInfo, `student-360-${lang}`, issues);
      expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
    });
  }

  const tokens: Record<string, string> = JSON.parse(process.env.E2E_360_TOKENS || "{}");
  for (const lang of ["es", "en"] as Lang[]) {
    for (const variant of ["parent", "teacher", "sibling_friend"]) {
      test(`360 ${variant} evaluator reads every question correctly in ${lang === "es" ? "Spanish" : "English"}`, async ({ page }, testInfo) => {
        test.skip(!tokens[variant], `no E2E_360_TOKENS.${variant} (evaluator tokens are not readable by students)`);
        test.skip(!instrument360[lang], `no fixtures/vocational-360-${lang}.json`);
        test.setTimeout(240_000);
        await page.addInitScript(() => {
          window.localStorage.setItem("telemetry_consent", JSON.stringify({ version: "1.0",
            timestamp: new Date().toISOString(), preferences: { necessary: true, analytics: false, marketing: false } }));
        });
        // Emailed invite links carry ?lang=, and the page must honour it over the browser default.
        await page.goto(`/evaluation/evaluator?token=${encodeURIComponent(tokens[variant])}&lang=${lang}`, { timeout: 180_000 });
        const issues = await check360(page, variant, lang);
        record(testInfo, `360-${variant}-${lang}`, issues);
        expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
      });
    }
  }
});

async function check360(page: Page, variant: string, lang: Lang): Promise<Issue[]> {
  const pageName = `/evaluation/evaluator (${variant})`;
  await expect(page.locator('[id^="voc-q-"]').first()).toBeVisible({ timeout: 120_000 });
  await waitForContent(page);
  const issues = check(await visibleLines(page), lang, pageName);
  const expected = instrument360[lang]![variant];
  const cards = page.locator('[id^="voc-q-"]');
  const n = await cards.count();
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const num = (await card.getAttribute("id"))!.replace("voc-q-", "");
    seen.add(num);
    const text = (await card.innerText()).replace(/\s+/g, " ");
    const want = expected[num];
    if (!want) { issues.push({ page: pageName, lang, kind: "360-unexpected-question", text: `q${num}` }); continue; }
    if (!text.includes(want.text)) {
      issues.push({ page: pageName, lang, kind: "360-question-text", text: `q${num}: expected «${want.text}» in «${text.slice(0, 240)}»` });
    }
    for (const label of want.labels) {
      if (!text.includes(label)) issues.push({ page: pageName, lang, kind: "360-option-label", text: `q${num}: missing «${label}»` });
    }
  }
  for (const num of Object.keys(expected)) {
    if (!seen.has(num)) issues.push({ page: pageName, lang, kind: "360-missing-question", text: `q${num}` });
  }
  return issues;
}
