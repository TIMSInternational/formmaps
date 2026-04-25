# Client Requirements Audit — Full Gap Analysis

**Date:** 2026-03-01  
**Author:** Frontend Team (audit against `docs/req.md`)  
**Scope:** All 6 EPICs (21 SCRUM tasks) from the Developer Implementation Guide v1.0

This audit compares the client requirements document (`docs/req.md`) against the current frontend implementation and Postman collection to identify what's complete, what's partially done, and what's missing.

---

## Overall Status

| EPIC                                   | Tasks | ✅ Done | ⚠️ Partial | ❌ Missing |
| -------------------------------------- | ----- | ------- | ---------- | ---------- |
| EPIC 1: School Admin Portal            | 6     | 4       | 2          | 0          |
| EPIC 2: Curriculum & Course Trajectory | 6     | 5       | 1          | 0          |
| EPIC 3: Integration Layer              | 2     | 2       | 0          | 0          |
| EPIC 4: Assessment System              | 2     | 1       | 1          | 0          |
| EPIC 5: Counselor Dashboard            | 2     | 2       | 0          | 0          |
| EPIC 6: Student Portal                 | 2     | 2       | 0          | 0          |
| **Cross-cutting concerns**             | —     | —       | —          | **3 gaps** |

---

## EPIC 1: School Administration Portal

### ✅ TASK 1.1: School Profile Setup (SCRUM-130)

- **Page:** `school-admin/profile/page.tsx`
- **Service:** `schoolProfileService.ts`, `schoolAdminService.ts`
- **Status:** Complete — school name, logo upload, timezone, language, settings all implemented.

### ⚠️ TASK 1.2: Curriculum Framework Configuration (SCRUM-131)

- **Page:** `school-admin/curriculum/page.tsx`
- **Service:** `curriculumService.ts` — `getFrameworks()`, `updateFrameworks()` exist
- **Status:** Partially done
- **Gap:** `GET/PUT /curriculum/frameworks/:type/courses` endpoints are **missing from backend** (Postman). Frontend service functions (`getFrameworkCourses`, `updateFrameworkCourse`) are already coded and waiting.

### ✅ TASK 1.3: Course/Subject Management (SCRUM-132)

- **Page:** `school-admin/courses/page.tsx`
- **Service:** `curriculumService.ts` — school course CRUD, CSV import, AI recognition, and prerequisites all implemented.
- **Status:** Complete — course catalog, CSV import with validation, prerequisite engine, and data mapping all working.

### ⚠️ TASK 1.4: Graduation Rules Engine (SCRUM-133)

- **Page:** `school-admin/graduation/page.tsx`
- **Service:** `graduationService.ts` — `getGraduationRules()`, `createGraduationRules()`, `updateGraduationRules()`, `getStudentGraduationProgress()`, `getAllGraduationProgress()` all coded.
- **Status:** Partially done
- **Gaps:**
  - `POST /graduation/rules` and `PUT /graduation/rules/:id` are **missing from backend** (Postman).
  - `GET /graduation/progress` (batch) is now in Postman ✅.
  - **No `seniorProjectRequired` tracking** — the requirements specify this as a special graduation requirement but no UI exists for students to mark senior project completion.
  - **No `communityServiceHours` tracking** — students can't log community service hours from anywhere in the platform.

### ✅ TASK 1.5: Academic Calendar Setup (SCRUM-134)

- **Page:** `school-admin/calendar/page.tsx`
- **Service:** `calendarService.ts` — academic years, assessment periods, and holidays CRUD all coded.
- **Status:** Frontend complete — but **all 9 sub-feature endpoints** (assessment periods, holidays, and academic year PUT/DELETE) are still **missing from backend** (Postman).

### ✅ TASK 1.6: User Role Management (SCRUM-135)

- **Page:** `school-admin/users/page.tsx`
- **Service:** `adminUsersService.ts`, staff/counselor invite flow
- **Status:** Complete — counselor invite, student invite, parent invite, bulk student import all working.

---

## EPIC 2: Curriculum & Course Trajectory

### ✅ TASK 2.1: Course Catalog Import (SCRUM-136)

- **Page:** `school-admin/courses/page.tsx` (import section)
- **Service:** `curriculumService.ts` → `importSchoolCourses()`, `getCourseImportStatus()`, `downloadCourseImportFailures()`
- **Status:** Complete — CSV upload, validation preview, job status polling, failure download all implemented.

### ✅ TASK 2.2: AP/IB Course Recognition (SCRUM-137)

- **Service:** `curriculumService.ts` → `recognizeCourses()`, `recognizeAllUnmapped()`, `applyAIMapping()`
- **Status:** Complete — AI-powered course recognition with confidence scores, manual override.

### ✅ TASK 2.3: Prerequisites Engine (SCRUM-138)

