# Platform-wide EN/ES i18n — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every FormMaps user level fully bilingual (EN/ES): UI strings, AI output, and instrument text all render in the user's saved language.

**Architecture:** Foundation-first then per-role fan-out. Foundation (Phase F) lays conflict-free shared infra: i18next per-role namespaces, `UserSettings.language` as single source of truth with login hydration, a `bedrock.ts` language seam, an anti-drift CI guard, LIA Verbal ES scaffolding, and the shared app shell. Per-role fan-out (Phase R) then translates each role's surfaces in parallel against files only that role owns. Verification + deploy is Phase V.

**Tech Stack:** Next.js 16 App Router + i18next/react-i18next (frontend); Express + Prisma + Bedrock (api); Vitest (api), Jest (frontend), Playwright (e2e).

## Global Constraints

- Languages in scope: **`en` and `es` only**. Remove `fr`/`pt` from any picker.
- `UserSettings.language` values constrained to `'en' | 'es'` (default `'en'`).
- **Structural parity invariant:** for every namespace, `en/<ns>.json` and `es/<ns>.json` have the **identical key set** at all times. New ES files are seeded with English placeholder values (same keys) during the split; Phase R replaces values, never keys.
- JSON keys in AI output stay English; only string VALUES are localized.
- Behavior-preserving default: with `language='en'` (the default) every surface renders exactly as today.
- Gates per task: `cd api && npx tsc --noEmit && npx vitest run <scope>`; `cd frontend && npx tsc --noEmit && npx jest <scope>`; `next build` before any PR.
- Git: feature branch → PR→`develop` (admin-merge past billing-trap CI) → `develop`→`main` → App Runner image + Vercel deploy. End commits with the repo's Co-Authored-By trailer.
- Foundation (Phase F) MUST be merged before any Phase R role work starts.

---

# PHASE F — Foundation (central, sequential, one PR)

Branch: `feat/i18n-platform` (already exists; holds vocational slice `d433c03` + spec `8f44ea7`).

### Task F1: i18next per-role namespace split + config

**Files:**
- Create: `frontend/src/lib/i18n/locales/{en,es}/common.json` and `…/{en,es}/{student,parent,counselor,teacher,school_admin,coach,platform_owner}.json` (16 files)
- Modify: `frontend/src/lib/i18n/index.ts` (resources → namespaced; `ns`, `defaultNS:'common'`, `fallbackNS:'common'`)
- Delete (after split): `frontend/src/lib/i18n/locales/en.json`, `es.json`
- Test: `frontend/src/lib/i18n/__tests__/namespaces.test.ts`

**Interfaces:**
- Produces: i18next instance exposing namespaces `['common','student','parent','counselor','teacher','school_admin','coach','platform_owner']`; every key reachable via `t('<ns>:<key>')`.

- [ ] **Step 1: Write the failing test**
```ts
// namespaces.test.ts
import i18n from "../index";
const NS = ["common","student","parent","counselor","teacher","school_admin","coach","platform_owner"];
test("all namespaces registered for en and es", () => {
  for (const ns of NS) {
    expect(i18n.hasResourceBundle("en", ns)).toBe(true);
    expect(i18n.hasResourceBundle("es", ns)).toBe(true);
  }
});
test("en and es have identical key sets per namespace (structural parity)", () => {
  const flat = (o:any,p=""):string[]=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?flat(v,`${p}${k}.`):[`${p}${k}`]);
  for (const ns of NS) {
    const en = flat(i18n.getResourceBundle("en", ns) || {}).sort();
    const es = flat(i18n.getResourceBundle("es", ns) || {}).sort();
    expect(es).toEqual(en);
  }
});
```
- [ ] **Step 2: Run, verify fail** — `cd frontend && npx jest namespaces` → FAIL (bundles not split).
- [ ] **Step 3: Split the dictionaries (behavior-preserving).** ~164 files call `t('key')` against the default namespace — DO NOT orphan them. Move the **entire** existing `en.json` into `locales/en/common.json` and `es.json` into `locales/es/common.json` (rename the namespace to `common`; existing `t('key')` keeps working because `defaultNS:'common'`). Create **empty** (`{}`) role namespace files `locales/{en,es}/<role>.json` for all 7 roles — Phase R fills these with newly de-hardcoded strings. Fix the existing key drift IN `common`: the `coach` block exists only in `en.json` → copy it into `es/common.json` (placeholder = English value); the `schoolAdmin` block exists only in `es.json` → copy it into `en/common.json` (placeholder = Spanish value). A one-off `frontend/scripts/split-locales.mjs` may do the mechanical move; commit the generated files. Update `index.ts`: `resources = { en: { common, student, ... }, es: { common, ... } }`, `ns: ['common',...roles]`, `defaultNS: 'common'`, `fallbackNS: 'common'`.
- [ ] **Step 4: Run, verify pass** — `npx jest namespaces` → PASS.
- [ ] **Step 5: Commit** — `feat(i18n): split locales into per-role namespaces`.

