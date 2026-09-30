import { test, expect, Browser, BrowserContext, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * The whole Vocational 360, end to end, through the real UI of every role that touches it:
 *
 *   student   gate → self-evaluation (proctored questionnaire, every question type) → invite a
 *             parent, a teacher and a sibling/friend (dialog validation included) → report
 *   parent    /parent/evaluations → Complete Now → questionnaire (English)
 *   teacher   /teacher/evaluations → Complete Now → questionnaire (Spanish)
 *   friend    signed out, the emailed link → questionnaire (English)
 *   counselor /counselor/evaluations → the student's report
 *   school admin evaluations overview
 *   + link states: reused, expired and unknown tokens; a parent cannot read the student's results.
 *
 * Every group answers every likert item with one fixed rating (self 5, parent 4, teacher 3,
 * friend 2 → 100/75/50/25 on the 0–100 scale), so the scoring is checked against numbers worked
 * out by hand from the instrument weights (self 35, parent 25, teacher 25, sibling_friend 15,
 * renormalised over the groups present): 89.58 after self+parent, 77.94 after +teacher, 70 after
 * all four — every dimension 70, band moderateHigh.
 *
 * LOCAL STACK ONLY: it deletes and recreates test.student.fm052's 360 data and reads tokens from the
 * database with psql (an external evaluator only ever gets the token by email). Refuses any other
 * host.
 *   E2E_BASE_URL=http://localhost:3010 E2E_PASSWORD=... [E2E_DB_NAME=formmaps_dev] \
 *     npx playwright test e2e/vocational-360.spec.ts --workers=1
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.E2E_PASSWORD || "Test1234!";
const DB_NAME = process.env.E2E_DB_NAME || "formmaps_dev";
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(BASE_URL);
const LOCALES = path.join(__dirname, "../src/lib/i18n/locales");

const STUDENT = "test.student.fm052@formmaps.dev";
const STUDENT_NAME = "Test Student FM052";
const PARENT = "test.parent@formmaps.dev";
const TEACHER = "test.teacher@formmaps.dev";
const COUNSELOR = "test.counselor@formmaps.dev";
const SCHOOL_ADMIN = "test.schooladmin@formmaps.dev";
const FRIEND = "e2e.friend.360@example.com";

type Lang = "en" | "es";

// ---------------------------------------------------------------- locale copy, both languages
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
    for (const [k, v] of Object.entries(flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, lang, f), "utf8"))))) {
      all[`${ns}:${k}`] = v;
    }
  }
  return all;
}
const COPY: Record<Lang, Record<string, string>> = { en: loadLocale("en"), es: loadLocale("es") };
/** Locale string for `key` (default namespace "common"), with {{vars}} filled in. */
function L(lang: Lang, key: string, vars: Record<string, string | number> = {}) {
  const full = key.includes(":") ? key : `common:${key}`;
  let s = COPY[lang][full];
  if (s === undefined) throw new Error(`missing locale key ${full} (${lang})`);
  for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(String(v));
  return s;
}

// ---------------------------------------------------------------- database (local only)
function sql(query: string): string {
  return execFileSync("psql", ["-X", "-q", "-d", DB_NAME, "-Atc", query], { encoding: "utf8" }).trim();
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- sessions
/** Pre-answers the cookie banner (necessary only), which otherwise covers the first page. */
async function acceptNecessaryCookies(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("telemetry_consent", JSON.stringify({
    version: "1.0", timestamp: new Date().toISOString(),
    preferences: { necessary: true, analytics: false, marketing: false },
  })));
}
/** A signed-out browser, as an evaluator opening an emailed link. */
async function signedOut(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await acceptNecessaryCookies(page);
  return { page, context };
}
async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await acceptNecessaryCookies(page);
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
}
// One sign-in per account per run (the auth API rate-limits repeated sign-ins per identity).
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const sessions = new Map<string, StorageState>();
async function signedIn(browser: Browser, email: string, lang: Lang) {
  let state = sessions.get(email);
  if (!state) {
    const first = await browser.newContext();
    await login(await first.newPage(), email);
    state = await first.storageState();
    await first.close();
    sessions.set(email, state);
  }
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  await page.goto("/");
  await setLanguage(page, lang);
  return { page, context };
}
async function setLanguage(page: Page, lang: Lang) {
  const res = await page.request.put("/api/v1/user/settings", { data: { language: lang } });
  expect(res.ok(), `PUT /api/v1/user/settings → ${res.status()}`).toBeTruthy();
  await page.evaluate((l) => {
    const raw = window.localStorage.getItem("timcare-global-store");
    const store = raw ? JSON.parse(raw) : { state: {} };
    store.state = { ...store.state, language: l === "es" ? "spanish" : "english" };
    window.localStorage.setItem("timcare-global-store", JSON.stringify(store));
    window.localStorage.setItem("i18nextLng", l);
  }, lang);
}

