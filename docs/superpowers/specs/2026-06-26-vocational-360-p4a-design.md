# Vocational 360 — Phase 4a (360/PCA/MIL Integration Engine) Design

**Date:** 2026-06-26
**Branch:** `feat/vocational-360-p4a` (off `develop` @ `14f20b1`)
**Phase:** P4a of P4 (P4a **integration engine** · P4b report UI · P4c recommendations)
**Spec lineage:** [P1](2026-06-24-vocational-360-p1-design.md) · [P2a](2026-06-24-vocational-360-p2a-design.md) · [P2b](2026-06-24-vocational-360-p2b-design.md) · [P3](2026-06-25-vocational-360-p3-design.md)

## Summary

P4a produces the methodology's **headline integrated vocational score**: `integratedComposite = 0.4×(360 composite) + 0.3×(PCA) + 0.3×(MIL)`, with an interpretation band, persisted as a versioned snapshot. Backend-only. The report UI is P4b; recommendations are P4c.

This combines the P3 vocational-360 composite with the student's existing **PCA** (Professional Competencies Assessment) and **MIL** (LIA cognitive) results. The instrument's `integrationWeights` (`{threeSixty:40, pca:30, mil:30}`) were verified verbatim against the source Metodología sheet (*"Integración final … 360 40%; PCA 30%; MIL 30%"*).

## Decisions (locked in brainstorm)

