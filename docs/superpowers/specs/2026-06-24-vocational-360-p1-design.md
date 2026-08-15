# Vocational 360 — Phase 1 (Instrument Model + Seed) Design Spec

**Date:** 2026-06-24
**Branch:** `feat/vocational-360` (off `develop`)
**Status:** Approved (design), ready for plan
**Phase:** P1 of 4 (P1 model+seed · P2 collection · P3 scoring engine · P4 report + PCA/MIL integration)

## Problem & context

The "Evaluación 360 de Orientación Vocacional" instrument (source spreadsheet: 4 evaluator-group sheets + a methodology sheet) is a richer 360 than anything the platform currently models: **8 weighted dimensions each with its own 1–5 scale, four question types (Likert / ranking / multi-select / single-select / open), per-group perspective-adapted wording plus genuinely group-specific questions, and a weighted normalization + group-aggregation scoring methodology** that ultimately composes with PCA and MIL.

The existing FormMaps 360 engine (`Question360` / `EvaluationGroup` / `EvaluationFeedback`) is a **single-type 1–5 Likert + comment** instrument with per-group question variants (via `relationType`), a hardcoded evaluator-group multiplier, read-time category averaging, and completion gated on evaluator count. It has **no** question type, per-question scale, dimension, weight, ranking/pick-N, normalization, or persisted scoring. That model is *live* (it feeds career/university matching and the assessment-completion gate), so mutating it is risky.

**Decision (locked with user): Option B** — build a purpose-built, versioned vocational-360 instrument with its own models, and **reuse the proven `EvaluationGroup` email/token/invite/completion machinery** in later phases (P2). The live generic 360 is untouched.

P1 scope = **data model + migration + seed + read endpoints + tests.** No collection/take-flow, no scoring engine (those are P2/P3).

## Locked decisions

1. **Versioned instrument container** (`VocationalInstrument`) — the methodology sheet explicitly says weights "must be validated with real cases," so weights/bands are versioned config, not flat constants.
2. **Variant-table for wording** — the 45 questions shared across all groups are single-sourced with 4 perspective variants; the genuinely group-specific questions (N46–50, different per group) are separate question rows tagged to one group. (Validated counts below.)
3. **Plain `String` for type/block/group/status** (not Prisma enums) — matches the existing 360 convention (`Question360` uses no enums); allowed values validated in code (zod).
4. **Global config, no tenant RLS** — like `questions_360`, the instrument is platform-level, not school-scoped. (Student-scoped *responses* arrive in P2 via `EvaluationGroup`.)
5. **Spanish-primary, English optional** — source is ES; `textEn`/`nameEn` are nullable now, translatable in a later pass.

## Validated instrument shape (from the extracted source-of-truth)

The full instrument has been extracted and validated:
- **8 dimensions**, weights `[15, 20, 10, 10, 10, 10, 15, 10]` = **100%**; every dimension scale has exactly **5 anchors**.
- **45 shared questions** (40 Likert across the 8 dimensions + 4 priorización + 1 open), each with **4 perspective variants** (self/parent/teacher/sibling_friend).
- **20 group-specific question rows** (N46–50 × 4 groups; mixed types: 9 open, 4 Likert, 4 multi-select, 2 single-select, 1 ranking), each with **1 variant**.
- **65 `VocationalQuestion` rows total; 200 variants** (45×4 + 20×1). A single group's questionnaire = 45 shared + 5 group-specific = **50 questions**.
- Group aggregate weights: self 35 / parent 25 / teacher 25 / sibling_friend 15. Integration: 360 40 / PCA 30 / MIL 30. Bands: strong ≥80, moderate-high ≥60, medium ≥40.

> Build note: dimension `key` slugs must strip Spanish accents (`habilidades académicas → habilidades_academicas`), not drop them.

## Data model (new — `api/prisma/schema.prisma`)

All models: `id` uuid PK, `isActive`, `createdBy/createdDate/updatedBy/updatedAt` audit, `@@map("snake_case")`, FK `@@index`.

### `VocationalInstrument` → `vocational_instruments`
`version String` (e.g. "v1"), `name String`, `status String @default("draft")` (draft|active), `groupWeights Json` (`{self,parent,teacher,sibling_friend}`), `integrationWeights Json` (`{threeSixty,pca,mil}`), `interpretationBands Json` (`{strong,moderateHigh,medium}`). Relations: `dimensions`, `questions`. `@@unique([version])`.

### `VocationalDimension` → `vocational_dimensions`
`instrumentId` (FK → instrument, Cascade), `key String`, `nameEs String`, `nameEn String?`, `objective String`, `weight Decimal`, `scaleAnchors Json` (array of exactly 5 strings, index 0 = score 1 … index 4 = score 5), `order Int`. `@@unique([instrumentId, key])`, `@@index([instrumentId])`. Relation: `questions`.