- **Service:** `curriculumService.ts` → `updatePrerequisites()`, `checkPrerequisites()`, `getPrerequisiteChain()`
- **Postman:** `check/:studentId/:courseId`, `eligible/:studentId`, `missing/:studentId/:courseId` all present.
- **Status:** Complete.

### ✅ TASK 2.4: Course Sequence Builder (SCRUM-139)

- **Page:** `school-admin/course-sequences/page.tsx`, `school-admin/course-sequences/[id]/builder/page.tsx`
- **Service:** `courseSequenceService.ts`
- **Status:** Complete — visual flowchart builder with grade columns.

### ✅ TASK 2.5: Gap Analysis Algorithm (SCRUM-140)

- **Page:** `counselor/academic-gaps/page.tsx`, `school-admin/academic-gaps/page.tsx`
- **Service:** `academicGapService.ts`
- **Postman:** `gap-analysis/:studentId`, `academic-gaps/summary` present.
- **Status:** Complete — credit gaps, course gaps, and per-student gap analysis all implemented.

### ⚠️ TASK 2.6: AI Course Recommendations (SCRUM-141)

- **Service:** `coursePlanService.ts` → `getMyCourseRecommendations()` exists
- **Postman:** `GET /student/course-plan/recommendations` ✅ present
- **Status:** Partially done — student-facing recommendations work, but the **counselor approval workflow** (change requests) is **missing from backend**. Frontend service functions for change requests are coded but all 5 endpoints are absent from Postman.

---

## EPIC 3: Integration Layer

### ✅ TASK 3.1: CSV Grade Import (SCRUM-142)

- **Service:** `gradeImportService.ts`
- **Postman:** `grades/import`, `grades/import/:jobId`, `grades/import/:jobId/download-failures` all present.
- **Page:** Grade import UI in school-admin.
- **Status:** Complete.

### ✅ TASK 3.2: Data Mapping Engine (SCRUM-143)

- **Page:** `school-admin/data-mappings/page.tsx`
- **Service:** `dataMappingService.ts`
- **Postman:** CRUD + AI suggest + bulk approve all present.
- **Status:** Complete.

---

## EPIC 4: Assessment System

### ✅ TASK 4.1: Assessment Configuration (SCRUM-144)

- **Page:** `school-admin/assessments/page.tsx`
- **Service:** `assessmentConfigService.ts` — per-type enable/disable toggle.
- **Status:** Complete (simplified to toggle model per backend contract).
- **Gaps vs. original spec:**
  - No **proctoring configuration** (`RequireProctoring`, `ProctoringType`) — the original spec defines these fields but backend doesn't support them. No UI exists.
  - No **time limit**, **retake**, or **cooldown** configuration — backend only supports enable/disable toggles per assessment type, not the full `AssessmentConfig` model from the spec.
  - No **assessment scheduling** (`UseFixedSchedule`, `ScheduledDate`, `TimeWindowDays`) — not in backend.
  - `GET /assessments/status` (completion stats) — **missing from backend** (Postman).

### ⚠️ TASK 4.2: 360-Degree Evaluation Invites (SCRUM-145)

- **Pages:** `school-admin/evaluations/page.tsx`, `counselor/evaluations/page.tsx`, `evaluation/evaluator/page.tsx`, `parent/evaluations/page.tsx`
- **Service:** `evaluationService.ts`, `questions360Service.ts`
- **Status:** Mostly complete — counselor can initiate evaluations, send email invites with unique tokens, parents/teachers can complete evaluations, responses are aggregated.
- **Potential gap:** The spec mentions **teacher evaluations** as a category alongside parent evaluations. Current UI supports "peer" evaluators but may need explicit "teacher" type verification.

---

## EPIC 5: Counselor Dashboard

### ✅ TASK 5.1: Student List View (SCRUM-146)

- **Page:** `counselor/students/page.tsx`, `counselor/students/[id]/page.tsx`
- **Status:** Complete — filterable student list, student detail view with assessments, course trajectory, gap analysis, counselor notes.

### ✅ TASK 5.2: Alert System (SCRUM-147)

- **Page:** `counselor/alerts/page.tsx`, `school-admin/alerts/page.tsx`
- **Service:** `alertService.ts`
- **Postman:** GET alerts, summary, mark as read, bulk action — all present.
- **Status:** Complete.

---

## EPIC 6: Student Portal

### ✅ TASK 6.1: CV/Resume Generator (SCRUM-148)

- **Page:** `dashboard/resume-builder/page.tsx`, `dashboard/resume-builder/[id]/page.tsx`, `dashboard/resumes/page.tsx`
- **Service:** `resumeService.ts`
- **Status:** Complete — multi-template resume builder with sections, ordering, and data from assessments/portfolio.

### ✅ TASK 6.2: University Suggestions (AI) (SCRUM-149)

