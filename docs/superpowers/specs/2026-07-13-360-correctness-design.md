# 360° Correctness Batch — Design

**Date:** 2026-07-13 · **Branch:** `fix/360-correctness` (off `develop`) · **Migration:** none

## Context
Real end-to-end testing (IntroShips family) surfaced several defects in the 360° evaluation
take-flow. The full **Vocational 360** instrument (P1–P4c: `VocationalInstrument` + 8 weighted
dimensions, ~50 questions/group) is built and seeded **active** in prod, but the take-flow still
serves the legacy **generic** 20-question 360. Plus: skippable questions, dead evaluator links,
a zoom-dependent nav bar, and a possibly-frozen progress counter.

## Verified coupling (why Option A is safe)
- The vocational take flips the **same** `EvaluationGroup.isEvaluationCompleted`
  (`vocationalTakeService.ts:89`) that the funnel completion gate counts
  (`assessmentService.ts:408/587/608`). → completing a vocational 360 **unlocks career matching**.
- The profile's 360-derived *interest scores* still read the **generic** `evaluationFeedback`
  (`assessmentProfile.ts:173-180`); vocational writes `VocationalResponse`. → with vocational-only,
  career matching still runs (DISC 40% + MIL 35% + motivators 10%) but temporarily loses the 360
  interest contribution (~15%). The dedicated vocational report/recommendations (P4b/P4c) already
  consume the rich vocational data.

## Decision: **Option A** (approved)
Serve the vocational 360 by default now; wiring vocational dimensions → career interest scores is a
**fast-follow**, out of scope for this batch.

## Fixes

### 1. Serve the real vocational 360 (`#4`)
- **Backend** `createEvaluationGroup` (`evaluationService.ts:24-59`): when `opts.instrument` is
  omitted, resolve to the active `VocationalInstrument` (query `status:"active"`) and persist
  `instrument:"vocational"` + `instrumentVersion`. Only serve generic when a caller explicitly
  passes `instrument:"generic"`.
- Existing generic groups (no instrument column set) keep rendering generically — no data change,
  in-flight invites unaffected.
- Frontend invite paths already omit `instrument`, so they inherit vocational automatically. The
  counselor `Student360Dialog` default flips to vocational.
- **Family follow-up (operational, not code):** regenerate the family's existing generic invites so
  they get the vocational instrument.

### 2. Require an answer per question (`#5`)
- Client: disable "Próximo"/"Submit" until the current question has a response
  (`VocationalEvaluator` / `EvaluatorNavigation`).
- Server: the vocational submit enforces full coverage (every question answered) before completing.

### 3. Kill "Group not found" dead-ends (`#6`)
- `get360EvaluatorForm` / `validateToken` (`evaluationService.ts:257-263, 98-112`): distinguish
  missing / expired / already-used with typed reasons instead of a bare null→404.
- Parent/student evaluator lists: don't surface a "Complete Evaluation" link for a null/expired
  `invitationToken`.

### 4. Fix the ≥80%-zoom nav (`#9`)
- The standalone evaluator page (`evaluation/evaluator/page.tsx`) lives outside AppShell under
  `body{overflow:hidden}` (`globals.css:128-132`) with a `fixed→md:relative` nav flip
  (`EvaluatorNavigation.tsx:31`). Give the page its own `overflow-y-auto` scroll region and keep the
  nav reachable at every zoom/width.

### 5. Progress counter (`#7`)
- Repro live in the evaluator runner; the code binds header/card/dots to one `currentStep`, so if it
  reproduces it's a display-binding edge case — fix it, else confirm resolved.

## Out of scope (fast-follow)
- Wiring vocational dimensions into the career/university interest signal (Option B).
- Making the vocational report the primary career surface.
- Proctoring, parent-portal 500, readability (#298), personality tool — separate batches.

## Test plan (TDD)
- Backend vitest: `createEvaluationGroup` defaults to vocational when omitted; generic when explicit;
  token lookup returns typed reasons for expired/used/missing; vocational submit rejects incomplete
  coverage. All existing evaluation/generic-360 tests stay green (isolation).
- Frontend jest: evaluator nav disabled until answered; dead-link list filtering.
- Gates: tsc (api+fe) · vitest · jest · next build · i18n parity. Codex review before PR.
