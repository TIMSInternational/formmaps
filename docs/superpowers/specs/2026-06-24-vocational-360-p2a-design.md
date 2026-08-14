# Vocational 360 — Phase 2a (Backend Collection) Design Spec

**Date:** 2026-06-24
**Branch:** `feat/vocational-360-p2a` (off `develop` @ c8e44cb, which has P1)
**Status:** Approved (design), ready for plan
**Phase:** P2a of the P2 collection slice (P2a backend · P2b frontend renderers)

## Problem & context

P1 shipped the vocational instrument model + seed + read endpoints (`getQuestionnaire(group)`). P2 lets the 4 evaluator groups (self/parent/teacher/sibling_friend) actually **take** the questionnaire — rendering and storing all 4 question types with group-adapted wording — **reusing the existing `EvaluationGroup` invite/token/email/completion machinery**, without destabilizing the live generic-360 take-flow.

The generic 360 take-flow (`/evaluation` tree) is **public + token-based** but **rating-centric**: the submit Zod schema hardcodes `rating: z.number().min(1).max(5)`, `submitFeedback`'s `averageRating` assumes every answer is numeric, and `get360EvaluatorForm` serves `Question360` keyed by `relationType`. P1's `/api/v1/vocational360/questionnaire` is **auth-gated + `?group=`-keyed**, so it cannot serve a token-link evaluator.

## Decisions (locked with user)

1. **Parallel + typed isolation.** A separate public token-keyed vocational take + submit route, storing into a NEW typed `VocationalResponse` table. The live generic path (`submit-feedback`, `averageRating`, insight derivation, `lib/evaluation360`) is **untouched**. Mirrors the P1 Option-B isolation.
2. **Two slices.** **P2a = backend** (this spec): discriminator + public vocational take/submit + `VocationalResponse` + groupType normalization + tests. **P2b = frontend** (separate spec): per-type renderers + typed submit + invite-dialog changes.
3. Reuse `EvaluationGroup` for the evaluator/invite/token/completion layer (instrument-agnostic); add a nullable discriminator.

## Schema changes (`api/prisma/schema.prisma`)

### `EvaluationGroup` — add 2 nullable columns (additive, no backfill; `null` = generic 360)
- `instrument String?` — `"vocational"` for a vocational evaluator; null/absent = the existing generic 360.
- `instrumentVersion String?` — the `VocationalInstrument.version` (e.g. `"v1"`) this group answers; lets a group's responses pin to the instrument version they saw.

No change to the `@@unique([evaluatedUserId, evaluatorEmail, groupType])`.

### `VocationalResponse` (new) → `vocational_responses`
One row per answered question per evaluator.
- `id`, `evaluationGroupId` (FK → `EvaluationGroup`, Cascade), `instrumentVersion String`, `group String` (self|parent|teacher|sibling_friend), `questionNumber Int`, `dimensionKey String?`, `type String` (likert|ranking|multi_select|single_select|open),
- typed answer columns (exactly one populated per `type`): `ratingValue Int?` (likert), `rankingOrder Json?` (`[{value, rank}]`), `selectedValues Json?` (`string[]`), `textValue String?` (open/single-select stores the chosen value or text),
- audit cols. `@@unique([evaluationGroupId, questionNumber])` (one answer per question per evaluator), `@@index([evaluationGroupId])`.

Rationale for a typed table over extending `feedbackItems` JSON: P3 scoring needs typed, queryable per-dimension answers (normalization + weighting), and the generic path's rating-centric `averageRating`/insight code would choke on mixed answer types. Typed columns align with P1's `scoringRule`/weights and keep the generic path clean.

## Backend — public token-keyed vocational take + submit

New route group in the **public** `/evaluation` tree (mounted without `authenticate`, gated by the existing limiter + the token), e.g. `api/src/routes/vocationalTake.ts` mounted at `/evaluation/vocational`, or branched inside `evaluation.ts` — keep it a dedicated file for isolation. Service: `api/src/services/vocationalTakeService.ts`.

### `GET /evaluation/vocational/:token`
- Resolve the `EvaluationGroup` by `invitationToken` (findFirst); 404 if none / token expired.
- Require `group.instrument === "vocational"` (else 404 — a generic token must not hit this route).
- If `group.isEvaluationCompleted` → `{ completed: true, questions: [] }`.
- Normalize `group.groupType` → one of `VALID_GROUPS` via a shared `normalizeVocationalGroup(groupType)` (handles legacy casing `SiblingFriend`→`sibling_friend`; **a groupType that normalizes to `"other"` → 400 "No questionnaire for this group"** since P1 has no `other` questionnaire).
- Return `getQuestionnaire(normalizedGroup)` (P1 service) + `{ studentName, evaluatorName, group, instrumentVersion }`.

