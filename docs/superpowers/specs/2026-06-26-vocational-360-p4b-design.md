# Vocational 360 — Phase 4b (Report UI) Design

**Date:** 2026-06-26
**Branch:** `feat/vocational-360-p4b` (off `develop` @ `0ff3395`)
**Phase:** P4b of P4 (P4a integration engine ✅ · **P4b report UI** · P4c recommendations)
**Spec lineage:** [P3](2026-06-25-vocational-360-p3-design.md) · [P4a](2026-06-26-vocational-360-p4a-design.md)

## Summary

P4b is a shared, read-optimized **vocational report** that renders the P3 360 results (dimensions, bands, per-group breakdown, rankings) and the P4a integrated score (40/30/30 composite), shown to the **student** (self-view) and to **counselors/admins** (scoped, per-student). It recomputes on open so viewers see current scores, and degrades gracefully when inputs are incomplete (a readiness checklist + partial render). Frontend-only — it consumes the P3/P4a endpoints that already exist; **no backend change**. Recommendations stay in P4c.

## Decisions (locked in brainstorm)

1. **One shared `VocationalReport` component, mounted in both surfaces** — student self-view + counselor/admin per-student drill-down. Most work is the shared component; two thin route mounts.
2. **Auto-recompute on report open** (best-effort), then render; plus a manual **Refresh**. The integrated calc reads the persisted 360, so recompute order is **360 first, then integrated**.
3. **Component-readiness checklist + partial render** — always show what's available; the integrated 40/30/30 headline appears only when all three inputs (360 ready + PCA + MIL) are present; otherwise an "complete X to unlock" state.
4. **Mounts as routes** (deep-linkable): student `/dashboard/assessments/vocational`; counselor `/counselor/evaluations/[studentId]/report`.

## Background / constraints

- **Endpoints already exist** (P3 + P4a), authed at the `/api/v1/vocational360` mount, school-scoped via `canAccessUser` (self allowed; counselor/admin scoped; IDOR → 404):
  - `POST /score/:id/recompute` → P3 `ScoringOutcome` (`status: ready | not_ready | never_computed`; ready carries `composite`, `band`, `dimensionScores[{key,nameEs,score,band,byGroup}]`, `rankings{interests,industries,workType,openInsights}`, `respondentCount`, `groupsIncluded`).
  - `POST /integrated/:id/recompute` → P4a `IntegrationOutcome` (`ready` carries `integratedComposite`, `band`, `threeSixtyScore`, `pcaScore`, `milScore`, `weightsApplied`; `not_ready` carries `missing:[...]`; `never_computed`).
  - `GET /score/:id` and `GET /integrated/:id` — read-only equivalents.
