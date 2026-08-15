# Complete Assessment Engine Intake — Design Spec

**Date:** 2026-06-16
**Status:** Approved (Approach A), pending spec review
**Goal:** Make the recommendation/AI engine receive **absolutely everything** gathered by the three assessments — PCA (Personal Competence Analysis), LIA (Labor Intelligence Assessment), and the 360 evaluation — as one complete, **server-authoritative** profile, so the AI can do the complete analysis (best careers, best schools, courses, admission).

---

## 1. Problem / current state (evidence)

The engine today receives a **partial, partly client-supplied, partly never-persisted** dataset:

| Assessment | Produced | Persisted? | Reaches engine? |
|---|---|---|---|
| **LIA** (5 cognitive exams) | per-exam score/accuracy/time, weighted composite, band | ✅ `PCAExamSession` | ✅ mapped to `milX` via `getCognitiveMilScores` (`assessmentService.ts:348`), but only written to the profile when insights generation runs |
| **PCA / DISC** (TIMS) | DISC numeric `PcaD1–4`, **Competences**, **PCA-vs-JCA gap** | ❌ **only an `isCompleted` flag** (`PCAEvaluation`); results are proxied to the browser and discarded | ⚠️ DISC reaches careers only as a **client-supplied `req.body.discScores`** (`careerService.ts:246`, route `career.ts:104`), stored at most as a binary `"Active"/"Passive"` label. **Competences + JCA reach nothing.** |
| **360** | ~70 category averages × 4 relations + free-text | ✅ `evaluation_groups`/`evaluation_feedbacks` | ✅ aggregation verified working (`lib/evaluation360.ts`) |

Verified gaps:
- **PCA results are never stored** — `pcaapi.ts` `get-result`/`get-competences`/`pca-vs-jca` fetch from TIMS, set `isCompleted`, and return to the browser only.
- **Career + admission engines read non-authoritative inputs** — `scoreCareers` trusts `req.body` for DISC/MIL (flat fallbacks if omitted: MIL=75, DISC=0); `buildStudentProfile` (`collegeTrackingService.ts:121–125`) reads `milX`/DISC from possibly-stale `UserCareerProfile` columns.
- **`derivedInterests`, `derivedMotivators`, `interestScores`, `motivatorScores` are never populated** — only ever set to empty defaults (`assessmentService.ts:377`). The admission engine consumes `derivedInterests`/`derivedMotivators` and gets nothing.

## 2. Goal & non-goals

**Goal:** One server-authoritative `CompleteAssessmentProfile` assembled from all persisted assessment data, consumed by every engine (careers, universities/schools, courses, admission) and every AI prompt. Applies to new completions **and** existing students (backfill).

**Non-goals:** No new user-facing report or UI (engines keep their current outputs, now fed complete data). No change to how assessments are *taken*. No redesign of the 360 aggregation (already correct).

## 3. Approach (A) — capture → assemble → consume

### 3.1 Capture layer — persist the full PCA output
New model `PCAResult` (one row per `PCAEvaluation`/user, upserted):
```
model PCAResult {
  id            String   @id @default(uuid())
  userId        String   @unique
  pcaCod        String
  discResult    Json?    // raw GetPcaResult incl. PcaD1..PcaD4 (+ normalized d/i/s/c numeric)
  competences   Json?    // GetCompetencesResult
  jcaResult     Json?    // GetPcaVsJcaResult (gap analysis)
  fetchedAt     DateTime @default(now())
  ...isActive/audit/@@map("pca_results")
}
```
Written in two places:
1. **Proxy handlers** (`pcaapi.ts` get-result / get-competences / pca-vs-jca) persist on every successful TIMS fetch (additive — they keep returning to the browser).
2. **Server-side `capturePcaResults(userId)`** that calls TIMS for all three and upserts `PCAResult` — used by the completion trigger and backfill, so capture never depends on the browser.

Graceful degradation: store whatever TIMS returns; a missing competences/JCA payload leaves that column null and the engine simply uses what's present.

### 3.2 Assembly service — `assembleCompleteProfile(userId): CompleteAssessmentProfile`
Single function (new `lib/assessmentProfile.ts` or `assessmentService`) that reads **all** persisted data and returns one typed object:
- **lia:** 5 domains {score, accuracy, timeSpent}, weighted composite + band (via `lib/lia/scoring.ts`), mapped `milX`.
- **pca:** disc {d,i,s,c numeric + label}, competences[], jcaGap (from `PCAResult`); derived `interests[]` + `motivators[]` + `interestScores`/`motivatorScores` computed from PCA (+ catalog mapping in `data/careers.json`).
- **threeSixty:** per-category weighted averages by relation (via `categoryScoresFromFeedback`/`categoryAverages`), free-text, evaluator counts.
- **academics:** GPA, grades/rigor, test scores (SAT/ACT/AP), activities/portfolio, preferences.
- **meta:** `fingerprint` (hash over LIA + PCA + 360 inputs), completeness flags per source.

