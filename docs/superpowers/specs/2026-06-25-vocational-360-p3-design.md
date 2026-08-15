# Vocational 360 — Phase 3 (Scoring Engine) Design

**Date:** 2026-06-25
**Branch:** `feat/vocational-360-p3` (off `develop` @ `c70c74c`)
**Phase:** P3 of 4 (P1 model+seed ✅ · P2 collection ✅ · **P3 scoring engine** · P4 report + PCA/MIL integration)
**Spec lineage:** [P1](2026-06-24-vocational-360-p1-design.md) · [P2a](2026-06-24-vocational-360-p2a-design.md) · [P2b](2026-06-24-vocational-360-p2b-design.md)

## Summary

P3 turns a student's completed vocational evaluations into a **persisted, versioned 360 result**: per-dimension scores, a group-weighted composite with interpretation bands, and the interest/industry/work-type rankings. It consumes the typed `vocational_responses` collected in P2 and the instrument config seeded in P1.

**Backend-only.** P3 ships the scoring engine, the persistence table, the read/recompute endpoints, and an auto-recompute hook. The student/counselor result *view* is P4. The **PCA-30 / MIL-30 integration is explicitly out of scope** (P4 owns the final 40/30/30 composite); P3 produces the `threeSixty` input (the 360 composite) and the qualitative rankings only.

## Decisions (locked in brainstorm)

1. **Scope = 360 scoring only.** Dimensions → group aggregation → 360 composite + bands + rankings. No PCA/MIL integration, no report UI.
2. **Persisted result + on-demand recompute.** A versioned `VocationalResult` snapshot, plus a recompute endpoint. Stable report inputs, history/audit, cheap reads, point-in-time record under the weight version that produced it.
3. **Partial groups: require self + ≥1 other, renormalize present.** No score until `self` plus at least one other group has completed; group weights renormalize over the groups actually present so a non-responding evaluator neither blocks nor deflates the result.
4. **Rankings aggregate across all responding evaluators, group-weighted** (not self-only).

## Background / constraints

- **Methodology is fully encoded in the seeded instrument** (`vocational_instruments` / `vocational_dimensions` / `vocational_questions`, content file `api/scripts/data/vocational-360-instrument.json`):
  - `groupWeights` = `{self:35, parent:25, teacher:25, sibling_friend:15}`
  - `interpretationBands` = `{strong:80, moderateHigh:60, medium:40}`
  - 8 dimensions, weights `[15,20,10,10,10,10,15,10]` = 100, each with a 5-anchor scale.
  - Per-question `scoringRule`: `{kind:"weightedLikert"}` (40 dimension Likerts + group-specific Likerts), `{kind:"rank", topPoints:20}` (prioritization ranking), `{kind:"pickN", n:5, pointsEach:1}` (industries multi-select), `null` (single-select work-type + open → qualitative).
- **Inputs already exist (P2a):** `vocational_responses` rows are typed — `ratingValue` (likert), `rankingOrder` Json `[{value,rank}]`, `selectedValues` Json `string[]`, `textValue` (single-select + open) — keyed by `evaluationGroupId` + `questionNumber`. `EvaluationGroup` carries `instrument='vocational'`, `instrumentVersion`, `groupType` (self|parent|teacher|sibling_friend), `evaluatedUserId`, and `isEvaluationCompleted`.
- **Isolation invariant (carried from P1/P2):** the live generic 360 engine (`Question360`/`EvaluationGroup`/`EvaluationFeedback`, `submit-feedback`, `averageRating`, the assessment-completion gate) MUST NOT change behavior. P3 is purely additive: a new table, a new service, new endpoints, and one guarded best-effort hook call in the **vocational** submit path only.
- **No prod DDL in this branch.** Dev migration via `prisma db push`; the new table lands in prod later via the established in-VPC Fargate idempotent-`CREATE` pattern (batched with the other deferred vocational tables).

## Architecture

### Component 1 — Data model: `VocationalResult` → `vocational_results`

One row per `[evaluatedUserId, instrumentVersion]` (a snapshot; recompute upserts the same row).