// ---------------------------------------------------------------- the questionnaire
/** Waits for the proctored questionnaire and clears the fullscreen prompt if it is up. */
async function openQuestionnaire(page: Page, lang: Lang) {
  await expect(page.locator('div[id^="voc-q-"]').first()).toBeVisible({ timeout: 120_000 });
  await dismissFullscreenPrompt(page, lang);
  await expect(page.getByText(L(lang, "evaluation.vocational.title"))).toBeVisible();
}
async function dismissFullscreenPrompt(page: Page, lang: Lang) {
  const enter = page.getByRole("button", { name: L(lang, "proctoring.fullscreenButton") });
  if (await enter.isVisible().catch(() => false)) {
    await enter.click();
    await expect(enter).toBeHidden({ timeout: 10_000 });
  }
}
/**
 * Answers every question the way a person would: likert → the given score; single select → the
 * first option; multi select → the first five; ranking → moves the first option down one place
 * (so the submitted order is exercised, not just the default); open → a sentence.
 * Returns the number of questions.
 */
async function answerAll(page: Page, lang: Lang, rating: number, who: string) {
  const cards = page.locator('div[id^="voc-q-"]');
  const total = await cards.count();
  for (let i = 0; i < total; i++) {
    await dismissFullscreenPrompt(page, lang);
    const card = cards.nth(i);
    const num = (await card.getAttribute("id"))!.replace("voc-q-", "");
    if (await card.locator(`#q${num}-s1`).count()) {
      await card.locator(`#q${num}-s${rating}`).click();
    } else if (await card.locator("textarea").count()) {
      await card.locator("textarea").fill(`E2E ${who} answer to question ${num}.`);
    } else if (await card.getByRole("checkbox").count()) {
      const boxes = card.getByRole("checkbox");
      const n = Math.min(5, await boxes.count());
      for (let j = 0; j < n; j++) await boxes.nth(j).click();
    } else if (await card.locator("ol li").count()) {
      const first = card.locator("ol li").first();
      const label = (await first.locator("span").innerText()).replace(/^1\.\s*/, "");
      await first.getByRole("button", { name: L(lang, "evaluation.vocational.moveDown", { label }) }).click();
      await expect(card.locator("ol li").nth(1).locator("span")).toHaveText(`2. ${label}`);
    } else {
      await card.getByRole("radio").first().click();
    }
  }
  await expect(page.getByText(L(lang, "evaluation.vocational.progress", { done: total, total }))).toBeVisible();
  return total;
}
async function submitQuestionnaire(page: Page, lang: Lang) {
  await dismissFullscreenPrompt(page, lang);
  await page.getByRole("button", { name: L(lang, "evaluation.vocational.submit"), exact: true }).click();
  await expect(page.getByText(L(lang, "evaluation.vocational.alreadyTitle"))).toBeVisible({ timeout: 60_000 });
}

