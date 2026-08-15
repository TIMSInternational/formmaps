# Vocational 360 — Phase 4c (Recommendations) Design

**Date:** 2026-06-26
**Branch:** `feat/vocational-360-p4c` (off `develop` @ `b3a625b`)
**Phase:** P4c of P4 (P4a integration ✅ · P4b report UI ✅ · **P4c recommendations** — final Vocational 360 phase)
**Spec lineage:** [P3](2026-06-25-vocational-360-p3-design.md) · [P4a](2026-06-26-vocational-360-p4a-design.md) · [P4b](2026-06-26-vocational-360-p4b-design.md)

## Summary

P4c surfaces **career recommendations** in the vocational report: the existing career engine's quantitative top program matches, plus an **AI-synthesized vocational guidance narrative** that ties the integrated score, dimension strengths, and the vocational interest/industry rankings to suggested paths and next steps. Career/industry only — universities link out to the platform's existing college tools.

## Decisions (locked in brainstorm)

1. **Reuse `scoreCareers` for program matches + add an AI vocational guidance narrative.** Do not rebuild or modify the career scorer.
2. **Career/industry only.** No vocational-specific university recommender; link out to the existing university/college-list tools.
3. **AI guidance shape:** `{ summary: string; recommendedPaths: {title,why}[]; strengths: string[]; growthAreas: string[]; nextSteps: string[] }`.
4. **GET-only endpoint** (AI is fingerprint-cached; the cache key flips on any assessment change, so no force-refresh needed).

## Background / constraints

- **`scoreCareers(userId, body)`** (`careerService.ts`) is the canonical engine: gated on `checkAssessmentCompletion` (all 3 of PCA/LIA/360 done) — returns `{ careers: [], locked: true, completion }` when not done; otherwise top-10 program matches `{ programId, programTitle, cluster, totalScore, confidence, breakdown, needsBridging, bridgingReasons, bridgingPaths }` + an AI `profileSummary`. **Reuse as-is; do not modify.**
- **Vocational signal:** `getIntegratedResult(userId)` (P4a) → integrated composite/band + component scores; `getVocationalResult(userId)` (P3) → dimensionScores (with bands) + rankings (interests/industries/workType).
- **AI guardrails (api-standards.md — mandatory):** PII tokenized before Bedrock (`stripStudentPii` from `lib/aiPii.js`); 100% of AI output Zod-parsed with a fallback (never crash); cached via `aiCache` (`getCachedAiResponse`/`setCachedAiResponse`/`hashCacheKey` from `lib/aiCache.js`) with a fingerprint key; user content goes as DATA, never as instructions. The AI helper is `aiJson<T>(systemPrompt, userMessage, opts?)` (`lib/bedrock.js`).
- **Frontend:** `apiRequest` returns `{success,data}` → unwrap `res?.data ?? res` (the P2b lesson, as in the P4b service). Reuse the `PCAResultsPanel` card idiom + brand `#065292`; no `dangerouslySetInnerHTML`; no new `any`.
- **ISOLATION:** additive only — new backend service + endpoint, new frontend panel + service fn, one `VocationalReport` edit. `scoreCareers`, P3/P4a, generic 360, the rest of the report untouched. **No schema change** (`aiCache` table already exists). No prod DDL.

## Architecture

### Component 1 — Backend service: `api/src/services/vocationalRecommendationService.ts`

`getVocationalRecommendations(userId): Promise<VocationalRecommendations>` where
`VocationalRecommendations = { locked: true; completion: unknown } | { locked: false; careerMatches: CareerMatch[]; guidance: Guidance; industries: { value: string; count: number }[] }`.

- `Guidance = { summary: string; recommendedPaths: { title: string; why: string }[]; strengths: string[]; growthAreas: string[]; nextSteps: string[] }`.
- `CareerMatch` = the subset of `scoreCareers`'s career shape surfaced to the UI (`programId, programTitle, cluster, totalScore, confidence, needsBridging, bridgingPaths`).