| Field | Type | Notes |
|---|---|---|
| `id` | String @id cuid | |
| `evaluatedUserId` | String | the student the result is about; `@@index` |
| `instrumentVersion` | String | the instrument version scored (snapshot under that version's weights) |
| `composite` | Decimal | overall 360 score, 0–100 |
| `band` | String | `strong` \| `moderateHigh` \| `medium` \| `low` |
| `respondentCount` | Int | number of completed groups included |
| `groupsIncluded` | String[] | e.g. `["self","parent","teacher"]` |
| `dimensionScores` | Json | `[{ key, nameEs, score, band, byGroup: { self: n, parent: n, … } }]` (8 entries; a dimension with no responses → `score: null`, excluded from composite) |
| `rankings` | Json | `{ interests: [{area, points}], industries: [{value, count}], workType: { value, count } \| null, openInsights: [{group, text}] }` |
| `weightsApplied` | Json | the renormalized group weights actually used, e.g. self+parent present → `{self:0.583, parent:0.417}` (35/60, 25/60), summing to 1 |
| `computedAt` | DateTime @default(now()) @updatedAt | |

Constraints: `@@unique([evaluatedUserId, instrumentVersion])`, `@@index([evaluatedUserId])`. Decimal columns serialize to strings over JSON → a `serializeVocationalResult()` helper converts Decimal→Number at the route boundary (mirrors the Slice-1 `serializeStudentGpa` pattern), so the API returns numbers, not strings.

**No relation FK to `User`/`EvaluationGroup`** beyond the `evaluatedUserId` scalar — the result is a denormalized snapshot. (Keeps the model decoupled and the prod idempotent-CREATE simple.)

### Component 2 — Scoring service: `api/src/services/vocationalScoringService.ts`

Pure, composable functions so the math is unit-testable with fixtures, independent of Prisma:

- `normalize(rating: number): number` → `((rating − 1) / 4) × 100` (input 1–5 → 0–100).
- `dimensionScoreForGroup(groupResponses, dimensionQuestionNumbers): number | null` → mean of `normalize(ratingValue)` over the dimension's answered `weightedLikert` questions for one group; `null` if none answered (no divide-by-zero).
- `renormalizeGroupWeights(baseWeights, presentGroups): Record<group, number>` → restrict to present groups, divide by their sum so the kept weights total 1.
- `aggregateDimension(byGroupScore, renormWeights): number | null` → group-weighted mean across present groups that have a score for that dimension (weights re-renormalized over the groups present *for that dimension*).
- `composite(dimensionScores, dimensionWeights): number` → dimension-weight-weighted mean over dimensions that have a non-null score (weights renormalized over scored dimensions).
- `band(score, bands): string` → `strong` if ≥80, `moderateHigh` if ≥60, `medium` if ≥40, else `low`.
- `computeRankings(allGroupResponses, renormWeights, questionMeta)`:
  - **interests** (`rank`, topPoints:20): each evaluator's `rankingOrder` distributes points down the list (rank 1 = topPoints, descending); sum points across evaluators **weighted by that evaluator's renormalized group weight**; return areas ordered by total points.
  - **industries** (`pickN`): tally `selectedValues` across evaluators (group-weighted count); return top industries by count.
  - **workType** (`single_select`): group-weighted modal `textValue`; `null` if none.
  - **openInsights** (`open`): collect `{group, text}` verbatim (qualitative, unscored).
- `computeVocationalResult(instrument, completedGroupsWithResponses): VocationalResultPayload | { status: "not_ready", reason }` — orchestrates: enforce the **self + ≥1 other** guard; map each group's responses → per-group dimension scores; renormalize weights over present groups; aggregate → dimensionScores (+ per-dimension band); composite (+ overall band); rankings; assemble `weightsApplied`, `groupsIncluded`, `respondentCount`.

Question-type → contribution rule lives in one place keyed off the seeded `scoringRule.kind` (so re-tuning the instrument changes scoring without code edits). `single_select`/`open` never contribute to the dimension composite.

### Component 3 — Persistence + orchestration: `api/src/services/vocational360Service.ts` (extend existing)

- `loadStudentVocationalData(evaluatedUserId)` → fetch the active instrument (P1) + all `instrument='vocational'` `EvaluationGroup`s for the student with `isEvaluationCompleted=true`, each with its `vocational_responses`.
- `recomputeVocationalResult(evaluatedUserId)` → load data → `computeVocationalResult` → if ready, **upsert** `vocational_results` (keyed `[evaluatedUserId, instrumentVersion]`); if not ready, do not persist (leave any prior snapshot intact) and return the not-ready state.
- `getVocationalResult(evaluatedUserId)` → read the persisted row (or a computed not-ready/never-computed state); apply `serializeVocationalResult`.

### Component 4 — Endpoints (routes under the existing vocational360 router)

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/api/v1/vocational360/score/:evaluatedUserId` | counselor/admin within school scope (mirror existing 360 read gate; `requirePermission`) | returns the persisted result (serialized) or a not-ready/never-computed state — never 500s on "no score yet" |
| POST | `/api/v1/vocational360/score/:evaluatedUserId/recompute` | counselor/admin within scope | forces recompute + upsert; returns the fresh result or not-ready state |

Scope/ownership follows the existing vocational360 + generic-360 pattern (school-scoped reads; IDOR → 404, not 403, consistent with the platform). Validated path param.

### Component 5 — Auto-recompute hook (additive, guarded)

In the **P2a vocational submit-completion path** (`POST /evaluation/vocational/submit`, after the atomic completion flip), append a best-effort call to `recomputeVocationalResult(group.evaluatedUserId)` wrapped in try/catch that **swallows and logs** any error — scoring must never break or roll back a successful evaluator submission. This keeps the persisted snapshot fresh as evaluators finish, while the explicit recompute endpoint covers manual refresh and backfill.

## Data flow

```
evaluator submits (P2a) ──flips isEvaluationCompleted──▶ best-effort recompute hook
                                                              │
counselor GET /score/:id ──┐                                  ▼
counselor POST …/recompute ─┴─▶ recomputeVocationalResult(studentId)
        │
        ├─ loadStudentVocationalData: active instrument + completed vocational groups + responses
        ├─ guard: self present AND ≥1 other present?  ──no──▶ { status:"not_ready", reason }
        ├─ per group: dimensionScoreForGroup over weightedLikert responses
        ├─ renormalizeGroupWeights over present groups
        ├─ aggregateDimension per dimension ▶ dimensionScores (+bands)
        ├─ composite (+band)
        ├─ computeRankings (interests / industries / workType / openInsights), group-weighted
        └─ upsert vocational_results [evaluatedUserId, instrumentVersion]
```

## Error handling & edge cases

- **Self-only / no "other" group** → `not_ready` (`reason: "needs_self_plus_one"`); not persisted.
- **No vocational groups at all** → `never_computed` empty state on GET (200, not 404).
- **Dimension with zero Likert responses** → `score: null`, excluded from composite (composite renormalizes over scored dimensions).
- **Ranking/industry questions unanswered by some groups** → those groups contribute nothing to that ranking; group weights for the ranking renormalize over contributing groups.
- **Unknown/`other` groupType** → excluded (P2a already restricts to `VALID_GROUPS`; defensive filter here too).
- **Recompute hook failure** → logged, swallowed; submit still succeeds.
- **Decimal serialization** → `serializeVocationalResult` converts to Number at the boundary.

## Testing strategy (TDD)

- **Pure scoring unit tests** (`vocationalScoringService.test.ts`, vitest, no Prisma): fixture responses → asserted composite, per-dimension scores + bands, renormalization math (3 groups present → weights sum to 1; missing-dimension renormalization), `normalize` boundaries (1→0, 5→100, 3→50), `band` thresholds (80/60/40 edges), rankings (rank topPoints distribution, pickN tallies, modal workType), self-only guard → not_ready.
- **Orchestration/persistence tests** (mocked Prisma): `recompute` upserts the right row; not-ready does not overwrite a prior snapshot; `getVocationalResult` serializes Decimals.
- **Endpoint integration tests** (mocked Prisma, existing 360 test style): GET returns serialized result / not-ready / never-computed; recompute path; auth-scope (cross-tenant → 404); validated param.
- **Isolation regression:** the existing generic-360 + vocational P2a suites stay green; the submit hook is proven not to alter submit behavior on hook failure (a test forcing the recompute to throw asserts the submit still returns success).

## Out of scope (→ P4)

- PCA + MIL retrieval and the final 40/30/30 integration composite.
- The student/counselor vocational **report UI** and recommendations.
- EN translations of dimension/option labels (seeded `null` since P1).

## Success criteria

- `vocational_results` table added (dev `prisma db push`); no existing table changed; api `tsc` clean.
- Scoring service computes a correct composite + per-dimension scores + bands + rankings from fixtures (unit-verified), with self+≥1-other guard and present-group renormalization.
- GET + recompute endpoints return serialized results / not-ready states, school-scoped; auto-recompute hook fires on vocational submit-completion without ever breaking submit.
- Generic 360 + vocational P2a suites remain green (isolation).
- No prod DDL in the diff (table ships later via Fargate idempotent CREATE).