// ---------------------------------------------------------------- expectations
type Score = {
  status: string; composite: number; band: string; respondentCount: number; groupsIncluded: string[];
  weightsApplied: Record<string, number>;
  dimensionScores: { key: string; score: number | null; band: string | null; byGroup: Record<string, number> }[];
  rankings: unknown;
};
function storedScore(studentId: string): { composite: number; band: string; respondentCount: number } | null {
  const row = sql(`SELECT composite, band, "respondentCount" FROM vocational_results WHERE "evaluatedUserId" = ${q(studentId)} AND "isActive" ORDER BY "computedAt" DESC LIMIT 1`);
  if (!row) return null;
  const [composite, band, respondentCount] = row.split("|");
  return { composite: Number(composite), band, respondentCount: Number(respondentCount) };
}
function group(studentId: string, groupType: string) {
  const row = sql(`SELECT id, "invitationToken", "isEvaluationCompleted", "isTokenUsed", instrument
    FROM evaluation_groups WHERE "evaluatedUserId" = ${q(studentId)} AND "groupType" = ${q(groupType)} AND "isActive"
    ORDER BY "createdDate" DESC LIMIT 1`);
  const [id, token, completed, used, instrument] = row.split("|");
  return { id, token, completed: completed === "t", used: used === "t", instrument };
}
const responseCount = (groupId: string) =>
  Number(sql(`SELECT count(*) FROM vocational_responses WHERE "evaluationGroupId" = ${q(groupId)}`));

