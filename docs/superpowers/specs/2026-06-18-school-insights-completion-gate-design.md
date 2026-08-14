# School-Admin AI Insights — 100% Completion Gate (Wave B / B3) — Design

**Date:** 2026-06-18
**Branch:** `feat/school-admin-insights-gate` (off `develop`)
**Scope:** Gate AI School Insights on `/school-admin/assessments` so the analysis only generates when **every** active student in the school has completed all their assessments, and surface "X/Y completed — insights unlock at 100%" while below threshold.

---

## Context (current state)

`/school-admin/assessments` (`frontend/src/app/school-admin/assessments/page.tsx`, `AssessmentCommandCenter`) renders an **AI School Insights** card (`_components/InsightsCard.tsx`). On mount it auto-calls `GET /api/v1/school-admin/assessments/insights` (no refresh) via TanStack Query; a **Refresh** button (only shown once insights exist) re-calls with `?refresh=true`.

Backend: `school-assessments.ts:166` → `getAssessmentInsights(schoolId, userId, refresh)` (`schoolAssessmentsService.ts:466`). Today the only gating is **absolute-count floors**:
- `studentIds.length < 3` → blocked (`:474`)
- `profiles.length < 3 && pcaSessions.length < 5` → blocked (`:493`)

There is **no completion-rate gate** — partial cohorts generate insights. B3 replaces the second ad-hoc floor with a principled **100%-completion gate** (the ≥3-student floor stays, for statistical meaningfulness).

### The canonical completion predicate already exists

`checkAssessmentCompletion(userId)` (`assessmentService.ts:427`) is the codebase's single definition of "this student is done / ready for insights":
- **LIA/MIL:** `liaCompleted >= 5` — 5 distinct `PCAExamSession.examType` with `isCompleted: true`.
- **360:** `evalTotal > 0 && evalCompleted >= min(evalTotal, 3)` — at least one evaluator group assigned and **≥3 completed (or all, if fewer than 3 invited)**. Deliberately a threshold, not literal 100% — one unresponsive parent must not permanently lock the student (see the comment at `:443-445`).
- **DISC:** `pcaEvals.some(e => e.isCompleted)` — at least one completed `PCAEvaluation` (a row exists on *start*, so existence ≠ completion).
- `allDone = allLiaDone && allEvalDone && pcaCompleted`; `readyForInsights = allDone`.

This is exactly the "MIL + DISC + 360 (everything)" definition chosen for B3. **We reuse it verbatim** rather than inventing a second notion of "complete" (the codebase already has a known footgun of two divergent completion notions — `status==="Completed"` vs `isCompleted` — and we will not add a third).

### Locked product decisions (with the user)
1. **Completion definition = everything:** a student counts as complete only when `checkAssessmentCompletion(...).allDone` is true (MIL 5/5 **+** DISC **+** 360-threshold). The pragmatic 360 threshold (≥3 or all) is what makes whole-school 100% reachable.
2. **Hard gate:** below 100%, **both** auto-load and the manual Refresh path are blocked. No partial-cohort override. (The Refresh button is only rendered inside the unlocked card, so a locked school never exposes it.)

---

## Architecture

```
Single source of truth (per-student)         Aggregation                Gate consumer
────────────────────────────────────         ───────────                ─────────────
computeStudentCompletion(rows)  ◄── pure ──┐                          ┌─ getAssessmentInsights (school gate)
   used by checkAssessmentCompletion(userId)│  getSchoolAssessmentCompletion(schoolId)
   (single student, 3 queries)              └─ batched: 3 queries for ─┘   total / complete / byComponent
                                               ALL students, applies
                                               computeStudentCompletion per student
```

### Backend

**1. Extract the pure predicate (`assessmentService.ts`) — behavior-preserving.**
New exported pure function `computeStudentCompletion(rows)` holding the exact verdict logic currently inline in `checkAssessmentCompletion`:
```ts
export function computeStudentCompletion(rows: {
  liaExamTypes: string[];                          // completed LIA exam types (isCompleted:true)
  evalGroups: { isEvaluationCompleted: boolean }[];
  pcaEvals: { isCompleted: boolean }[];
}): { liaCompleted: number; liaTotal: number; evalCompleted: number; evalTotal: number; pcaCompleted: boolean; allDone: boolean; readyForInsights: boolean }
```
`checkAssessmentCompletion(userId)` keeps its 3 queries, then delegates to `computeStudentCompletion`. Output shape is **unchanged** → existing `assessment-completion.unit.test.ts` (6 tests) and `getInsightsStatus` keep passing.