### `POST /evaluation/vocational/submit`
- Body: `{ token, answers: [{ questionNumber, type, ratingValue?, rankingOrder?, selectedValues?, textValue? }] }` — a zod **discriminated union on `type`** (each branch validates only its own payload shape; bounds on array lengths and string lengths).
- Resolve + validate the group (vocational instrument, token valid, not already completed).
- Validate each answer against the question definition (the question with that `number` exists for this group's questionnaire; `type` matches; `ratingValue` within 1–5; `selectedValues`/`rankingOrder` values ∈ the question's `options`; pick-N respects `scoringRule.n`).
- In a single `$transaction`: upsert `VocationalResponse` rows keyed `(evaluationGroupId, questionNumber)`, then set `EvaluationGroup.isEvaluationCompleted = true`, `isTokenUsed = true`, `evaluationCompletedDate`. (Reuses the generic completion semantics.)
- `{success,data}` envelope; never leak err.message; no `req.body` spread; bound all strings/arrays.

### Invite-create persistence (`evaluationService.ts createEvaluationGroup`)
Add `instrument`/`instrumentVersion` to the explicitly-picked create fields (still no `req.body` spread). Defaults null (generic). The invite URL is unchanged (`/evaluation/evaluator?token=`); **the frontend (P2b) reads `group.instrument` to route to the vocational take UI** — out of P2a scope. For P2a, a test/seed can create a vocational `EvaluationGroup` directly.

### groupType normalization
`normalizeVocationalGroup(groupType: string): VocationalGroup | null` in `vocational360Service.ts` (or a shared lib): lowercases, maps `siblingfriend`/`sibling_friend`→`sibling_friend`, `self`/`parent`/`teacher` through; returns `null` for `other`/unknown. The take + submit routes 400 on null.

## Out of P2a scope
- P2b: the evaluator-page fetch branch, the per-type renderers (ranking-of-20, pick-5, single-select, open) + per-question scale, widened `QuestionResponse`, typed submit mapping, and the `Student360Dialog` instrument selector + `self` option.
- P3 scoring engine; P4 report + PCA/MIL.

## Verification (P2a)
- Migration applies (2 added columns + 1 new table) — dev `prisma db push`; prod later via Fargate.
- Supertest (mocked prisma) for the take + submit routes:
  - `GET /evaluation/vocational/:token` for a vocational group → 200 with the group's questionnaire (50 items); a generic-instrument token → 404; an `other`/unmappable groupType → 400; a completed group → `{completed:true}`.
  - `POST submit` happy path: typed answers (a likert, a ranking, a pick-5, a single-select, an open) → 200, creates the right `VocationalResponse` rows, flips completion; re-submit on a completed group → rejected.
  - Validation: out-of-range rating → 400; a selected value not in options → 400; wrong `type` for a question → 400.
- Unit test for `normalizeVocationalGroup` (legacy casing, self/parent/teacher/sibling_friend, other→null).
- api `tsc` clean; the generic 360 tests still green (proves isolation — no change to `submit-feedback`/`get360EvaluatorForm`).

## No change to the live generic 360
`submit-feedback`, `get360EvaluatorForm`, `averageRating`, `lib/evaluation360`, the insight trigger, and `Question360` are **untouched**. Only additive: 2 nullable `EvaluationGroup` columns, 1 new table, 1 new public route file, `createEvaluationGroup` gains 2 optional picked fields.

## Critical files
- `api/prisma/schema.prisma` — `EvaluationGroup` +2 cols; new `VocationalResponse`.
- `api/src/routes/vocationalTake.ts` (new) + mount in `index.ts` under `/evaluation/vocational` (public, no authenticate).
- `api/src/services/vocationalTakeService.ts` (new) — take + submit logic.
- `api/src/services/vocational360Service.ts` — add `normalizeVocationalGroup`.
- `api/src/services/evaluationService.ts:createEvaluationGroup` — persist instrument/instrumentVersion (additive).
- Tests: `api/src/__tests__/vocational-take.test.ts`, `vocational-submit.test.ts`, `normalize-group.test.ts`.