// ================================================================================================
test.describe.serial("Vocational 360 — full functionality", () => {
  test.skip(!LOCAL, `LOCAL ONLY: rewrites ${STUDENT}'s 360 data. E2E_BASE_URL must be localhost (got ${BASE_URL}).`);
  test.setTimeout(600_000);

  let studentId = "";
  let questionCount = 0;

  test.beforeAll(() => {
    studentId = sql(`SELECT id FROM users WHERE email = ${q(STUDENT)}`);
    expect(studentId, `${STUDENT} must exist in ${DB_NAME}`).not.toBe("");
    const groups = `SELECT id FROM evaluation_groups WHERE "evaluatedUserId" = ${q(studentId)}`;
    sql(`DELETE FROM vocational_responses WHERE "evaluationGroupId" IN (${groups});
      DELETE FROM evaluation_feedbacks WHERE "evaluationGroupId" IN (${groups});
      DELETE FROM vocational_results WHERE "evaluatedUserId" = ${q(studentId)};
      DELETE FROM vocational_integrated_results WHERE "evaluatedUserId" = ${q(studentId)};
      DELETE FROM evaluation_groups WHERE "evaluatedUserId" = ${q(studentId)};
      DELETE FROM student_parent_links WHERE "studentId" = ${q(studentId)};
      INSERT INTO counselor_student_assignments (id, "counselorId", "studentId", "updatedAt")
        SELECT gen_random_uuid()::text, c.id, ${q(studentId)}, now() FROM users c
        WHERE c.email = ${q(COUNSELOR)} AND NOT EXISTS (
          SELECT 1 FROM counselor_student_assignments a WHERE a."counselorId" = c.id AND a."studentId" = ${q(studentId)});`);
  });

  test("student: the gate blocks invitations until the self-evaluation is done, then the proctored questionnaire (every type) submits", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, STUDENT, lang);

    await page.goto("/dashboard/assessments/evaluation");
    await expect(page.getByText(L(lang, "evaluation.page.gateTitle"))).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: L(lang, "evaluation.card.addToGroup", { group: L(lang, "dashboard.parent") }) })).toHaveCount(0);

    await page.getByRole("button", { name: L(lang, "evaluation.page.startSelf") }).click();
    await page.waitForURL(/\/evaluation\/evaluator\?token=/, { timeout: 60_000 });
    await openQuestionnaire(page, lang);

    // Submitting with nothing answered is refused.
    await page.getByRole("button", { name: L(lang, "evaluation.vocational.submit"), exact: true }).click();
    await expect(page.getByText(L(lang, "evaluation.vocational.answerAll"))).toBeVisible();

    questionCount = await answerAll(page, lang, 5, "self");
    expect(questionCount, "self questionnaire: 45 common + 5 group-specific").toBe(50);
    await submitQuestionnaire(page, lang);

    const self = group(studentId, "Self");
    expect(self.instrument).toBe("vocational");
    expect(self.completed && self.used).toBeTruthy();
    expect(responseCount(self.id)).toBe(50);
    expect(storedScore(studentId), "self alone is not a 360").toBeNull();
  });

  test("student: a used self-evaluation link says it is already submitted", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, STUDENT, lang);
    await page.goto(`/evaluation/evaluator?token=${group(studentId, "Self").token}`);
    await expect(
      page.getByText(L(lang, "evaluation.vocational.alreadyTitle"))
        .or(page.getByText(L(lang, "evaluation.evaluator.alreadySubmitted"))).first(),
      "a completed evaluation must say so, not 'link not available'",
    ).toBeVisible({ timeout: 60_000 });
  });

  test("student: invites a parent, a teacher and a sibling/friend — the dialog validates", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, STUDENT, lang);
    await page.goto("/dashboard/assessments/evaluation");
    await expect(page.getByText(L(lang, "evaluation.page.selfDone"))).toBeVisible({ timeout: 60_000 });

    const openAdd = (groupKey: string) =>
      page.getByRole("button", { name: L(lang, "evaluation.card.addToGroup", { group: L(lang, groupKey) }) }).click();
    const dialog = page.getByRole("dialog");
    const submit = () => dialog.getByRole("button", { name: L(lang, "evaluation.evaluatorManagement.addEvaluator"), exact: true }).click();
    const pickRelationship = async (optionKey: string) => {
      await dialog.getByRole("combobox").last().click();
      await page.getByRole("option", { name: L(lang, optionKey), exact: true }).click();
    };

    // Parent — every validation message, then a valid invitation.
    await openAdd("dashboard.parent");
    await submit();
    await expect(dialog.getByText(L(lang, "evaluation.validation.nameRequired"))).toBeVisible();
    await expect(dialog.getByText(L(lang, "evaluation.validation.emailRequired"))).toBeVisible();
    await expect(dialog.getByText(L(lang, "evaluation.validation.relationshipRequired"))).toBeVisible();
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.namePlaceholder")).fill("Test Parent");
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.emailPlaceholder")).fill("not-an-email");
    await submit();
    await expect(dialog.getByText(L(lang, "evaluation.validation.emailInvalid"))).toBeVisible();
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.emailPlaceholder")).fill(PARENT);
    await pickRelationship("evaluation.relationshipOptions.mother");
    await submit();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText("Test Parent").first()).toBeVisible();

    // Teacher — no relationship field.
    await openAdd("dashboard.teacher");
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.namePlaceholder")).fill("Test Teacher");
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.emailPlaceholder")).fill(TEACHER);
    await submit();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // Sibling/friend — an email already used by another evaluator is refused.
    await openAdd("dashboard.siblingFriend");
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.namePlaceholder")).fill("E2E Friend");
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.emailPlaceholder")).fill(PARENT);
    await pickRelationship("evaluation.relationshipOptions.bestFriend");
    await submit();
    await expect(dialog.getByText(L(lang, "evaluation.validation.emailDuplicate"))).toBeVisible();
    await dialog.getByPlaceholder(L(lang, "evaluation.addDialog.emailPlaceholder")).fill(FRIEND);
    await submit();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    for (const type of ["Parent", "Teacher", "SiblingFriend"]) {
      const g = group(studentId, type);
      expect(g.id, `${type} group created`).not.toBe("");
      expect(g.instrument, `${type} group uses the vocational instrument`).toBe("vocational");
      expect(g.completed).toBeFalsy();
    }
    // Inviting a parent links them to the student.
    expect(Number(sql(`SELECT count(*) FROM student_parent_links WHERE "studentId" = ${q(studentId)} AND "parentEmail" = ${q(PARENT)}`))).toBe(1);

    // With self only, the report says the 360 is not ready yet.
    await page.goto("/dashboard/assessments/vocational");
    await expect(page.getByText(L(lang, "evaluation.vocational.report.notReady360")).first()).toBeVisible({ timeout: 60_000 });
  });

  test("parent (English): finds the evaluation in the parent portal and completes it", async ({ browser }) => {
    const lang: Lang = "en";
    const { page } = await signedIn(browser, PARENT, lang);
    await page.goto("/parent/evaluations");
    const card = page.locator("div").filter({ hasText: STUDENT_NAME })
      .filter({ has: page.getByRole("button", { name: L(lang, "parent:evaluations.card.completeNow") }) }).last();
    await card.getByRole("button", { name: L(lang, "parent:evaluations.card.completeNow") }).click();
    await page.waitForURL(/\/evaluation\/evaluator\?token=/, { timeout: 60_000 });
    await openQuestionnaire(page, lang);
    expect(await answerAll(page, lang, 4, "parent")).toBe(50);
    await submitQuestionnaire(page, lang);

    expect(group(studentId, "Parent").completed).toBeTruthy();
    const s = storedScore(studentId)!;
    expect(s, "self + parent is a 360").not.toBeNull();
    expect(s.respondentCount).toBe(2);
    expect(s.composite).toBeCloseTo(89.58, 2); // (35·100 + 25·75) / 60
    expect(s.band).toBe("strong");
  });

  test("teacher (Spanish): finds the evaluation in the teacher portal and completes it", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, TEACHER, lang);
    await page.goto("/teacher/evaluations");
    const card = page.locator("div").filter({ hasText: STUDENT_NAME })
      .filter({ has: page.getByRole("button", { name: L(lang, "teacher:evaluations.card.completeNow") }) }).last();
    await card.getByRole("button", { name: L(lang, "teacher:evaluations.card.completeNow") }).click();
    await page.waitForURL(/\/evaluation\/evaluator\?token=/, { timeout: 60_000 });
    await openQuestionnaire(page, lang);
    expect(await answerAll(page, lang, 3, "teacher")).toBe(50);
    await submitQuestionnaire(page, lang);

    expect(group(studentId, "Teacher").completed).toBeTruthy();
    const s = storedScore(studentId)!;
    expect(s.respondentCount).toBe(3);
    expect(s.composite).toBeCloseTo(77.94, 2); // (3500 + 1875 + 25·50) / 85
    expect(s.band).toBe("moderateHigh");
  });

  test("sibling/friend (English, signed out): completes it from the emailed link", async ({ browser }) => {
    const lang: Lang = "en";
    const { page, context } = await signedOut(browser);
    await page.goto(`/evaluation/evaluator?token=${group(studentId, "SiblingFriend").token}&lang=${lang}`);
    await openQuestionnaire(page, lang);
    await expect(page.getByText(L(lang, "evaluation.vocational.about", { name: STUDENT_NAME }))).toBeVisible();
    expect(await answerAll(page, lang, 2, "friend")).toBe(50);
    await submitQuestionnaire(page, lang);
    await context.close();

    expect(group(studentId, "SiblingFriend").completed).toBeTruthy();
    const s = storedScore(studentId)!;
    expect(s.respondentCount).toBe(4);
    expect(s.composite).toBeCloseTo(70, 2);
    expect(s.band).toBe("moderateHigh");
  });

  test("student: the report shows the finished 360, and the score API agrees with the hand-worked numbers", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, STUDENT, lang);
    await page.goto("/dashboard/assessments/vocational");
    await expect(page.getByText(L(lang, "evaluation.vocational.report.titleMine")).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(L(lang, "evaluation.vocational.report.dimensions")).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(L(lang, "evaluation.vocational.report.notReady360"))).toHaveCount(0);
    // The readiness checklist marks each row with an icon whose accessible name carries the state.
    await expect(page.getByLabel(L(lang, "evaluation.vocational.report.rowReady", { label: L(lang, "evaluation.vocational.report.row360") }), { exact: true })).toBeVisible();
    // Rankings are stored as option values; the report must show the labels evaluators saw.
    await expect(page.getByText(L(lang, "evaluation.vocational.report.topInterests")).first()).toBeVisible();
    const reportText = await page.locator("body").innerText();
    expect(reportText, "raw option slugs on the report").not.toMatch(/\b[a-z]+(?:_[a-z]+)+\b/);
    // Single-word values too: the industry ranking and the preferred work type, as labels.
    expect(reportText).toContain("Banca y finanzas");
    expect(reportText).toMatch(new RegExp(`${L(lang, "evaluation.vocational.report.workType")}\\s*Analítico`));

    const res = await page.request.get(`/api/v1/vocational360/score/${studentId}`);
    expect(res.ok(), `score API → ${res.status()}`).toBeTruthy();
    const score = (await res.json()).data as Score;
    expect(score.status).toBe("ready");
    expect(score.composite).toBeCloseTo(70, 2);
    expect(score.band).toBe("moderateHigh");
    expect(score.respondentCount).toBe(4);
    expect([...score.groupsIncluded].sort()).toEqual(["parent", "self", "sibling_friend", "teacher"]);
    expect(score.weightsApplied).toEqual({ self: 0.35, parent: 0.25, teacher: 0.25, sibling_friend: 0.15 }); // fractions of 1
    expect(score.dimensionScores).toHaveLength(8);
    for (const d of score.dimensionScores) {
      expect(d.score, d.key).toBeCloseTo(70, 2);
      expect(d.byGroup).toEqual({ self: 100, parent: 75, teacher: 50, sibling_friend: 25 });
    }
    expect(score.rankings, "rankings computed from the ranking/multi-select answers").toBeTruthy();
  });

  test("a parent cannot read the student's 360 results", async ({ browser }) => {
    const { page } = await signedIn(browser, PARENT, "en");
    const res = await page.request.get(`/api/v1/vocational360/score/${studentId}`);
    expect([403, 404]).toContain(res.status());
  });

  test("counselor: sees the student's 360 and opens the report", async ({ browser }) => {
    const lang: Lang = "es";
    const { page } = await signedIn(browser, COUNSELOR, lang);
    await page.goto("/counselor/evaluations");
    await expect(page.getByText(STUDENT_NAME).first()).toBeVisible({ timeout: 60_000 });
    await page.goto(`/counselor/evaluations/${studentId}/report`);
    await expect(page.getByText(L(lang, "evaluation.vocational.report.dimensions")).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(L(lang, "evaluation.vocational.report.notReady360"))).toHaveCount(0);
    const res = await page.request.get(`/api/v1/vocational360/score/${studentId}`);
    expect(res.ok()).toBeTruthy();
    expect(((await res.json()).data as Score).composite).toBeCloseTo(70, 2);
  });

  test("school admin: the evaluations overview includes the student", async ({ browser }) => {
    const { page } = await signedIn(browser, SCHOOL_ADMIN, "es");
    const res = await page.request.get("/api/v1/school-admin/evaluations/overview");
    expect(res.ok(), `overview → ${res.status()}`).toBeTruthy();
    expect(JSON.stringify(await res.json())).toContain(studentId);
  });

  test("link states: completed, expired and unknown tokens each show the right screen", async ({ browser }) => {
    const lang: Lang = "en";
    const { page, context } = await signedOut(browser);

    await page.goto(`/evaluation/evaluator?token=${group(studentId, "Parent").token}&lang=${lang}`);
    await expect(
      page.getByText(L(lang, "evaluation.vocational.alreadyTitle")).or(page.getByText(L(lang, "evaluation.evaluator.alreadySubmitted"))).first(),
      "a completed link says it was already submitted",
    ).toBeVisible({ timeout: 60_000 });

    // A fresh invitation, then its 48-hour window lapses.
    const student = await signedIn(browser, STUDENT, "es");
    const created = await student.page.request.post("/evaluation/create-group", {
      data: { evaluatorName: "E2E Late Teacher", evaluatorEmail: "e2e.late.teacher@example.com", relation: "Teacher", groupType: "Teacher", evaluatedUserId: studentId },
    });
    expect(created.status(), await created.text()).toBe(201);
    const late = sql(`SELECT "invitationToken" FROM evaluation_groups WHERE "evaluatorEmail" = 'e2e.late.teacher@example.com' AND "evaluatedUserId" = ${q(studentId)}`);
    sql(`UPDATE evaluation_groups SET "tokenExpiryDate" = now() - interval '1 hour' WHERE "invitationToken" = ${q(late)}`);
    await page.goto(`/evaluation/evaluator?token=${late}&lang=${lang}`);
    await expect(
      page.getByText(L(lang, "evaluation.vocational.expiredTitle")).first(),
      "an expired link says it expired and to ask for a new one",
    ).toBeVisible({ timeout: 60_000 });

    await page.goto(`/evaluation/evaluator?token=e2e-no-such-token&lang=${lang}`);
    await expect(
      page.getByText(L(lang, "evaluation.evaluator.linkNotAvailable")).or(page.getByText(L(lang, "evaluation.vocational.loadErrorTitle"))).first(),
    ).toBeVisible({ timeout: 60_000 });
    await context.close();
  });
});