### Task F2: `UserSettings.language` validation + auth payload

**Files:**
- Modify: `api/src/routes/user.ts` (PUT settings: `language: z.enum(["en","es"]).optional()`)
- Modify: `api/src/services/authService.ts` (+ login response includes `language` from UserSettings, default `"en"`)
- Test: `api/src/__tests__/user-settings-language.test.ts`, extend auth test

**Interfaces:**
- Produces: login/auth response field `language: "en"|"es"`; `PUT /user/settings` rejects non-en/es with 400.

- [ ] **Step 1: Failing test** — assert `PUT /user/settings {language:"fr"}` → 400; login response `.data.language` is `"en"` for a user with no setting and `"es"` when set.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — zod enum on the route; in authService, read `userSettings.language` (default `"en"`) and include it in the returned payload.
- [ ] **Step 4: Run, verify pass** — `npx vitest run user-settings-language auth`.
- [ ] **Step 5: Commit** — `feat(i18n): validate + surface UserSettings.language in auth`.

### Task F3: Frontend language hydration + shared `setLanguage`

**Files:**
- Create: `frontend/src/lib/i18n/useSetLanguage.ts` (hook)
- Modify: `frontend/src/components/I18nProvider.tsx` (seed from fetched/login language on mount)
- Modify: `frontend/src/components/ui/LanguageSwitcher.tsx`, `…/accessibility/AccessibleLanguageSwitcher.tsx`, `frontend/src/app/dashboard/settings/page.tsx` (use the hook; remove fr/pt)
- Test: `frontend/src/lib/i18n/__tests__/useSetLanguage.test.ts`

**Interfaces:**
- Produces: `useSetLanguage()` → `(lang:"en"|"es")=>Promise<void>` that calls `i18n.changeLanguage(lang)`, `store.setLanguage(lang==="es"?"spanish":"english")`, and `PUT /user/settings {language:lang}`.

- [ ] **Step 1: Failing test** — mock i18n/store/api; assert calling the hook's fn triggers all three (changeLanguage, store.setLanguage, PUT).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the hook; wire it into both switchers + the settings picker; remove fr/pt options; in `I18nProvider`, on mount read the login/`GET /user/settings` language and call `i18n.changeLanguage` + seed store (DB→UI hydration).
- [ ] **Step 4: Run, verify pass** — `npx jest useSetLanguage`.
- [ ] **Step 5: Commit** — `feat(i18n): single-source language preference + hydration`.

### Task F4: `bedrock.ts` language seam + `resolveUserLanguage`

**Files:**
- Modify: `api/src/lib/bedrock.ts` (add `opts.language` to `aiJson/aiComplete/aiChat`; export `languageDirective(lang)`)
- Create: `api/src/lib/resolveUserLanguage.ts` (`resolveUserLanguage(userId):Promise<"en"|"es">`)
- Modify: `api/src/services/vocationalRecommendationService.ts` (use the promoted `languageDirective` from bedrock instead of its local copy)
- Test: `api/src/__tests__/bedrock-language.test.ts`, `resolveUserLanguage.test.ts`

**Interfaces:**
- Produces: `aiJson(systemPrompt,userMsg,{language})` appends the directive when language set; `languageDirective("es")` contains "Spanish", `languageDirective("en")` contains "English"; `resolveUserLanguage(userId)` reads `UserSettings.language` (default `"en"`).

