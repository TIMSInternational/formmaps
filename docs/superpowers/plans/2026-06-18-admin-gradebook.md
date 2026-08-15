# School Admin Gradebook (Phase 0) — Implementation Plan

> Spec: `docs/superpowers/specs/2026-06-18-admin-gradebook-design.md`. Branch `feat/admin-gradebook` off `develop`. TDD; commit per task.

**Goal:** Per-grade view/add/edit/delete over `StudentGrade`, surfaced as a by-student "Gradebook" tab. No schema change.

---

### Task 1: Pure grade helpers + tests (TDD)
**Files:** `api/src/services/gradebookService.ts` (new), `api/src/__tests__/gradebook-service.test.ts` (new)
- [ ] Write failing vitest for `normalizeLetter`, `isValidLetterGrade(grade, map)`, `sanitizeGradeInput(raw)` (credits clamp ≥0, string bounds, courseLevel ∈ {regular,honors,ap,ib} else null, drops unknown fields).
- [ ] Implement the pure helpers; export them.
- [ ] `cd api && npx vitest run gradebook-service` → green. Commit `feat(gradebook): pure grade-input helpers (TDD)`.

### Task 2: Service CRUD
**Files:** `api/src/services/gradebookService.ts`
- [ ] `verifyStudentInSchool(schoolId, studentId)`, `resolveCourse(schoolId, {courseId?,courseCode?})`, `listStudentGrades` (reuse `getTranscriptData`), `createGrade`, `updateGrade` (cross-school → null), `deleteGrade` (soft). Use RLS-extended `prisma`; validate letter via `resolveGpaConfig`.
- [ ] `cd api && npx tsc --noEmit` → 0. Commit `feat(gradebook): student grade CRUD service`.

### Task 3: Routes + mount
**Files:** `api/src/routes/school-gradebook.ts` (new), `api/src/index.ts`
- [ ] 4 routes per spec; `authenticate` + `requirePermission`; `getSchoolUser`; `{success,data}`; null→404; catch→logger+generic.
- [ ] Mount at `/api/v1/school-admin` (after `schoolGradeRoutes`, with `authenticate, tenantContext`).
- [ ] `cd api && npx tsc --noEmit` → 0; `npm test` green. Commit `feat(gradebook): per-grade CRUD endpoints`.

### Task 4: Frontend service + hooks
**Files:** `frontend/src/services/gradebookService.ts` (new), `frontend/src/hooks/useGradebookQueries.ts` (new)
- [ ] `getStudentGradebook(id)`, `createGrade`, `updateGrade`, `deleteGrade` via `apiRequest` (extract `.data`). React Query hooks (query + 3 mutations invalidating `["gradebook",id]` + `["class-rankings"]`).
- [ ] `cd frontend && npx tsc --noEmit` → 0. Commit `feat(gradebook): frontend data layer`.

### Task 5: GradebookTab UI + tab rename
**Files:** `frontend/src/app/school-admin/academics/_components/GpaPanel.tsx`, new `_components/GradebookTab.tsx`, `_components/GradeImportModal.tsx` (extract existing CSV logic)
- [ ] Rename sub-tab "Grade Import"→"Gradebook" (default). Extract existing `GradeImportTab` CSV logic into a modal opened by an [Import CSV] button.
- [ ] `GradebookTab`: student list (search) + selected-student transcript-by-year with inline edit/delete + per-year [+ Add grade]; iSAMS placeholder button; loading/empty/error; brand tokens.
- [ ] `cd frontend && npx tsc --noEmit` → 0; `npx jest` green. Commit `feat(gradebook): by-student Gradebook tab + import button`.

### Task 6: Verify, codex review, security-review, PR
- [ ] `tsc` both dirs; `cd api && npm test`; `cd frontend && npx jest`; `cd frontend && npx next build`.
- [ ] codex plugin adversarial review on working tree → fix findings.
- [ ] `security-reviewer` agent on diff → address.
- [ ] `/dev-env`; live Playwright as `jack.young@countryday.edu` (add/edit/delete grade → GPA/rankings update; Import CSV works; iSAMS placeholder).
- [ ] Push `feat/admin-gradebook`; `gh pr create --base develop` with what/why + verification + trailer.

---
## Self-review
- Spec coverage: helpers→T1, CRUD→T2/T3, data layer→T4, UI/rename→T5, verify→T6.
- No schema change; no import-path edits; permissions reuse `grades:read`/`grades:import`.