**2. Batched school aggregation (`schoolAssessmentsService.ts`).**
New `getSchoolAssessmentCompletion(schoolId)`:
- Fetch active students (`roleName in [student, Student]`).
- **3 batched queries** (`{ in: studentIds }`) — `pCAExamSession` (isCompleted), `evaluationGroup`, `pCAEvaluation` — grouped by user into Maps. **No N+1** (api-standards rule #4); never loop `checkAssessmentCompletion`.
- Per student → `computeStudentCompletion(...)`; tally `complete` (allDone) and per-component counts.
- Returns:
```ts
{ total: number; complete: number; byComponent: { lia: number; disc: number; eval360: number } }
```
- `total === 0` → all zeros (no queries past the student fetch).

**3. Wire the gate into `getAssessmentInsights` (`schoolAssessmentsService.ts:466`).**
Replace the ad-hoc gating with:
```ts
const completion = await getSchoolAssessmentCompletion(schoolId);
if (completion.total < 3) {
  return { hasEnoughData: false, completion, message: "Need at least 3 students to generate school insights" };
}
if (completion.complete < completion.total) {
  return { hasEnoughData: false, completion,
    message: `${completion.complete}/${completion.total} students have completed all assessments — insights unlock at 100%` };
}
```
- The gate runs **before** the cache lookup and **regardless of `refresh`** → a school that drops below 100% (e.g. a new student is enrolled) immediately shows the locked state instead of a stale cached narrative; the cached row is untouched and reappears on return to 100% (within its 7-day TTL).
- Remove the now-redundant `profiles.length < 3 && pcaSessions.length < 5` floor (superseded by the completion gate; at 100% with ≥3 students it can never fire).
- Add `completion` to the **success** return too, so the unlocked card can show `Y/Y · 100%`.
- The existing `studentIds`/aggregate queries below the gate are unchanged.

**No route, schema, migration, or RLS change.** `school-assessments.ts:166` passes through unchanged; the richer return shape flows through `requirePermission("school:manage")` + `aiLimiter` as today.

### Frontend

**Type (`assessmentCommandService.ts`).** Extend `InsightsData`:
```ts
completion?: { total: number; complete: number; byComponent: { lia: number; disc: number; eval360: number } };
```

**`InsightsCard.tsx` locked state (the `!hasEnoughData` branch).** When `completion` is present and `complete < total`, render a richer locked card:
- Heading stays "AI School Insights" with the Sparkles icon.
- Prominent `X / Y students completed all assessments` + a progress bar (`complete/total`), brand blue `#065292` fill.
- Subline: `Insights unlock when 100% of students finish.` (falls back to `insights.message` when `completion` absent — e.g. the <3-students case).
- Small component breakdown chips: `MIL lia/total · DISC disc/total · 360 eval360/total` so the admin can see *what's lagging*. (Reuses the existing inline-style idiom of this file; no new component.)
- **No Refresh button** in the locked state (unchanged — it only lives in the unlocked card), so the hard gate holds on the client too.

**`page.tsx` — no change.** It already passes `insightsQuery.data` to `InsightsCard`; the auto-query and the Refresh mutation both hit the now-gated endpoint and render whatever it returns.

> Frontend note: this card is already 100% inline-styled; per "surgical changes" we match that idiom for the additions rather than converting the file to Tailwind (frontend-standards' "no new inline style" is aspirational for new files; mixing here would be inconsistent).

---

## Edge cases
- **0 students** → `total:0`; `< 3` branch → locked with the "need 3" message (no divide-by-zero; progress bar guards `total>0`).
- **Exactly 3, all done** → unlocks.
- **All done except one student missing a single 360 response below threshold** → that student's `allDone=false` → school stays locked at `(N-1)/N`; breakdown shows 360 lagging.
- **Back-and-forth across 100%** (new enrollment) → gate re-evaluates each call; cache never serves a stale narrative while locked.
- **Data lag (allDone true but `UserCareerProfile` not yet built)** → aggregates simply reflect available profiles; AI narrative tolerates thinner data (no separate gate needed).

## Verification
- `cd api && npx tsc --noEmit && npm test`; `cd frontend && npx tsc --noEmit && npx jest && npx next build`.
- New api vitest: pure-predicate matrix; `getSchoolAssessmentCompletion` (complete/byComponent + **3-queries-not-N+1** assertion); `getAssessmentInsights` gating (<3 locked; <100% locked + message + `aiChat` NOT called; 100% unlocks + `aiChat` called).
- New frontend jest: `InsightsCard` locked state shows `X / Y` + "unlock" copy + breakdown.
- `security-reviewer` agent on the diff; codex adversarial review.
- Live (Playwright) as `test.schooladmin@formmaps.dev`: assessments page shows the locked card with the real X/Y for the seeded school (Nexa Test Academy is unlikely to be at 100% → confirms the gate; if a fixture school is at 100%, confirm it unlocks).
- PR to `develop` (FormMaps PR body + Claude trailer). Never push `main`.