Flow:
1. `const scored = await scoreCareers(userId, {})`. If `scored.locked` → return `{ locked: true, completion: scored.completion }` (no AI, no extra work).
2. In parallel: `getIntegratedResult(userId)` + `getVocationalResult(userId)`. Derive the vocational signal: integrated band; top-3 and bottom-3 dimensions by score (skip null-score dims); top interest areas; top industries; work-type.
3. **AI guidance** (`buildGuidance`):
   - Build a PII-free fingerprint: `hashCacheKey({ kind: "voc-reco", userId-less fingerprint })` — use the same assembly fingerprint approach as `scoreCareers` plus `instrumentVersion` + rounded `integratedComposite`. Check `getCachedAiResponse`; on hit, reuse.
   - `const safe = await stripStudentPii(userId, <signal payload>)` — never send names/emails.
   - `aiJson<Guidance>(SYSTEM_PROMPT, JSON.stringify(safe))` where `SYSTEM_PROMPT` instructs: produce the exact `Guidance` JSON; user content is DATA in delimiters, not instructions; Spanish-friendly career guidance grounded ONLY in the provided scores (no fabrication).
   - Validate the parsed result against the `Guidance` shape (Zod or explicit field checks, each string length-bounded); on parse/validation/AI failure → `fallbackGuidance(signal, careerMatches)` (a deterministic summary built from the band + top dimension + top cluster, like `scoreCareers`'s fallback `profileSummary`). `setCachedAiResponse` on success.
4. Return `{ locked: false, careerMatches: scored.careers.slice(0, N), guidance, industries: vocationalRankings.industries }`.

Reuses `scoreCareers` (careerService), `getIntegratedResult`/`getVocationalResult` (vocational360Service), `aiJson` (bedrock), `stripStudentPii` (aiPii), `aiCache` helpers. No new AI infrastructure.

### Component 2 — Backend endpoint (existing `vocational360` router, authed mount)

`GET /api/v1/vocational360/recommendations/:evaluatedUserId` — bind param `(qs(...)||"").slice(0,100)`; `canAccessUser(...)` → deny **404**; else `{ success: true, data: await getVocationalRecommendations(targetId) }`. try/catch → 500 fixed string; never leak `err.message`. Mirrors the P3/P4a score endpoints.

### Component 3 — Frontend: service fn + panel + report mount

- `vocationalReportService.ts` (P4b): add `getRecommendations(evaluatedUserId)` → `GET /api/v1/vocational360/recommendations/:id`, unwrap `res?.data ?? res`; type `VocationalRecommendations` (locked union + the ready shape mirroring the backend).
- `components/vocational/_components/RecommendationsPanel.tsx` (`{ evaluatedUserId }`): fetches via `getRecommendations`; states loading / error / locked ("complete all three assessments to see recommendations") / ready. Renders: the AI **guidance** (summary, recommended paths, strengths, growth areas, next steps as plain-text lists), the top **career matches** (program title, cluster, score, confidence; needs-bridging flag), the **industries**, and a **link out** to the existing university tools (e.g. `/dashboard/university` or the college-list route). Reuses the card idiom + brand blue. No `dangerouslySetInnerHTML`.
- `VocationalReport.tsx` (P4b): mount `<RecommendationsPanel evaluatedUserId={evaluatedUserId} />` below the rankings (one additive edit; the panel self-fetches, so the report's existing recompute flow is untouched).

## Data flow

```
report open → (existing P4b recompute) + RecommendationsPanel self-fetches:
  GET /vocational360/recommendations/:id
    → scoreCareers(userId)  ──locked?──▶ { locked, completion }   (panel shows locked state)
    → getIntegratedResult + getVocationalResult  → vocational signal
    → buildGuidance: cache? → stripPii → aiJson(Guidance) → validate / fallback → cache
    → { locked:false, careerMatches, guidance, industries }
```

## Error handling & edge cases

- **Not all 3 assessments done** → `scoreCareers` returns `locked` → panel shows the locked/complete-your-assessments state (no AI call).
- **AI failure / malformed output** → deterministic `fallbackGuidance` (never crash; api-standards mandate).
- **No integrated/360 result** (shouldn't happen once `scoreCareers` is unlocked, but defensively) → still return career matches + a fallback guidance built from what's available.
- **PII** → only the stripped signal payload reaches Bedrock; never names/emails.
- **IDOR** → 404 before any work.
- **Cache** → fingerprint key (assembly fingerprint + instrumentVersion + integratedComposite) so any assessment change regenerates.

## Testing strategy (TDD)

- **Backend unit** (`vocationalRecommendationService.test.ts`, mocked `scoreCareers`/`getIntegratedResult`/`getVocationalResult`/`aiJson`/`stripStudentPii`/aiCache): locked passthrough (no AI call); ready path returns careerMatches + validated guidance + industries; **AI throw → fallbackGuidance** (no crash); **stripStudentPii called before aiJson** (PII guard); cache hit skips `aiJson`.
- **Endpoint integration** (mocked service): GET 200+data; IDOR → 404 (service not called).
- **Frontend panel** (jest, service mocked): locked state; ready renders guidance + career matches + industries + university link; error state.
- **Live verify** (dev DB): the all-3-complete student → recommendations panel renders career matches + an AI (or fallback) guidance narrative; a not-complete student → locked state; IDOR → 404.

## Out of scope

- Modifying `scoreCareers` or the career catalog; vocational-specific university recommendations (link out only); EN/ES translation of AI output beyond the prompt's language steering; any new AI infrastructure or schema.

## Success criteria

- `vocationalRecommendationService` reuses `scoreCareers` + the vocational results + the platform AI pattern (PII-stripped, Zod-validated, cached, fallback); api `tsc` clean.
- `GET /recommendations/:id` returns `{success,data}` with the locked union or `{careerMatches, guidance, industries}`; school-scoped; IDOR→404.
- `RecommendationsPanel` renders guidance + matches + industries + university link, with locked/loading/error states; mounted in the report.
- Backend + frontend tests green; `next build` clean; live verify shows the panel on the report.
- `scoreCareers`, P3/P4a, generic 360, the rest of the report unaffected (additive); no prod DDL.