1. **Scope = integration scoring engine only** (backend, persisted). Report UI → P4b, recommendations → P4c.
2. **PCA 30% = competences average.** The PCA payload's `competences` (12 levels, 1–4) → `((meanLevel − 1) / 3) × 100`. JCA-fit (`jcaResult`) is infeasible — it's intentionally NOT captured (needs a per-job `JcaCodExt` target). PCA *is* the Professional Competencies Assessment, so the competences average is the correct, available signal.
3. **MIL 30% = simple mean of the five LIA cognitive domain scores** (`lia.mil`, already 0–100). Transparent and consistent with the 360's simple-average philosophy. (The source leaves PCA/MIL scalarization to implementation — *"la ponderación debe validarse con casos reales"* — so both #2 and #3 are tunable defaults, documented as such.)
4. **Require all three present** (360 `ready` AND PCA competences present AND MIL complete); otherwise `not_ready` with the missing component(s). The standalone P3 360 result remains available regardless. The 40/30/30 is the definitive output — a renormalized 2-of-3 version would be a different metric presented as the headline.
5. **Persisted snapshot + on-demand recompute.** A new `VocationalIntegratedResult` table (separate from P3's `VocationalResult`); recompute is on-demand via endpoint (auto-trigger wiring deferred to P4b).

## Background / constraints

- **Canonical inputs (reuse, don't re-derive):**
  - **360 composite** = P3's `getVocationalResult(studentId)` → when `status==="ready"`, its `composite` (0–100). Anything else → 360 missing.
  - **PCA + MIL** = `assembleCompleteProfile(userId)` from `lib/assessmentProfile.ts` — the authoritative assembler whose own contract states *"no consumer should read raw assessment tables directly."* It returns `pca.competences: {name, level}[] | null`, `lia.mil: {milReasoning, milDetection, milNumeric, milMemory, milOrientation}` (each 0–100), and `completeness: { lia: boolean; pca: boolean; threeSixty: boolean }`.
- **Guard signals:** 360 = P3 `status==="ready"`; PCA = `pca.competences` non-null and non-empty; MIL = `completeness.lia === true`.
- **Reuse `band` + `round2`** from `vocationalScoringService.ts` (P3) — same band thresholds (≥80 strong / ≥60 moderateHigh / ≥40 medium / else low), no duplication.
- **Isolation:** additive only. `assembleCompleteProfile`, the P3 scoring engine, the generic 360, and the P2 take/submit flow are untouched. The only schema change is the NEW `vocational_integrated_results` table.
- **No prod DDL in this branch** — dev `prisma db push`; the table ships to prod via the in-VPC Fargate idempotent-CREATE (batched with the other deferred vocational tables).
- API/security rules (api-standards.md): `{success,data}` envelopes, service-layer pattern, no `req.body` spread, IDOR → 404, no `err.message` leak, no new `any` (`unknown`+narrow), Decimal→Number at the boundary, ESM `.js` imports.

## Architecture

### Component 1 — Data model: `VocationalIntegratedResult` → `vocational_integrated_results`

One row per `[evaluatedUserId, instrumentVersion]` (snapshot; recompute upserts).

| Field | Type | Notes |
|---|---|---|
| `id` | String @id @default(uuid) | |
| `evaluatedUserId` | String | the student; `@@index` |
| `instrumentVersion` | String | instrument version scored |
| `integratedComposite` | Decimal | `0.4×360 + 0.3×PCA + 0.3×MIL`, 0–100 |
| `band` | String | strong \| moderateHigh \| medium \| low |
| `threeSixtyScore` | Decimal | the P3 composite used (0–100) |
| `pcaScore` | Decimal | competences-average component (0–100) |
| `milScore` | Decimal | cognitive-mean component (0–100) |
| `weightsApplied` | Json | `{threeSixty, pca, mil}` (normalized to sum 1) used |
| `isActive` | Boolean @default(true) | |
| `createdBy`/`updatedBy` | String? | |
| `createdDate` | DateTime @default(now) | |
| `computedAt` | DateTime @default(now) @updatedAt | |

`@@unique([evaluatedUserId, instrumentVersion])`, `@@index([evaluatedUserId])`, `@@map("vocational_integrated_results")`. Decimal columns → Number via a `serializeIntegratedResult` at the route boundary.

### Component 2 — Pure integration service: `api/src/services/vocationalIntegrationService.ts`

Pure, fixture-testable (no Prisma). Reuses `band`, `round2` from `vocationalScoringService.js`.

- `competencesToScore(competences: { name: string; level: number }[]): number | null` → `null` if empty; else `round2(((mean(levels) − 1) / 3) × 100)` (level 1→0, 4→100).
- `milToScore(mil: { milReasoning:number; milDetection:number; milNumeric:number; milMemory:number; milOrientation:number }): number` → `round2(mean of the five)`.
- `normalizeIntegrationWeights(w: { threeSixty:number; pca:number; mil:number }): { threeSixty:number; pca:number; mil:number }` → divide each by their sum (so 40/30/30 → 0.4/0.3/0.3).
- `integrate(threeSixty: number, pca: number, mil: number, w): number` → `round2(threeSixty×w.threeSixty + pca×w.pca + mil×w.mil)`.
- Types: `IntegrationConfig { instrumentVersion; integrationWeights; bands }`, `IntegrationInputs { threeSixty: number | null; pcaScore: number | null; milScore: number | null }`, `IntegratedResultPayload { status:"ready"; instrumentVersion; integratedComposite; band; threeSixtyScore; pcaScore; milScore; weightsApplied }`, `IntegrationOutcome = IntegratedResultPayload | { status:"not_ready"; missing: string[] }`.
- `computeIntegratedResult(config, inputs): IntegrationOutcome` — collect `missing` (`"360"` if `threeSixty===null`, `"pca"` if `pcaScore===null`, `"mil"` if `milScore===null`); if any missing → `{status:"not_ready", missing}`; else normalize weights, `integrate`, `band`, assemble payload.

### Component 3 — Orchestration: extend `api/src/services/vocational360Service.ts`

- `loadIntegrationInputs(evaluatedUserId)` → in parallel: `getVocationalResult(id)` (P3) and `assembleCompleteProfile(id)`; plus the active instrument's `integrationWeights` + `interpretationBands` (reuse the existing active-instrument query). Build `IntegrationInputs`: `threeSixty` = 360 `status==="ready" ? composite : null`; `pcaScore` = `competencesToScore(profile.pca.competences ?? [])` (null if absent/empty); `milScore` = `profile.completeness.lia ? milToScore(profile.lia.mil) : null`.
- `recomputeIntegratedResult(evaluatedUserId)` → load → `computeIntegratedResult` → if `ready` upsert `vocational_integrated_results` (keyed `[evaluatedUserId, instrumentVersion]`, explicit fields); else return the outcome WITHOUT persisting (leave any prior snapshot). No active instrument → `{status:"never_computed"}`.
- `getIntegratedResult(evaluatedUserId)` → active-version lookup → `findUnique` → `serializeIntegratedResult` or `{status:"never_computed"}`.
- `serializeIntegratedResult(row)` → Decimal→Number on `integratedComposite`/`threeSixtyScore`/`pcaScore`/`milScore`; JSON passthrough on `weightsApplied`; `status:"ready"`.

### Component 4 — Endpoints (existing `vocational360` router, mounted `/api/v1/vocational360` WITH `authenticate`)

| Method | Path | Behavior |
|---|---|---|
| GET | `/integrated/:evaluatedUserId` | `canAccessUser` scope → deny 404; else `getIntegratedResult` (serialized / not_ready / never_computed) |
| POST | `/integrated/:evaluatedUserId/recompute` | same scope → 404; else `recomputeIntegratedResult` |

Param bound `(qs(...) || "").slice(0,100)`; try/catch → 500 fixed string; never leak `err.message`. Mirrors the P3 score endpoints exactly.

## Data flow

```
counselor GET /integrated/:id ──┐
counselor POST …/recompute ─────┴─▶ recomputeIntegratedResult(studentId)
        │
        ├─ parallel: getVocationalResult(id) [P3]  +  assembleCompleteProfile(id)  +  active instrument weights/bands
        ├─ threeSixty = 360.ready ? 360.composite : null
        ├─ pcaScore   = competencesToScore(profile.pca.competences)   // null if none
        ├─ milScore   = completeness.lia ? milToScore(profile.lia.mil) : null
        ├─ computeIntegratedResult → missing any? ──▶ { not_ready, missing:[...] }  (no write)
        └─ else integrate 0.4/0.3/0.3 → band → upsert vocational_integrated_results
```

## Error handling & edge cases

- **Any component missing** → `not_ready` with `missing:[...]`; not persisted.
- **No active instrument** → `never_computed` (GET 200, not 404).
- **Empty competences array** → PCA `null` → `not_ready` (`missing:["pca"]`).
- **MIL not complete** (`completeness.lia` false) → `null` → `not_ready` (`missing:["mil"]`).
- **Decimal serialization** at the boundary.
- **IDOR** → 404 before any load.

## Testing strategy (TDD)

- **Pure unit tests** (`vocationalIntegrationService.test.ts`, vitest): `competencesToScore` (levels 1→0, 4→100, mean, empty→null), `milToScore` (mean of five), `normalizeIntegrationWeights` (40/30/30→0.4/0.3/0.3 sum 1), `integrate` (worked example: 360=80, pca=60, mil=50 → 0.4×80+0.3×60+0.3×50=65), `band` reuse, `computeIntegratedResult` guard (each single-missing path → not_ready with right `missing`; all-present → ready).
- **Orchestration/persistence** (mocked Prisma + mocked `getVocationalResult`/`assembleCompleteProfile`): ready → upsert correct key/fields; not_ready → no upsert; serialize Decimals.
- **Endpoint integration** (mocked, existing 360 route test style): GET/recompute happy + not_ready + IDOR→404 (service not called on deny).
- **Isolation regression:** P3 + generic-360 + P2 suites stay green; `assembleCompleteProfile` untouched.
- **Live API verify** (dev DB): seed a student with completed 360 (P3 ready) + PCA competences + MIL exams → recompute → integrated row with composite/band; remove one component → not_ready with `missing`; IDOR → 404.

## Out of scope (→ P4b / P4c)

- The vocational **report UI** (student + counselor surfaces) and auto-recompute triggers.
- **Recommendations** (career/university/industry) — reuse the existing `careerService.scoreCareers` machinery in P4c.
- Tuning/validation of the PCA/MIL scalarization against real cases ("validar con casos reales").

## Success criteria

- `vocational_integrated_results` table added (dev `prisma db push`); no existing table changed; api `tsc` clean.
- Integration math correct from fixtures (composite, band, normalization, each guard path), reusing `band`/`round2`.
- GET + recompute endpoints return serialized results / not_ready (with `missing`) / never_computed; school-scoped; IDOR→404.
- P3 + generic-360 + P2 suites remain green (isolation).
- No prod DDL in the diff.