- **Page:** `dashboard/university/page.tsx`
- **Service:** `universityService.ts`
- **Postman:** Universities CRUD, recommendations, compare, favorites, preferences, filters — all present.
- **Status:** Complete — AI-powered university matching, comparison, filtering, and favorites.

---

## Cross-Cutting Concerns (Not tied to a specific EPIC)

### ❌ 1. Proctoring System — NOT IMPLEMENTED

- **Requirement:** `AssessmentConfig.RequireProctoring`, `ProctoringType` ("in-person", "virtual"), `SchoolSettings.RequireProctoring`, `AllowPause`
- **Current state:** No proctoring code exists anywhere in the codebase. No backend endpoints for proctoring.
- **Impact:** Schools cannot enforce proctored assessment sessions. This is a significant feature gap for academic integrity.
- **Action needed:** Backend must build proctoring support. Frontend needs proctoring enforcement UI.

### ❌ 2. Community Service Hours Tracking — NOT IMPLEMENTED

- **Requirement:** Graduation rules specify `communityServiceHours: 40` as a special requirement.
- **Current state:** `communityServiceHours` exists in the graduation rules type but there is NO student-facing UI to log, track, or submit community service hours. Counselors/admins also can't view or verify hours.
- **Impact:** Graduation progress calculation cannot account for community service requirements.
- **Action needed:** Backend needs a community service hours tracking API. Frontend needs student logging UI + admin verification UI.

### ❌ 3. Senior Project Tracking — NOT IMPLEMENTED

- **Requirement:** Graduation rules specify `seniorProjectRequired: true`.
- **Current state:** `seniorProjectRequired` exists in the graduation rules type but there is NO mechanism for students to submit or counselors to verify senior project completion.
- **Impact:** Graduation progress cannot fully determine if a student meets all requirements.
- **Action needed:** Backend needs senior project status endpoint. Frontend needs student submission + counselor approval UI.

### ⚠️ 4. Personality & Interests Inventory (4th Assessment Pillar) — PARTIALLY IMPLEMENTED

- **Requirement:** The spec lists 4 assessment pillars: PCA, Fluid Intelligence, 360-Degree, and **Personality & Interests Inventory**.
- **Current state:** `timsService.ts` exists with career scoring based on DISC + MIL results. There is no standalone "Personality & Interests" assessment page or a dedicated intake flow for students to take this assessment. The TIMS career scoring appears to derive personality/interest signals from the existing assessments rather than being a separate test.
- **Impact:** The assessment dashboard shows 3/4 or 4/4 completion without a clear separate personality test flow.
- **Clarification needed:** Is the TIMS career scoring system the intended replacement for a standalone Personality & Interests assessment? Or does the client expect a separate assessment page?

### ⚠️ 5. Bilingual Support — IMPLEMENTED BUT NEEDS VERIFICATION

- **Requirement:** "Bilingual Support — Full Spanish and English localization" with Spanish as primary.
- **Current state:** `i18n` infrastructure exists with `en.json` and `es.json` locale files, `LanguageSwitcher` component, `I18nProvider`, and `AccessibleLanguageSwitcher`. But we haven't verified:
  - Whether ALL user-facing strings are translated (vs. hardcoded English strings)
  - Whether the Spanish translation covers the new features (course plan, portfolio, notes, etc.)
  - Whether Spanish is set as the primary/default language for CDS
- **Action needed:** Full translation audit of all ui strings against `es.json`.

### ⚠️ 6. Student Course Plan — Change Request Workflow BLOCKED

- Frontend code exists for the full change request workflow (student submits request → counselor reviews → approve/reject).
- **All 7 related endpoints (5 change request + 2 counselor direct edit) are missing from backend.**
- Students can currently view and add courses directly but there's no approval gate.

---

## Summary: What's Truly Missing

### Frontend Gaps (things WE need to build):

1. **Community service hours tracking UI** (student logging + admin verification)
2. **Senior project submission/verification UI**
3. **Proctoring enforcement UI** (if/when backend builds support)
4. **Full Spanish translation audit** (verify all new features are translated)

### Backend Gaps (things BACKEND needs to build):

Already documented in `BACKEND_CONTRACT_ISSUES_2026-02-28.md`, plus:

1. Community service hours tracking endpoints
2. Senior project status endpoints
3. Proctoring support (if planned for this phase)
4. Full `AssessmentConfig` model (scheduling, time limits, retakes, cooldown) — OR formally descoped

### Clarifications Needed from Client:

1. Is TIMS career scoring the 4th assessment pillar, or is a separate Personality & Interests test needed?
2. Is proctoring required for the CDS pilot or deferred to a later phase?
3. Is the simplified assessment config (toggle only) acceptable, or are scheduling/time limits/retakes required?
4. Are community service hours and senior project tracking required for the CDS pilot?
