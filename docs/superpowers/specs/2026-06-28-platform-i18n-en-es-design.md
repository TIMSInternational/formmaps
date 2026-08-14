# Platform-wide EN/ES Internationalization — Design Spec

**Date:** 2026-06-28
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `feat/i18n-platform` (off `develop`; includes vocational AI-guidance slice `d433c03`)

## Goal

Make the entire FormMaps platform correctly bilingual (English / Spanish) for every
user level: student, parent, counselor, teacher, school_admin, coach, platform_owner.
"Correctly" = no half-translated screens, the user's saved language preference actually
drives the UI everywhere, AI-generated content renders in the user's language, and the
psychometric instruments render their text in the chosen language.

Scope is **comprehensive**: every user-facing string in each role's surfaces is moved to
`t()` with full `en`+`es` translations. Out of scope: dev logs, internal error codes,
test fixtures, and languages other than EN/ES.

## Current state (mapped)

- **Frontend i18n exists**: i18next + react-i18next + browser-languagedetector installed;
  `frontend/src/lib/i18n/index.ts` registers `en`/`es`; `en.json` (~76KB) / `es.json` (~87KB)
  dictionaries; `I18nProvider` bridges i18next ↔ Zustand `useGlobalStore.language`
  (`"english"|"spanish"`); `LanguageSwitcher` + `AccessibleLanguageSwitcher`; ~164 files use `t()`.
- **Broken/missing**:
  1. Settings language picker (`dashboard/settings/page.tsx`) saves to `UserSettings.language`
     but never calls `i18n.changeLanguage`/store → **choosing a language doesn't change the UI**.
     Header switcher changes UI but never persists to DB. The two are disconnected.
  2. No DB→UI hydration on login: `UserSettings.language` is never read into i18next/store
     (auth returns no language) → preference ignored across devices.
  3. All ~13 backend AI services output **English only** — no system prompt controls language,
     no `language` param threaded through `bedrock.ts` (`aiJson/aiComplete/aiChat`).
  4. LIA **Verbal** bank (`data/lia-banks/verbal.json`) is English-only (single `questionText`),
     no ES variant → Spanish LIA shows English verbal items ("EN Verbal broken").
  5. Dictionary key drift: `en.json` has a `coach` block `es.json` lacks; `es.json` has a
     `schoolAdmin` block `en.json` lacks.
  6. Hardcoded strings bypass the dictionary (vocational report components = 0 `t()`; evaluator
     page uses `language === "spanish" ? ... : ...` ternaries).
  7. Phantom locales: Settings offers `fr`/`pt` with no backing dictionaries.
- **Already done (slice 0)**: vocational P4c AI recommendations now render in the viewer's
  `UserSettings.language` (commit `d433c03`) — local `languageDirective` to be promoted to `bedrock.ts`.

## Architecture decisions

### 1. Dictionary structure — i18next namespaces (per-role files)
Split the monolithic `en.json`/`es.json` into namespaced files:
```
frontend/src/lib/i18n/locales/
  en/common.json   es/common.json
  en/student.json  es/student.json
  en/parent.json   es/parent.json
  en/counselor.json es/counselor.json
  en/teacher.json  es/teacher.json
  en/school_admin.json es/school_admin.json
  en/coach.json    es/coach.json
  en/platform_owner.json es/platform_owner.json
```
- i18next config: `ns: ['common','student',...]`, `defaultNS: 'common'`, `fallbackNS: 'common'`.
- Components request their namespace: `useTranslation('student')` (+ `common` for shared keys).
- The split resolves existing key drift (coach → also `es`, schoolAdmin → also `en`).
- **Why:** each role-agent owns exactly two files (`en/<role>.json`, `es/<role>.json`) that no
  other agent touches → conflict-free parallelism, and idiomatic i18next.

### 2. Language preference = single source of truth + hydration
- `UserSettings.language` constrained to `'en' | 'es'` (validated at `PUT /user/settings`).
- Auth/login response includes `language`; `I18nProvider` seeds i18next + store from it on load.
- **One shared `setLanguage(lang)` handler** used by BOTH the Settings picker and the header
  switcher: `i18n.changeLanguage(lang)` + `store.setLanguage` + `PUT /user/settings` (persist).
- Remove `fr`/`pt` options from the Settings picker (EN/ES only).