This is the **one interface** every consumer depends on; engines never read raw tables for assessment data again.

### 3.3 Server-authoritative `UserCareerProfile`
`deriveProfile`/`generateInsightsBackground` populate **every** field from the assembly: numeric DISC (new columns `discDScore`…`discCScore` Int alongside existing labels), `milX`, `interestScores`, `motivatorScores`, `derivedInterests`, `derivedMotivators`, `competences` (Json), `jcaGap` (Json), `profileSummary`. Recomputed on completion trigger and backfill.

### 3.4 Rewire engines to the assembly (server-authoritative)
- `scoreCareers`: read DISC numeric + MIL from `assembleCompleteProfile` (or the persisted profile), **not `req.body`** (keep body as optional override for the live-flow, but DB is the source of truth and the default).
- `buildStudentProfile` (admission): read computed cognitive + DISC + interests/motivators + competences from the assembly, not raw stale columns.
- `universityService` / `courseService`: consume the same assembly fields (DISC, interests, 360 strengths, academics).
- **AI prompts:** each engine's Bedrock prompt includes the full picture — cognitive (LIA), personality (DISC numeric + descriptors), competences, interests, motivators, 360 perceptions by relation, academics. **PII tokenized before Bedrock** per `.claude/rules/api-standards.md` (names/emails stripped).

### 3.5 Cache invalidation
Bust the career cache (and recompute the profile) when the **assembly fingerprint** changes — i.e. any LIA, PCA, or 360 change — not just a DISC-label change.

### 3.6 Backfill
`rebuildCompleteProfile(userId)` (admin endpoint + bulk script): `capturePcaResults` → `assembleCompleteProfile` → persist profile. Bulk backfill iterates existing students with completed assessments. Runs in-VPC for prod (same Fargate pattern used for audits).

## 4. Data flow

```
LIA exams ─┐
PCA (TIMS) ─┼─► capture/persist ─► assembleCompleteProfile(userId) ─► UserCareerProfile (authoritative)
360 feedback┘                              │                                   │
academics ──────────────────────────────────┘                                   ▼
                                            └──────────────► engines (career/university/course/admission)
                                                                     └──► Bedrock prompts (complete, PII-tokenized)
```

## 5. Phasing

- **Phase 0 — validate TIMS** (prod): confirm `GetPcaResult` / `GetCompetencesResult` / `GetPcaVsJcaResult` return data for a real `PcaCod` with the prod `PCA_COKEY`. Determines exactly what we can capture.
- **Phase 1 — capture layer:** `PCAResult` model + migration; persist in proxy handlers + `capturePcaResults`. TDD.
- **Phase 2 — assembly service:** `assembleCompleteProfile` + types; unit-tested against fixtures.
- **Phase 3 — authoritative profile:** populate all `UserCareerProfile` fields from assembly; fingerprint cache busting.
- **Phase 4 — rewire engines + AI prompts** (careers → admission → university → course), one at a time, each with tests.
- **Phase 5 — backfill** endpoint + bulk script; run in prod in-VPC.

Each phase is independently shippable; the engine strictly improves at each step.

## 6. Testing

- Unit: `assembleCompleteProfile` against fixtures covering full/partial/empty PCA, multi-relation 360, missing LIA — assert every field maps correctly and partial data degrades gracefully.
- Unit: each rewired scorer reads from the assembly (DISC/MIL no longer flat-fallback when DB has data).
- Integration: completion trigger → profile fully populated (no empty `derivedInterests`/`interestScores`).
- Live (prod, in-VPC + API): a fully-completed student profile shows real DISC numeric + competences + interests; AI prompt contains them. Reuse the seed/verify pattern from the 360 confirmation.

## 7. Risks / dependencies

- **TIMS availability/contract** (Phase 0): if competences/JCA aren't returned in prod, those columns stay null and the engine uses DISC+LIA+360 — still a large improvement; revisit competences later.
- **PII to Bedrock:** must tokenize before every enriched prompt (existing rule).
- **Migration:** `PCAResult` is additive (new table) + a few additive `UserCareerProfile` columns — no destructive change; applied in-VPC as master (per prod-infra pattern).
- **Backfill + TIMS load:** throttle bulk TIMS pulls; tolerate per-student failures.
- **`req.body` override:** keep accepting client DISC/MIL as an override so the existing live UI flow never regresses, but default to DB.

## 8. Key files

`api/src/routes/pcaapi.ts` (capture), `api/prisma/schema.prisma` (`PCAResult`, `UserCareerProfile`), new `api/src/lib/assessmentProfile.ts` (assembly) + `api/src/services/assessmentService.ts`, `api/src/services/careerService.ts`, `api/src/services/universityService.ts`, `api/src/services/courseService.ts`, `api/src/services/collegeTrackingService.ts`, `api/src/lib/admissionEngine.v3.ts`, `api/src/lib/evaluation360.ts`, `api/src/lib/lia/scoring.ts`.
