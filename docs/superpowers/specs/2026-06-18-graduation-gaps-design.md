# School-Admin Graduation + Academic Gaps — Design (Wave B / B1+B2)

**Date:** 2026-06-18
**Branch:** `feat/school-admin-graduation-gaps` (off `develop`)
**Scope:** Make `/school-admin/grades?tab=graduation` and `?tab=gaps` fully functional. Both routes reuse `academics/_components/GraduationPanel.tsx` + `AcademicGapsPanel.tsx`.

## Context (verified live + by exploration)
The backend is largely implemented and the school admin holds `graduation:manage` (live probe: rules + 15-student progress + gap-analysis all return real data). The real gaps are wiring + missing UI, not missing backends.

## In scope

### B2 — Academic Gaps tab (highest impact)
The panel currently calls `useAllGraduationProgress` and fakes the "Gaps" column as `creditsRequired - creditsCompleted`. There is an already-built, **unused** `/api/v1/school-admin/academic-gaps/summary` returning real per-student `creditDeficit`, `missingRequiredCourses`, and status, with a built hook `useAcademicGapSummary` (`useAcademicGapQueries.ts`).
- **Rewire `AcademicGapsPanel`** to `useAcademicGapSummary()`: columns become real credit deficit + # missing required courses + status; keep search (page-local label), status filter, pagination, row→drill-down (`academics/gaps/[studentId]`).
- **Header copy**: keep AI on the drill-down (already works); adjust the panel subtitle to match reality (click a student → gaps + AI plan).
- **Status vocab**: align the `/summary` status to the same enum the panels filter on (`on_track | at_risk | off_track`). Today `/summary` emits `behind`, which the panel can't render. Fix in the backend route + the shared status mapper (extract a pure `creditDeficitStatus(deficit, required)` helper, TDD).

### B1 — Graduation tab
Rules CRUD works; fill the holes:
- **Special Requirements authoring UI** in the rules dialog (add / edit / remove name·type·value·unit·description). State + save + backend persistence already exist (`GraduationPanel.tsx:56,84`; `schoolGradesService.updateGraduationRules`); just surface it. Also **display** special requirements on the Requirements card.
- **`electivesAllowed` toggle** per category in the dialog (currently read-only badge).
- **`requiredCourses` editable** per category (multiselect of course codes from `useSchoolCourses`); enables required-course matching (today department-name-only).
- **Row drill-down** → `/school-admin/academics/gaps/[studentId]` (the real per-student breakdown with category progress + AI), instead of the generic `/school-admin/users/[studentId]`.

## Out of scope (note as follow-ups)
- **Per-student special-requirement progress evaluation** stays "manual tracking" — real evaluation needs a per-student completion model (schema), deferred. (We surface + author them now; auto-eval later.)
- The cross-cutting refactor (extract `academic-gaps.ts` ~540 LOC into a service; unify the 4 credit-matching copies; converge the two per-student gap endpoints) — separate cleanup slice. We only add the small pure status helper now.
- `getGraduationProgressList` O(n·m) perf — leave unless trivial.

## Testing / verification
- Pure unit (vitest): `creditDeficitStatus` mapping (deficit 0 → on_track; small → at_risk; large → off_track) consistent across graduation list + gaps summary.
- `tsc` both dirs; `cd api && npm test`; `cd frontend && npx jest`; `next build`.
- codex adversarial review + security-reviewer on the diff.
- Live (local, fuller dataset — 15 students, login `test.schooladmin@formmaps.dev`): Gaps tab shows real deficits + missing-course counts, filter works; Graduation tab — add/edit/remove a special requirement + toggle electives + set required courses, Save, reopen persists; row click lands on the student gap breakdown.

## Out-of-scope items tracked in the Wave B roadmap (B3–B10).