- **`apiRequest` returns the `{success,data}` envelope** (frontend-standards.md "#1 gotcha" — and the P2b bug). The report service MUST read `res.data` — do NOT repeat the P2b mistake of reading the field off the envelope root.
- These are AUTHENTICATED counselor/student calls → use `apiRequest` (from `@/lib/api/apiClient`), NOT the public raw-`fetch` pattern used by `vocationalTakeService`.
- **Frontend conventions** (frontend-standards.md): Tailwind + `var(--admin-*)` tokens, brand blue `#065292`; no inline `style={{}}` in new code where a class works (pragmatically: match `PCAResultsPanel`'s `bg-white rounded-xl shadow-sm border` card idiom); no `dangerouslySetInnerHTML`; no new `any`; `motion/react` if animating; every query view handles loading / error / empty.
- **File size:** page components ≤ 400 LOC, so split the report into focused sub-components.

## Architecture

### Component 1 — Frontend service: `frontend/src/services/vocationalReportService.ts`

Authenticated wrappers + types. Each unwraps the envelope (`res?.data ?? res`). No `any`.

- Types (mirror the backend payloads): `VocationalScoreResult` (P3 ready shape), `VocationalScoreOutcome = VocationalScoreResult | { status:"not_ready"; reason?:string } | { status:"never_computed" }`; `IntegratedResult` (P4a ready shape), `IntegratedOutcome = IntegratedResult | { status:"not_ready"; missing:string[] } | { status:"never_computed" }`.
- `recompute360(evaluatedUserId): Promise<VocationalScoreOutcome>` → `apiRequest(\`/api/v1/vocational360/score/${id}/recompute\`, { method:"POST" })` → unwrap.
- `recomputeIntegrated(evaluatedUserId): Promise<IntegratedOutcome>` → POST `/integrated/:id/recompute` → unwrap.
- `getScore(id)` / `getIntegrated(id)` → GET equivalents → unwrap (used by any read-only path; primary flow uses the recompute responses).

### Component 2 — Shared report: `frontend/src/components/vocational/` (focused files)

- `VocationalReport.tsx` (`{ evaluatedUserId: string; selfView?: boolean }`) — the orchestrator. On mount (and on Refresh): set loading → `await recompute360(id)` → `await recomputeIntegrated(id)` (sequential; integrated depends on the persisted 360) → store both outcomes → render. Holds `loading`/`error`/`refreshing` state. Renders header + the four panels below + a Refresh button. ≤ ~200 LOC; delegates rendering to sub-components.
- `_components/ReadinessChecklist.tsx` — given the two outcomes, shows the three inputs (360 / PCA / MIL) as present/missing rows with guidance ("360 needs self + ≥1 other evaluator", "Complete the PCA", "Complete the MIL exams"). Derives 360-ready from the score outcome status; PCA/MIL presence from the integrated outcome's `missing` (when not_ready) or all-present (when integrated ready).
- `_components/IntegratedHeadline.tsx` — renders ONLY when the integrated outcome is `ready`: the big `integratedComposite` + band, with the three component bars (360 / PCA / MIL) and the applied 0.4/0.3/0.3 weights. Hidden (replaced by a small "complete all three to unlock" note) otherwise.
- `_components/DimensionBreakdown.tsx` — from the 360 ready outcome: the 8 dimensions as score-bars with band labels; each row expandable to its `byGroup` (self/parent/teacher/sibling) sub-bars. Null-score dimensions show "no responses yet".
- `_components/RankingsPanel.tsx` — ranked interest areas, top industries, modal work-type, and open-text insights (qualitative quotes, plain text — no `dangerouslySetInnerHTML`).
- Visual: reuse `PCAResultsPanel`'s card idiom (`bg-white rounded-xl shadow-sm border`), `Skeleton` for loading, `AlertCircle`/`RefreshCw` (lucide) for error/refresh, brand blue `#065292`, `var(--admin-*)` tokens.

### Component 3 — Route mounts (thin)

- **Student:** `frontend/src/app/dashboard/assessments/vocational/page.tsx` — resolves the current user's id from the existing auth/session context and renders `<VocationalReport evaluatedUserId={currentUserId} selfView />`. Add a link to it from the assessments page.
- **Counselor/admin:** `frontend/src/app/counselor/evaluations/[studentId]/report/page.tsx` — reads `studentId` from the route params and renders `<VocationalReport evaluatedUserId={studentId} />`. Add a "View Vocational Report" action per student row in `counselor/evaluations/page.tsx` (the list already has `s.studentId`/`s.name`) linking to that route. (Server enforces scope → a non-owned id returns 404, which the component renders as a not-found/empty state.)

## Data flow

```
report opens (studentId) ─▶ setLoading
   ├─ await recompute360(studentId)        // P3: persists fresh 360, returns outcome
   ├─ await recomputeIntegrated(studentId) // P4a: reads persisted 360 + PCA + MIL, returns outcome
   └─ render:
        ReadinessChecklist(scoreOutcome, integratedOutcome)
        IntegratedHeadline(integratedOutcome)            // only if ready
        DimensionBreakdown(scoreOutcome)                 // if 360 ready
        RankingsPanel(scoreOutcome.rankings)             // if 360 ready
   Refresh button → same sequence
```

## Error handling & states

- **Loading** → skeleton (mirror `PCAResultsPanel` skeleton).
- **Error** (network/unexpected throw) → `AlertCircle` message + Retry (re-runs the sequence); never surface raw error text.
- **360 never_computed / not_ready** → checklist explains 360 isn't ready (needs self + ≥1 other); dimensions/rankings hidden; no crash.
- **Integrated not_ready** → headline replaced by "Complete PCA / MIL to unlock your integrated score", with the missing components highlighted in the checklist; 360 sections still render if ready.
- **IDOR / not-found** (counselor opens a non-owned student) → endpoints 404 → render a generic "report not available" empty state.
- **Self-view auth:** student passes their own id (canAccessUser allows self); no special handling needed.

## Testing strategy (TDD)

- **Component tests** (jest + Testing Library, service mocked):
  - On mount, `recompute360` is called, THEN `recomputeIntegrated` (assert call order / sequencing).
  - All three ready → `IntegratedHeadline` shows `integratedComposite` + the three component bars; dimensions + rankings render.
  - Integrated `not_ready (missing:["mil"])` → headline hidden / "unlock" note; checklist flags MIL missing; 360 dimensions still render when the score outcome is ready.
  - 360 `not_ready`/`never_computed` → dimensions/rankings hidden; checklist explains; no crash.
  - Error path → error UI + Retry re-invokes the sequence.
  - Refresh re-runs recompute.
- **Service tests** — `recompute360`/`recomputeIntegrated` POST the right URLs and **unwrap `res.data`** (regression guard against the envelope bug); throw/propagate on failure.
- **Live Playwright** (per `formmaps-qa-verify`, dev DB, alt ports): student self-view at `/dashboard/assessments/vocational` for a student with all three components → integrated headline + dimensions + rankings render; counselor drill-down `/counselor/evaluations/<studentId>/report` renders the same; a student missing PCA/MIL shows the checklist + unlock state; confirm generic 360 + other dashboards unaffected.

## Out of scope (→ P4c / later)

- **Recommendations** (career/university/industry) — P4c, reusing `careerService.scoreCareers`.
- Any backend change (the P3/P4a endpoints are sufficient).
- PDF/print export of the report; EN translations of Spanish dimension/option labels.
- Auto-recompute via server-side triggers beyond the on-open client recompute.

## Success criteria

- `vocationalReportService.ts` wraps the four endpoints, unwrapping `res.data`; no `any`; frontend `tsc` clean.
- `VocationalReport` + sub-components render the integrated headline (when all three ready), the 8-dimension breakdown with per-group expansion, the rankings, and the readiness checklist; graceful loading/error/partial/never-computed states.
- Mounted at both routes; counselor list links to the drill-down; student assessments links to the self-view.
- On open, recompute fires 360-then-integrated; Refresh re-runs it.
- jest component + service tests green; `next build` clean; live Playwright verifies both surfaces.
- Generic 360 + existing dashboards unaffected (additive only).