### 3. AI language seam (shared, in `bedrock.ts`)
- Add optional `language` to `aiJson/aiComplete/aiChat`; append a shared
  `languageDirective(lang)` to the system prompt ("Write all string VALUES in Spanish;
  keep JSON keys in English" / English).
- Add `resolveUserLanguage(userId)` helper (reads `UserSettings.language`, default `en`).
- Each of the ~13 AI services reads the relevant (viewer/target) language and passes it;
  AI cache keys include `language` so EN/ES cache separately.
- The vocational service's local `languageDirective` is promoted here and reused.

### 4. LIA Verbal Spanish bank
- Add `es` text per item in `data/lia-banks/verbal.json` (e.g. `{ textEn, textEs }`),
  update `VerbalBankItem` (`api/src/lib/lia/banks.ts`) + `build-question-rows.ts` to select
  by session language.
- ⚠️ **Risk gate:** verbal *reasoning* items are psychometric — machine translation can alter
  item difficulty/validity. ES items are produced but **flagged `reviewedByHuman: false`** and
  must be human/expert-reviewed before being treated as psychometrically equivalent. They render
  (better than English-only for ES users) but are explicitly marked provisional.

### 5. Anti-drift CI guard
A test (jest) that, per namespace, fails on en/es **key-set mismatch**, and a check that flags
new hardcoded user-facing JSX string literals in role pages/components (heuristic lint).

## Execution plan: foundation-first, then per-role fan-out

### Phase F — Foundation (central, sequential, gated + committed FIRST)
Everything below is shared infra that the per-role fan-out depends on; it CANNOT be parallelized.
1. Namespace split + i18next config (`ns`/`defaultNS`/`fallbackNS`), migrate existing keys.
2. Language source-of-truth wiring: auth payload `language`, `I18nProvider` hydration, shared
   `setLanguage` handler in Settings picker + header switcher, remove fr/pt.
3. `bedrock.ts` language seam + `resolveUserLanguage`; promote vocational directive.
4. CI anti-drift guard.
5. LIA Verbal bank schema change (en/es per item) + selection wiring + `reviewedByHuman` flag.
6. **Common/shared surfaces pass**: app shell, sidebar/nav, generic shared components used by all
   roles → `t()` against `common` namespace. (Done here, NOT in the per-role swarm, so roles
   don't fight over shared components.)
Gate: api tsc + vitest, frontend tsc + jest + next build green. Commit. This is the contract.

### Phase R — Per-role fan-out (parallel, via Workflow; ~5 agents per role × 7 roles)
For each role, agents (non-overlapping files by construction):
1. Inventory + de-hardcode that role's **pages** → `t()` keys (write `en/<role>.json`).
2. De-hardcode that role's **components**.
3. **Spanish translations** for `es/<role>.json` (full parity with `en/<role>.json`).
4. Thread **language into that role's AI services** (using the Phase-F seam).
5. **Verify**: Playwright render in en+es (no English leakage on that role's primary surfaces),
   jest, tsc.

Orchestration: a Workflow pipelines the roles; within a role the 5 workstreams run as
stages/parallel. Worktree isolation is used only if a residual shared-file risk remains
(the namespace + per-role page/component ownership should make it unnecessary).

### Phase V — Verification & rollout
- Per-role bilingual Playwright pass (toggle es; confirm primary surfaces show no English leakage;
  toggle en; confirm no Spanish leakage).
- Deploy once foundation + all roles are merged: backend image (App Runner) + Vercel frontend,
  via the established prod-deploy mechanics. No DB migration needed beyond the (already-present)
  `UserSettings.language` column; LIA Verbal bank is a data-file change, not a schema migration.
- Multi-PR: Foundation PR first (must merge before role PRs); then per-role PRs.

## Risks & mitigations
- **Translation quality** (es): machine-translated UI strings may be awkward/incorrect. Mitigation:
  consistent glossary in `common`, per-role verification pass, human spot-check before prod.
- **LIA Verbal psychometrics**: see §4 — provisional + flagged for expert review.
- **Shared-file conflicts**: avoided by namespace split + per-role file ownership + Phase-F handling
  shared surfaces.
- **Parity regression**: prevented by the CI anti-drift guard (§5).
- **Big-bang deploy**: foundation is behavior-preserving (English unchanged by default); role PRs are
  additive translations — low blast radius. Deploy after all merged, or incrementally per role.

## Definition of done
- Every role's primary user-facing surfaces render fully in ES when the user's language is ES, with
  no English leakage, and vice-versa.
- All ~13 AI services output in the user's language.
- Language preference persists (DB) and hydrates on login across devices; Settings picker and header
  switcher are consistent.
- LIA Verbal renders ES (flagged provisional).
- en/es namespaces are key-complete (CI-enforced).
- fr/pt removed.