- [ ] **Step 1: Failing tests** — `languageDirective("es")` matches /Spanish/, `("en")` matches /English/ and not /Spanish/; `resolveUserLanguage` returns `"es"` when settings.language==="es", `"en"` when null.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the directive + opt threading + helper; refactor vocational service to import `languageDirective` from bedrock (delete its local copy; its existing tests stay green since the prompt still contains "Spanish"/"English").
- [ ] **Step 4: Run, verify pass** — `npx vitest run bedrock-language resolveUserLanguage vocationalRecommendation`.
- [ ] **Step 5: Commit** — `feat(i18n): shared bedrock language seam + resolveUserLanguage`.

### Task F5: Anti-drift CI guard

**Files:**
- Create: `frontend/src/lib/i18n/__tests__/parity.test.ts` (per-namespace key-set equality — reuses the F1 parity assertion across all namespaces)
- Create: `scripts/check-hardcoded-strings.mjs` + wire into CI (heuristic: flag JSX text nodes / common attributes with capitalized multi-word English literals in `frontend/src/app/**` outside `t()`), reported as warnings initially, error after Phase R.

- [ ] **Step 1:** Write `parity.test.ts` (fails if any namespace's en/es key sets diverge). Run — PASS (F1 guarantees parity).
- [ ] **Step 2:** Write `check-hardcoded-strings.mjs`; run against current tree; capture the baseline count to a committed allowlist so it neither blocks nor hides new additions.
- [ ] **Step 3: Commit** — `chore(i18n): parity test + hardcoded-string guard`.

### Task F6: LIA Verbal ES bank

**Files:**
- Modify: `api/src/lib/lia/banks.ts` (`VerbalBankItem`: add `textEs:string`, `reviewedByHuman:boolean`; rename existing `questionText`→`textEn` with back-compat read)
- Modify: `api/data/lia-banks/verbal.json` (each item → `{ ..., textEn, textEs, reviewedByHuman:false }`; ES = translated, flagged provisional)
- Modify: `api/src/lib/lia/build-question-rows.ts` (select `textEs` when session language is `es`, else `textEn`)
- Test: `api/src/__tests__/lia-verbal-language.test.ts`

**Interfaces:**
- Produces: verbal items expose `textEn`/`textEs`/`reviewedByHuman`; row builder picks text by session language.

- [ ] **Step 1: Failing test** — build verbal rows with language `"es"` → row text equals the item's `textEs`; with `"en"` → `textEn`; every item has `reviewedByHuman:false`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the type + data migration (translate each verbal item to ES, set flag false) + selection logic.
- [ ] **Step 4: Run, verify pass** — `npx vitest run lia-verbal-language`.
- [ ] **Step 5: Commit** — `feat(i18n): LIA Verbal ES bank (provisional, flagged for review)`.

### Task F7: Common/shared surfaces pass

**Files:**
- Modify: shared shell/nav/generic components (e.g. `frontend/src/components/layout/*`, sidebar/nav, shared dialogs) → `t('common:...')`; add keys to `en/common.json` + `es/common.json` (parity preserved)
- Test: `frontend/src/components/layout/__tests__/shell-i18n.test.tsx`

- [ ] **Step 1: Failing test** — render the shell/nav with i18n language `es`; assert a known nav label renders its Spanish value (not the English literal).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** — inventory shared-component hardcoded strings; replace with `t('common:...')`; add en+es keys.
- [ ] **Step 4: Run, verify pass** — `npx jest shell-i18n`.
- [ ] **Step 5: Commit** — `feat(i18n): localize shared shell/nav (common namespace)`.

### Task F8: Foundation gate + PR

- [ ] Run full gate: `cd api && npx tsc --noEmit && npx vitest run`; `cd frontend && npx tsc --noEmit && npx jest && npx next build`.
- [ ] security-reviewer pass on the diff (auth payload + settings validation surface).
- [ ] PR `feat/i18n-platform` → `develop`; admin-merge past billing-trap CI.
- [ ] **STOP — foundation merged is the precondition for Phase R.**

---

# PHASE R — Per-role fan-out (parallel, orchestrated)

Run AFTER Phase F is merged to `develop`. Orchestrated via the **Workflow** tool: pipeline the 7 roles; each role runs the recipe below as a 5-stage pipeline (the "~5 agents per role"). Each role-agent set touches ONLY: that role's page/component dirs + `frontend/src/lib/i18n/locales/{en,es}/<role>.json` + that role's AI services → conflict-free. Use `isolation:'worktree'` per role to be safe.

**Per-role recipe (applied to each of: student, parent, counselor, teacher, school_admin, coach, platform_owner):**

- **Stage 1 — Inventory (agent):** List every hardcoded user-facing string in that role's surfaces (`frontend/src/app/<role-area>/**` pages + role-specific components). Output a structured key→string map (proposed `<role>:<dotted.key>` names).
- **Stage 2 — De-hardcode pages (agent):** Replace each page's literals with `t('<role>:<key>')` (+ `common:` for shared); add the English values to `en/<role>.json`. Gate: frontend tsc.
- **Stage 3 — De-hardcode components (agent):** Same for that role's components. Gate: frontend tsc.
- **Stage 4 — Spanish translations (agent):** Fill `es/<role>.json` with real Spanish for every key in `en/<role>.json` (replace any placeholders; preserve key-set parity). Use the `common` glossary for consistent terminology.
- **Stage 5 — Role AI services + verify (agent):** Thread `resolveUserLanguage(targetUserId)` → `{language}` into that role's AI services (from the spec's ~13-service inventory, mapped per role). Then verify: `cd frontend && npx tsc --noEmit && npx jest <role>`; Playwright render of the role's primary pages with language `es` (assert no English leakage) and `en`; `parity.test.ts` green.

