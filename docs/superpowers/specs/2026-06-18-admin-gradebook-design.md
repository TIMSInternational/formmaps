# School Admin Gradebook (Phase 0) — Design

**Date:** 2026-06-18
**Branch:** `feat/admin-gradebook` (off `develop`)
**Scope:** Turn the School Admin "Grade Import" surface into a real **Gradebook**: per-grade view/add/edit/delete over the existing `StudentGrade` data, organized **by student**. CSV import becomes a button; iSAMS shows as a "coming soon" placeholder. **No schema change, no new role.**

Part of the larger roadmap (`~/.claude/plans/let-s-do-a-complete-elegant-lake.md`). The unifying principle: the *overall course grade* (`StudentGrade`, one row per student per course) is the shared unit; this phase gives an admin direct CRUD over it. Everything downstream (transcript, GPA, class rank, graduation) already reads `StudentGrade`, so it keeps working.

---

## Context (current state)

- `frontend/src/app/school-admin/academics/_components/GpaPanel.tsx` renders 3 sub-tabs: **Grade Import** (`GradeImportTab`), **GPA Configuration**, **Class Rankings**.
- Backend has **no per-grade CRUD** — only `POST /grades/import` + job status (`api/src/routes/school-grades.ts:229-260`, service `schoolGradesService.ts:426`). The only grade *reads* are the derived transcript (`transcriptService.getTranscriptData`, `transcriptService.ts:105`).
- `StudentGrade` (`schema.prisma:1864`) fields used: `studentId, courseId, courseCode?, semester?, grade?, credits, status, courseLevel?, academicYear?, isActive`.
- GPA config + grade-letter map: `resolveGpaConfig(schoolId)` → `{ unweightedMap, weightBonuses }` (`transcriptService.ts:68`, default map `:8`).
- Permissions `grades:read` / `grades:import` already exist and are held by `school_admin` + `Super Admin` (`auth.ts:49-126`) but are currently unwired — repurpose them here.

---

## Backend — new per-grade CRUD

New route file `api/src/routes/school-gradebook.ts`, mounted at `/api/v1/school-admin` next to `schoolGradeRoutes` (`index.ts:311`, with `authenticate, tenantContext`). New service `api/src/services/gradebookService.ts`. School scope via the same `getSchoolUser(req)` helper pattern as `school-grades.ts:33`.

### Pure, testable helpers (vitest, no DB)
- `normalizeLetter(grade): string` — trim + uppercase.
- `isValidLetterGrade(grade, unweightedMap): boolean` — letter must be a key in `unweightedMap` (the invariant that keeps `computeGpa` from silently dropping the row).
- `sanitizeGradeInput(raw): GradeInput` — explicit field pick + bounds: `grade` (normalized), `credits` (Number, clamp ≥0), `semester`/`academicYear`/`courseLevel`/`courseCode` (`.slice(0,100)`), `courseLevel` lowercased and restricted to `regular|honors|ap|ib` (else `null`). No `req.body` spread.

### Endpoints
| Method | Path | Permission | Behavior |
|---|---|---|---|
| GET | `/gradebook/students/:studentId` | `grades:read` | verify student ∈ school (else 404); return `getTranscriptData(studentId, schoolId)` (byYear rows incl. `id` + GPA summary) |
| POST | `/gradebook/grades` | `grades:import` | body `{ studentId, courseId?\|courseCode?, grade, credits?, semester?, academicYear?, courseLevel? }`; verify student ∈ school; resolve `courseId` (direct, or by code within school); require `isValidLetterGrade`; create `StudentGrade` (explicit fields, `status:"completed"`, `createdBy`) |
| PUT | `/gradebook/grades/:gradeId` | `grades:import` | load grade; if `grade.schoolId !== schoolId` → 404; if `grade` provided require valid letter; update explicit fields + `updatedBy` |
| DELETE | `/gradebook/grades/:gradeId` | `grades:import` | load grade; cross-school → 404; soft-delete (`isActive=false`) |

Conventions: responses `{success,data}` / `{success:false,message}`; `try/catch` → `logger.error(err, ...)` + generic message; single writes use the RLS-extended `prisma` client (tenantContext sets the tenant GUC), mirroring `createAcademicYear`/`updateGraduationRules`; cross-school returns `null` from the service → route maps to 404 (IDOR-safe, mirrors `updateGraduationRules:204`).

### Service functions
`listStudentGrades`, `createGrade`, `updateGrade`, `deleteGrade`, plus a local `resolveCourse(schoolId, {courseId?, courseCode?})` and `verifyStudentInSchool(schoolId, studentId)`. (Phase 0 keeps its own focused lookups rather than refactoring `importGrades`, to stay surgical and not perturb the import path.)

---

## Frontend — student-centric Gradebook

`GpaPanel.tsx`: rename sub-tab **"Grade Import" → "Gradebook"** (default sub-tab); keep "GPA Configuration" + "Class Rankings".

New `GradebookTab` component (the existing `GradeImportTab` CSV logic is preserved, moved behind an **[Import CSV]** button/modal):
- **Left:** searchable student list — reuse `getStudents` (`schoolAdminService.ts:64`) → `/api/v1/school-admin/students`.
- **Right (on select):** GPA/credits summary cards + transcript grouped by `academicYear` (reuse the render shape of `dashboard/transcript/page.tsx` + counselor `GradesTab.tsx`), via `GET /gradebook/students/:id`. Each row: inline **edit** + **delete**; per-year **[+ Add grade]** (course picker from `useSchoolCourses`, `useCurriculumQueries.ts:116`; grade select from the known letters).
- **Header actions:** **[Import CSV]** (opens existing parser UI, unchanged) and **[Connect iSAMS · coming soon]** (disabled placeholder, tooltip).
- Mutations invalidate the student's gradebook query + `["class-rankings"]`; `toast.success/error`; loading (Skeleton) / empty / error states. Brand `#065292`/`#FFD600`, `var(--admin-*)`, `motion/react`.

New frontend service functions in `frontend/src/services` (e.g. extend `transcriptService.ts` or a small `gradebookService.ts`): `getStudentGradebook(id)`, `createGrade`, `updateGrade`, `deleteGrade` via `apiRequest` (extract `res?.data?.data ?? res?.data`).

---

## Testing / verification
- **Unit (vitest):** `normalizeLetter`, `isValidLetterGrade` (in-map vs not, case/space), `sanitizeGradeInput` (bounds, courseLevel allow-list, credits clamp). New file `api/src/__tests__/gradebook-service.test.ts`.
- `tsc --noEmit` both dirs; `cd api && npm test`; `cd frontend && npx jest`; `cd frontend && npx next build`.
- **codex plugin adversarial review** on the working tree; fix findings.
- **security-reviewer** agent on the diff (IDOR on `:studentId`/`:gradeId`, mass-assignment, error leakage).
- **Live Playwright** as `jack.young@countryday.edu`: Gradebook → pick a student → see transcript → add/edit/delete a grade → GPA + Class Rankings reflect it; Import CSV still works; iSAMS button visibly "coming soon".

## Out of scope (YAGNI)
- No class sections / enrollment / teacher role (Phases 1–3).
- No real iSAMS integration (placeholder only).
- No changes to import dedup behavior, GPA Config, or Class Rankings logic.
- No bulk grid editing (that's the teacher gradebook, Phase 3).