### `VocationalQuestion` → `vocational_questions`
`instrumentId` (FK), `dimensionId String?` (FK → dimension, null for non-dimension blocks), `block String` (`dimension|prioritization|open|group_specific`), `number Int`, `type String` (`likert|ranking|multi_select|single_select|open`), `area String?`, `scaleAnchors Json?` (null = inherit the dimension's; set for group-specific Likerts like "Escala de Claridad"), `options Json?` (option lists for ranking/select — array of `{value, labelEs, labelEn?}`), `scoringRule Json?` (`{kind:"rank", topPoints:20}` | `{kind:"pickN", n:5, pointsEach:1}` | `{kind:"weightedLikert"}` | null), `group String?` (set to the single group for `group_specific`; null = applies to all groups), `order Int`. `@@index([instrumentId])`, `@@index([dimensionId])`. Relation: `variants`.

### `VocationalQuestionVariant` → `vocational_question_variants`
`questionId` (FK → question, Cascade), `group String` (`self|parent|teacher|sibling_friend`), `textEs String`, `textEn String?`. `@@unique([questionId, group])`, `@@index([questionId])`.

**Group-applicability rule:** a group's questionnaire = questions where (`group IS NULL` OR `group = :g`), ordered by `order`/`number`, each rendered with its variant for `:g` (shared questions have a variant per group; group-specific have exactly one). The per-dimension scale resolves from `question.scaleAnchors ?? dimension.scaleAnchors`.

## Seed — `api/scripts/seed-vocational-360.ts`

Idempotent (upsert keyed by `(instrument.version, dimension.key)`, `(instrument.version, question.number, question.group)`, `(question, variant.group)`). Re-runnable without duplication.

The instrument content is committed to the repo as a reviewable data file — `api/scripts/data/vocational-360-instrument.json` — derived from the source spreadsheet (the validated extraction: 1 instrument, 8 dimensions with weights + 5-anchor scales + objectives, 65 questions with types/areas/options/scoring rules, 200 variants with ES wording per group, EN null for now, accent-stripped dimension keys). The seed script reads this committed file (no dependency on the original `.xlsx` or any ephemeral path), so the seed is reproducible and the content is diff-reviewable. The extraction → JSON step is a one-time build task that normalizes the spreadsheet into this file.

## Read endpoints — `api/src/routes/vocational360.ts` + `api/src/services/vocational360Service.ts`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/vocational360/instrument` | The active instrument + dimensions (weights, scales, bands) — config for later phases. |
| GET | `/api/v1/vocational360/questionnaire?group=self` | The ordered 50-question questionnaire for one group: each question with resolved scale + the group's variant text + options. Validates `group ∈ {self,parent,teacher,sibling_friend}`. |

`{success,data}` envelope, `requireAuth`, no `req.body` spread, `logger.error` + generic message in catch. Service layer holds the assembly logic; route validates + thin.

## Out of P1 scope (later phases)
- P2: extend the evaluator take-flow to render/store all four question types with per-dimension scales + group wording (reusing `EvaluationGroup` invite/token/completion + an `instrument` discriminator).
- P3: the scoring engine — normalization `((r−1)/4)×100`, per-dimension weighted scores, group weighting + aggregation, bands, and the separate ranking/industry/activity scoring.
- P4: vocational report + 360/PCA/MIL integration → recommendations.

## Verification (P1)
- Migration applies (new tables) — dev `prisma db push`; prod (later) idempotent `CREATE TABLE IF NOT EXISTS` via the in-VPC Fargate pattern.
- Seed populates **1 instrument / 8 dimensions / 65 questions / 200 variants**; unit test asserts dimension weights sum to 100, every dimension `scaleAnchors` has length 5, and every shared question has exactly 4 variants / every group-specific exactly 1.
- `GET /questionnaire?group=:g` returns exactly **50 questions** for each of the 4 groups, in order, with the correct resolved scale and the right variant text (spot-assert the self vs parent wording differs on a shared question; assert a group-specific question only appears for its own group).
- `GET /instrument` returns the 8 weighted dimensions + bands.
- api `tsc` clean; service + route unit/integration tests (mocked Prisma, mirroring the existing 360 test style).

## Critical files
- `api/prisma/schema.prisma` — 4 new models (no change to `Question360`/`EvaluationGroup`/`EvaluationFeedback`).
- `api/scripts/seed-vocational-360.ts` — new seed.
- `api/src/services/vocational360Service.ts`, `api/src/routes/vocational360.ts` — new read layer; mount under `/api/v1/vocational360` in `api/src/index.ts`.
- Source-of-truth content: the validated extraction of the 4 group sheets + methodology sheet.

## No change to live systems
`Question360`, `EvaluationGroup`, `EvaluationFeedback`, the take-flow, career/university matching, and the completion gate are **untouched** in P1.