**Per-role PR:** each role is its own branch `feat/i18n-<role>` → PR→`develop` (admin-merge). Roles are independent and can merge in any order once foundation is in.

**AI-service → role mapping (from spec §3 inventory):**
- student: assessmentService (career counselor), studentService (essay feedback/checklist), careerService, universityService, resume routes, vocationalRecommendationService (done)
- counselor: counselorAnalyticsService (caseload briefing), planWorkflowService (course-plan)
- school_admin: schoolAssessmentsService (aggregate insights), schoolService (school insights), schoolCoursesService (curriculum extraction), prereq-analysis-service
- teacher / parent / coach / platform_owner: no dedicated AI services today — UI/dictionary only (note if discovery finds any).

---

# PHASE V — Verification & rollout

### Task V1: Full bilingual sweep
- [ ] Playwright: for each of the 7 roles, log in (or impersonate), toggle language `es`, walk the role's primary surfaces, assert no English leakage; toggle `en`, assert no Spanish leakage. Capture screenshots.
- [ ] Confirm AI output language: trigger one AI feature per role with `es` user → response in Spanish.
- [ ] `parity.test.ts` + `check-hardcoded-strings.mjs` (now error-level) green across all namespaces.

### Task V2: Deploy
- [ ] PR `develop`→`main`; admin-merge.
- [ ] Backend: `docker buildx build --platform linux/amd64 --provenance=false -t <ecr>/nexa-api:latest -t <ecr>/nexa-api:deploy-<date>-i18n-<sha> --push api/`; `aws apprunner update-service` preserving 14 env + 6 secrets + Cpu1024/Mem2048; poll RUNNING.
- [ ] Frontend: Vercel auto-deploy on main.
- [ ] Prod smoke: switch a test user to `es`, confirm UI + one AI feature render Spanish; switch back to `en`.
- [ ] No DB migration required (UserSettings.language already in prod; LIA Verbal is a data-file change in the image).
- [ ] Update memory note `formmaps-gradebook-build`.

---

## Self-Review

- **Spec coverage:** §1 dictionary→F1; §2 language SoT→F2/F3; §3 AI seam→F4 + Phase R stage 5; §4 LIA Verbal→F6; §5 CI guard→F5; common surfaces→F7; per-role comprehensive→Phase R; verification+deploy→Phase V. All covered.
- **Placeholder scan:** Per-role exact strings are intentionally discovered at execution (Stage 1 inventory) — the recipe is concrete; no "TBD" in foundation tasks.
- **Type consistency:** `languageDirective`, `resolveUserLanguage`, `useSetLanguage`, `textEn/textEs/reviewedByHuman` used consistently across F4/F6/Phase R.
- **Parity invariant** is enforced from F1 (seeded placeholders) through F5 (guard) so CI never breaks mid-program.
