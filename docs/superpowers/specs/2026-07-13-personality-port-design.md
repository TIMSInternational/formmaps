# Personality tool port (TIMS binary A/B) → FormMaps — design (2026-07-13)

## Instrument (CONFIRMED = TIMS proprietary binary A/B, NOT MBTI/IRT)
4 dichotomies EI/SN/TF/JP. Binary forced-choice A/B. **Laboral 40** (10/dim) + **Estudiantil 80** (20/dim).
Scoring = simple tally: A→first pole (E/S/T/J), B→second pole (I/N/F/P); higher count wins the letter →
4-letter type. Tie-break = FIRST pole + `balanced:true` (`TIE_BREAK_TO_FIRST_POLE`). Intensity =
winningCount/maxPerDim(10 laboral / 20 estud) ×100. 16 profiles with proprietary aliases + narratives.

## Source (port from — all on disk, verified intact)
- Data: `~/tims-personality-data/personality-items.json` (laboral 40 / estudiantil 80 / ambiguous_pole 3;
  each `{n, dimension, prompt_es, optionA_es, optionA_pole, optionB_es, optionB_pole, prompt_en, optionA_en, optionB_en}`)
  + `personality-profiles.json` (16 profiles, bilingual: type, merged_from, alias/alias_en, tagline/_en,
  description/strengths/weaknesses/improvementAreas/howToDevelop/motivation/howToWorkWith/communication/potential/coachingStrategy each _es/_en).
- TS modules + engine (COPY these, adapt import extensions to `.js` + FormMaps paths):
  `~/tims-suite/apps/api/src/data/personality-items.data.ts`, `personality-profiles.data.ts`,
  `~/tims-suite/apps/api/src/services/personality-scoring.ts` (185 lines, PURE — port verbatim).
  Reference (do NOT copy, adapt to FormMaps conventions): TIMS `personality-assessment.routes.ts`/`.controller.ts`,
  web `PersonalityRadarChart.tsx`/`PersonalityResultsView.tsx`, migration `040_personality_proprietary.sql`.

## FormMaps target (mirror LIA's stack — the cleanest session-lifecycle analog)
### Schema (new tables, CREATE TABLE migration like 20260703000000_lia_tims_parity)
- `PersonalityAssessmentSession`: `id uuid`, `userId`, `variant` (laboral|estudiantil), `status`
  (not_started|in_progress|completed|abandoned), `resolvedType String?`, `dimensionScores Json?`,
  `sessionLanguage String?`, `isActive`, `createdDate`, `updatedAt`. `@@map("personality_assessment_sessions")`, `@@index([userId])`.
- `PersonalityResponse`: `id uuid`, `sessionId`, `itemNumber Int`, `dimension String`, `choice String` (A|B),
  `createdDate`, `updatedAt`, `isActive`. `@@map("personality_responses")`, `@@index([sessionId])`, `@@unique([sessionId, itemNumber])`.
- Serve items from the ported data module (NOT a DB bank table — items are static, like Vocational serves from data).

### Backend
- `api/src/data/personality-items.data.ts` + `personality-profiles.data.ts` (ported; verify 40/80/16 counts in a test).
- `api/src/services/personality/personality-scoring.ts` (ported verbatim, pure) + `personality-session-service.ts`
  (start/getSession/saveAnswer/complete→scorePersonality+resolve profile/getResults; ownership enforced in service;
  answer key / option poles NEVER leaked to the client during the test; results IDOR-protected).
- `api/src/routes/personality.ts` mirroring `lia.ts` shapes: `GET /access`, `POST /start` (body: variant?, language?),
  `GET /session/:id`, `POST /session/:id/answer` ({itemNumber, choice}), `POST /session/:id/complete`,
  `GET /session/:id/results`, `POST /session/:id/violations` (proctoring — reuse `boundViolations`+a session
  violations column; OR reuse the shared proctoring-service pattern), `GET /user/:userId/results`.
  Register in `api/src/index.ts`: `app.use("/api/v1/personality", authenticate, tenantContext, requireSubscription, personalityRouter)`.
- **Variant default**: student platform → default `estudiantil`; accept `variant` param (companies/schools may pick `laboral`).
- **Gating**: rely on `requireSubscription`; add to catalog (below). Do NOT add to `computeStudentCompletion`
  (personality does NOT gate the career/insights pipeline) — state this decision. Optional `SchoolAssessmentConfig`
  row `assessmentType="PERSONALITY"` if a school toggle is wanted (string-keyed, no migration).

### Frontend
- Catalog: add a 4th card to the `assessments` array in `frontend/src/app/dashboard/assessments/page.tsx`
  (key `personality`, href `/dashboard/assessments/personality`) + surface status via `useDashboardAssessmentSummary`.
- Runner: `frontend/src/app/dashboard/assessments/personality/page.tsx` (+ `_components/`) — untimed A/B, one
  item at a time (or short pages), progress N/total, bilingual prompt/options by language. **Mount proctoring**
  (`RequireChromium` + `ProctoredShell` + `useProctoring` + incremental flush) per the "ALL assessments"
  directive (item 1 infra is on this branch's base).
- Results: `frontend/src/app/dashboard/assessments/personality/results/page.tsx` — resolved type + alias +
  recharts `RadarChart` (4 dims normalizedIntensity) + intensity bars + narrative sections (description,
  strengths, weaknesses, improvementAreas, howToDevelop, motivation, howToWorkWith, communication, potential,
  coachingStrategy) by language; `balanced` dims noted. Client `frontend/src/services/personalityService.ts`.
- i18n: `dashboard.personality*` keys in en+es `common.json` (title/description/action). Profile/item text
  comes from the bilingual data by language (like vocational), not i18next.

## Branch / stacking
Branch OFF `feat/proctoring-all-assessments` (item 1, PR #307) because the runner mounts `ProctoredShell`.
PR targets develop but is **stacked on #307** — retarget/rebase after #307 merges (note in PR).

## TDD + gates
- Port scoring test from TIMS (or author): all-A laboral → ESTJ 10/10 each; a mixed estudiantil set →
  expected type with a tie→balanced dim; ÷max normalization (10 & 20); unanswered dim → first pole + balanced.
- Data-integrity test: 40 laboral / 80 estudiantil items, each dimension∈{EI,SN,TF,JP}, poles consistent;
  16 profiles, all 16 type codes present, every narrative field non-empty (es+en).
- Route/service tests (RED→GREEN): start creates session; answer persists + dedupes on re-answer; option poles
  NOT in the served item payload; complete scores + resolves profile; results IDOR (owner/counselor/admin only);
  retake guard (completed → 400/ already-completed).
- Frontend jest: runner renders an item + advances on choice; results renders type+radar+narrative; catalog card.
- Gates: tsc(api+fe) · vitest · jest · next build · i18n en≡es parity. Migration = CREATE TABLE; run `prisma db push`
  + `prisma format` + `prisma generate`.
