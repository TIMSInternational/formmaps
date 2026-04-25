# Backend Contract Issues & Missing Endpoints
**Date:** 2026-02-28  
**Author:** Frontend Team (post-audit)  
**Priority:** HIGH  
**Status:** Frontend aligned to backend — remaining items are backend build tasks

This document is the output of a full contract audit between the Postman collection (actual implementation), the masters spec docs (`ALL_EPICS_2026-02-17`, `PORTAL_FEATURES_2026-02-18`), and the latest missing-endpoints doc (`MISSING_ENDPOINTS_2026-02-27`).

**Frontend has been aligned to match what the backend actually implements.** This doc now tracks only the features the backend still needs to build.

Issues are classified as:
- **🔴 Critical** — page is completely broken and cannot be used
- **🟠 High** — feature silently fails or data is lost
- **🟡 Low** — minor mismatch, backward-compatible with a small fix

---

## Table of Contents
1. [Schema Mismatches (immediate frontend impact)](#1-schema-mismatches)
2. [Path Mismatches Fixed by Frontend](#2-path-mismatches-fixed-by-frontend)
3. [Missing Endpoints — Counselor Notes](#3-missing-endpoints--counselor-notes)
4. [Missing Endpoints — Student Portfolio](#4-missing-endpoints--student-portfolio)
5. [Missing Endpoints — Student Course Plan](#5-missing-endpoints--student-course-plan)
6. [Missing Endpoints — Academic Calendar sub-features](#6-missing-endpoints--academic-calendar-sub-features)
7. [Missing Endpoints — Graduation Rules Write](#7-missing-endpoints--graduation-rules-write)
8. [Missing Endpoints — Other Gaps](#8-missing-endpoints--other-gaps)
9. [Auth / Token Inconsistency](#9-auth--token-inconsistency)

---

## 1. Schema Mismatches — All Resolved by Frontend

All schema mismatch items identified in the audit have been resolved by updating the frontend to match the actual backend implementation. No backend changes required for these.

### ✅ 1.1 `PUT /api/v1/school-admin/assessments/config` — Frontend aligned to toggle model

**Previous spec shape:** Complex flat object with `assessmentWindowStart`, `retakePolicy`, `aiWeights`.

**Actual backend shape:** `{ configs: [{ assessmentType, isEnabled, description }] }` — per-type enable/disable toggles.

**Frontend fix applied ✅** — `AssessmentConfigItem` type, `AssessmentConfigResponse`, and `AssessmentConfigPayload` all updated to match the `configs` array shape. Assessment config page UI simplified to toggle + description card per assessment type (removed time limit, retakes, cooldown, and scheduling fields that don't exist in backend).

---

### ✅ 1.2 `POST /api/v1/counselor/onboarding/complete` — Frontend aligned to flat shape

Fixed in previous session. Frontend sends `{ token, password, name, phone?, timezone? }` flat — no `profile` wrapper. Full Name field is required in the onboarding form.

---

### ✅ 1.3 `POST /api/v1/parent/onboarding/complete` — Phone field removed

**Previous frontend:** Sent optional `phone` field that backend silently ignored.

**Frontend fix applied ✅** — `phone` field removed from `ParentOnboardingPayload` type and parent onboarding form. Backend contract: `{ token, password, name }`.

---

### ✅ 1.4 `POST /api/v1/school-admin/staff/invite` — assignAll/studentIds removed

**Previous frontend:** Had dead code sending `assignAll`/`studentIds` that backend never accepted.

**Frontend fix applied ✅** — Removed `assignAll?`/`studentIds?` from `StaffInvitePayload` type and from the invite form handler. Current contract: `{ email, name, role }` only.

**Note for backend:** If student pre-assignment at invite time is a future product requirement, backend will need to add `assignAll` and `studentIds` optional fields (see `PORTAL_FEATURES §3.6.1`).

---

## 2. Path Mismatches Fixed by Frontend

These were bugs in the frontend caused by the backend deviating from the contracted URL structure. **Frontend has already been fixed** — noting here so the backend team documents the canonical paths.

| Feature | Contracted path | Actual backend path | Status |
|---------|----------------|---------------------|--------|
| Counselor: list my students | `GET /api/v1/counselor/students` | `GET /api/v1/counselor/me/students` | ✅ Frontend fixed |
| Counselor: student detail | `GET /api/v1/counselor/students/:id` | `GET /api/v1/counselor/me/students/:id` | ✅ Frontend fixed |
| Counselor: student course-sequence | `GET /api/v1/counselor/students/:id/course-sequence` | `GET /api/v1/counselor/me/students/:id/course-sequence` | ✅ Frontend fixed (same pattern) |

**Backend action:** Update the API contract docs and Postman collection to reflect `/me/` as the canonical path, or add redirect aliases at the non-`/me` paths.

---

## 3. Missing Endpoints — Counselor Notes

All 5 endpoints are completely absent from the backend. Referenced in **PORTAL_FEATURES §3.1–3.5**, **SCRUM-145**.

Frontend service file: `src/services/counselorNotesService.ts`  
Frontend hook file: `src/hooks/useCounselorNotesQueries.ts`

### `GET /api/v1/school-admin/students/:studentId/notes`

**Auth:** Bearer (school_admin or counselor)  
**Query params:** `type`, `page`, `limit`

**Response:**
```json
{
  "data": [
    {
      "id": "note_001",
      "studentId": "student_456",
      "authorId": "counselor_001",
      "authorName": "James Carter",
      "type": "meeting",
      "content": "Discussed AP course load and stress management strategies.",
      "isPrivate": false,
      "followUpDate": "2026-03-10",
      "followUpCompleted": false,
      "tags": ["career-planning"],
      "createdAt": "2026-02-25T14:30:00Z",
      "updatedAt": "2026-02-25T14:30:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

**`type` enum:** `general` | `meeting` | `follow_up` | `academic` | `career` | `personal`

---

### `POST /api/v1/school-admin/students/:studentId/notes`

**Auth:** Bearer (school_admin or counselor)

**Request body:**
```json
{
  "type": "meeting",
  "content": "Discussed AP course load.",
  "isPrivate": false,
  "followUpDate": "2026-03-10",
  "tags": ["career-planning"]
}
```

**Response:** `201` — created `CounselorNote` object.

---

### `PUT /api/v1/school-admin/notes/:noteId`

**Auth:** Bearer (must be the note author)  
**Request:** Partial update — any fields from POST body.  
**Response:** Updated note object.

---

### `DELETE /api/v1/school-admin/notes/:noteId`

**Auth:** Bearer (must be the note author)  
**Response:** `200 { "message": "Note deleted successfully" }`

---

### `PUT /api/v1/school-admin/notes/:noteId/complete-followup`

**Auth:** Bearer (school_admin or counselor)  
**Response:**
```json
{
  "data": {
    "id": "note_001",
    "followUpCompleted": true,
    "followUpCompletedAt": "2026-02-28T09:00:00Z"
  }
}
```

---

## 4. Missing Endpoints — Student Portfolio

All 6 endpoints are absent. Referenced in **PORTAL_FEATURES §2.1–2.6**.

Frontend service: `src/services/portfolioService.ts`  
Frontend hook: `src/hooks/usePortfolioQueries.ts`

### `GET /api/v1/student/portfolio`

**Auth:** Bearer (student)  
**Query:** `type`, `page` (default 1), `limit` (default 20)

**`type` enum:** `extracurricular` | `volunteer` | `project` | `award` | `work_experience` | `other`

**Response:**
```json
{
  "data": [
    {
      "id": "port_001",
      "type": "extracurricular",
      "title": "Model UN Club",
      "organization": "Lincoln High",
      "startDate": "2024-09",
      "endDate": null,
      "isCurrent": true,
      "description": "Debate team captain",
      "hoursPerWeek": 4,
      "skills": ["Leadership", "Public Speaking"],
      "attachments": [],
      "createdAt": "2026-01-10T00:00:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### `GET /api/v1/student/portfolio/summary`

**Auth:** Bearer (student)

**Response:**
```json
{
  "data": {
    "total": 5,
    "byType": {
      "extracurricular": 2,
      "volunteer": 1,
      "project": 1,
      "award": 1
    },
    "totalHoursPerWeek": 12,
    "skills": ["Leadership", "Event Planning", "Coding"]
  }
}
```

---

### `POST /api/v1/student/portfolio`

**Auth:** Bearer (student)

**Request body:**
```json
{
  "type": "extracurricular",
  "title": "Model UN Club",
  "organization": "Lincoln High",
  "startDate": "2024-09",
  "endDate": null,
  "isCurrent": true,
  "description": "Debate team captain.",
  "hoursPerWeek": 4,
  "skills": ["Leadership", "Public Speaking"]
}
```

**Response:** `201` — created portfolio item.

---

### `PUT /api/v1/student/portfolio/:id`

**Auth:** Bearer (student — must own the item)  
**Request:** Partial update of any POST fields.  
**Response:** Updated portfolio item.

---

### `DELETE /api/v1/student/portfolio/:id`

**Auth:** Bearer (student — must own the item)  
**Response:** `200 { "message": "Portfolio item deleted successfully" }`

---

### `POST /api/v1/student/portfolio/:id/attachments`

**Auth:** Bearer (student — must own the item)  
**Content-Type:** `multipart/form-data`  
**Body:** `file` — PDF/image/doc, max 10 MB

**Response:**
```json
{
  "data": {
    "id": "attach_001",
    "fileName": "certificate.pdf",
    "fileUrl": "https://cdn.timcare.com/portfolio/attach_001.pdf",
    "fileSize": 102400,
    "mimeType": "application/pdf",
    "uploadedAt": "2026-02-28T10:00:00Z"
  }
}
```

---

## 5. Missing Endpoints — Student Course Plan

All 5 student-facing endpoints are absent. Referenced in **PORTAL_FEATURES §4.1–4.5**, **SCRUM-138**.

Frontend service: `src/services/coursePlanService.ts`  
Frontend hook: `src/hooks/useCoursePlanQueries.ts`

### `GET /api/v1/student/course-plan`

**Auth:** Bearer (student)

**Response:**
```json
{
  "data": {
    "studentId": "student_001",
    "academicYearId": "year_2026",
    "totalCreditsRequired": 24,
    "totalCreditsPlanned": 18,
    "totalCreditsCompleted": 12,
    "graduationOnTrack": true,
    "courses": [
      {
        "id": "plan_001",
        "courseId": "course_abc",
        "courseCode": "MATH-301",
        "courseName": "Pre-Calculus",
        "credits": 1,
        "gradeLevel": 11,
        "semester": "Fall 2026",
        "status": "planned"
      }
    ]
  }
}
```

**`status` enum:** `planned` | `enrolled` | `completed` | `dropped`

---

### `GET /api/v1/school-admin/students/:studentId/course-plan`

**Auth:** Bearer (school_admin or counselor)  
**Response:** Same structure as student GET above.

---

### `GET /api/v1/student/course-plan/recommendations`

**Auth:** Bearer (student)

**Response:**
```json
{
  "data": [
    {
      "courseId": "course_xyz",
      "courseCode": "MATH-301",
      "courseName": "Pre-Calculus",
      "reason": "Closes 1.5-credit gap in Mathematics.",
      "confidence": 0.92,
      "gradeLevel": 11,
      "semester": "fall"
    }
  ]
}
```

---

### `POST /api/v1/student/course-plan/courses`

**Auth:** Bearer (student)

**Request body:**
```json
{
  "courseId": "course_abc",
  "gradeLevel": 11,
  "semester": "Fall 2026"
}
```

**Response:** `201` — updated `StudentCoursePlan` object.

---

### `DELETE /api/v1/student/course-plan/courses/:courseId`

**Auth:** Bearer (student). Only courses with `status: "planned"` can be removed.  
**Response:** `200` — updated `StudentCoursePlan` object.

---

## 5a. Counselor Direct Edit — Course Plan

Counselors can directly add or remove **planned** courses from a student's course plan without going through the approval workflow.

### `POST /api/v1/counselor/me/students/:studentId/course-plan/courses`

**Auth:** Bearer (counselor or school_admin)

**Request body:**
```json
{ "courseId": "course_abc", "gradeLevel": 11, "semester": "Fall 2026" }
```
**Response:** `201` — updated `StudentCoursePlan` object.

---

### `DELETE /api/v1/counselor/me/students/:studentId/course-plan/courses/:enrollmentId`

**Auth:** Bearer (counselor or school_admin). Only removes `status: "planned"` enrollments.  
**Response:** `200` — updated `StudentCoursePlan` object.

---

## 5b. Student Course Change Requests — Approval Workflow

Students cannot directly modify their course plans. Instead they submit **change requests** which counselors must approve or reject.

### `POST /api/v1/student/course-plan/change-requests`

**Auth:** Bearer (student)

**Request body:**
```json
{
  "courseId": "course_abc",
  "courseCode": "MATH-301",
  "courseName": "Pre-Calculus",
  "credits": 1,
  "gradeLevel": 11,
  "semester": "Fall 2026",
  "action": "add",
  "studentNote": "I want to take this to prepare for AP Calculus."
}
```

**`action` enum:** `add` | `remove`

**Response:** `201` — created `CourseChangeRequest` object.

```json
{
  "data": {
    "id": "req_001",
    "studentId": "student_001",
    "courseId": "course_abc",
    "courseCode": "MATH-301",
    "courseName": "Pre-Calculus",
    "credits": 1,
    "gradeLevel": 11,
    "semester": "Fall 2026",
    "action": "add",
    "status": "pending",
    "studentNote": "I want to take this to prepare for AP Calculus.",
    "createdAt": "2026-02-28T10:00:00Z"
  }
}
```

---

### `GET /api/v1/student/course-plan/change-requests`

**Auth:** Bearer (student)  
**Query:** `status` (`pending` | `approved` | `rejected` | `cancelled`), `page`, `limit`

**Response:** standard paginated envelope with `CourseChangeRequest[]`.

---

### `DELETE /api/v1/student/course-plan/change-requests/:requestId`

**Auth:** Bearer (student — must own the request, status must be `pending`)  
**Response:** `200 { "message": "Change request cancelled" }`

---

### `GET /api/v1/counselor/me/students/:studentId/course-plan/change-requests`

**Auth:** Bearer (counselor or school_admin)  
**Query:** `status`, `page`, `limit`

**Response:** standard paginated envelope with `CourseChangeRequest[]`.

---

### `PUT /api/v1/counselor/me/students/:studentId/course-plan/change-requests/:requestId`

**Auth:** Bearer (counselor or school_admin)

**Request body:**
```json
{
  "status": "approved",
  "counselorNote": "Great choice for your math track."
}
```

**`status` enum:** `approved` | `rejected`

**Response:** Updated `CourseChangeRequest` object.

**Side effect on `approved`:** Backend must immediately apply the change to the student's course plan (add or remove the enrollment). This keeps the plan in sync automatically.

---

## 6. Missing Endpoints — Academic Calendar Sub-features

`GET /api/v1/school-admin/calendar/academic-years` and `POST` both exist.  
The following **9 endpoints** are absent. Referenced in **ALL_EPICS SCRUM-133**.

### Academic Year Edit/Delete

#### `PUT /api/v1/school-admin/calendar/academic-years/:id`
**Auth:** Bearer (school_admin)  
**Request:** Partial update of `{ name, startDate, endDate, terms[], isCurrent }`.  
**Response:** Updated academic year.

#### `DELETE /api/v1/school-admin/calendar/academic-years/:id`
**Auth:** Bearer (school_admin)  
Only allowed if no grades, courses, or assessments reference the year.  
**Response:** `200 { "message": "Academic year deleted" }`

---

### Assessment Periods

#### `GET /api/v1/school-admin/calendar/assessment-periods`
**Auth:** Bearer (school_admin)  
**Query:** `academicYearId` (optional — defaults to current year)

**Response:**
```json
{
  "data": [
    {
      "id": "period_001",
      "name": "Mid-Semester 1 Exams",
      "startDate": "2026-03-10",
      "endDate": "2026-03-20",
      "termId": "term_001",
      "assessmentTypes": ["MIL", "PCA"]
    }
  ]
}
```

#### `POST /api/v1/school-admin/calendar/assessment-periods`
**Auth:** Bearer (school_admin)

**Request body:**
```json
{
  "name": "Mid-Semester 1 Exams",
  "startDate": "2026-03-10",
  "endDate": "2026-03-20",
  "termId": "term_001",
  "assessmentTypes": ["MIL", "PCA"]
}
```
**Response:** `201` — created assessment period.

**`assessmentTypes` enum:** `MIL` | `PCA` | `360` | `TIMS`

#### `PUT /api/v1/school-admin/calendar/assessment-periods/:id`
**Request:** Partial update. **Response:** Updated period.

#### `DELETE /api/v1/school-admin/calendar/assessment-periods/:id`
**Response:** `200 { "message": "Assessment period deleted" }`

---

### Holidays

#### `GET /api/v1/school-admin/calendar/holidays`
**Auth:** Bearer (school_admin)  
**Query:** `academicYearId`

**Response:**
```json
{
  "data": [
    {
      "id": "holiday_001",
      "name": "Independence Day",
      "date": "2026-09-15",
      "type": "national"
    }
  ]
}
```

**`type` enum:** `national` | `school` | `custom`

#### `POST /api/v1/school-admin/calendar/holidays`
**Request:** `{ holidays: [{ name, date, type }] }` (bulk)  
**Response:** `201` — array of created holidays.

#### `DELETE /api/v1/school-admin/calendar/holidays/:id`
**Response:** `204 No Content`

---

## 7. Missing Endpoints — Graduation Rules Write

`GET /api/v1/school-admin/graduation/rules` exists. Write operations are absent. Referenced in **ALL_EPICS SCRUM-132**.

### `POST /api/v1/school-admin/graduation/rules`

**Auth:** Bearer (school_admin)

**Request body:**
```json
{
  "academicYear": "2026-2027",
  "totalCreditsRequired": 24,
  "communityServiceHours": 40,
  "seniorProjectRequired": true,
  "assessmentPillarsRequired": ["LIA", "PCA", "MIL", "360"],
  "categoryRequirements": [
    {
      "category": "Mathematics",
      "creditsRequired": 4,
      "requiredCourses": []
    },
    {
      "category": "Science",
      "creditsRequired": 3,
      "requiredCourses": ["BIO-101"]
    }
  ]
}
```

**Response:** `201` — created rule set with generated IDs.

---

### `PUT /api/v1/school-admin/graduation/rules/:ruleSetId`

**Auth:** Bearer (school_admin)  
**Request:** Partial update of any fields from POST body.  
**Response:** Updated rule set.

---

### `GET /api/v1/school-admin/graduation/progress` (batch — all students)

**Auth:** Bearer (school_admin)  
**Query:** `page`, `limit`, `status` (`on_track` | `at_risk` | `off_track`), `sortBy` (`progress` | `name`)

**Response:**
```json
{
  "data": [
    {
      "studentId": "student_001",
      "studentName": "Sofia Gomez",
      "gradeLevel": 10,
      "creditsCompleted": 12,
      "creditsRequired": 24,
      "progressPercent": 50,
      "status": "on_track",
      "unmetSpecialRequirements": []
    }
  ],
  "total": 87,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

---

## 8. Missing Endpoints — Other Gaps

### `GET /api/v1/school-admin/assessments/status`

**Auth:** Bearer (school_admin)  
**Description:** High-level assessment completion stats across all students.

**Response:**
```json
{
  "data": {
    "totalStudents": 320,
    "notStarted": 85,
    "inProgress": 62,
    "completed": 173,
    "completionRate": 54.06
  }
}
```

---

### `GET /api/v1/school-admin/curriculum/frameworks/:type/courses`

**Auth:** Bearer (school_admin)  
**Path param `type`:** `ap` | `ib` | `national` | `custom`  
**Query:** `page`, `limit`, `search`

**Response:**
```json
{
  "data": [
    {
      "id": "fc_001",
      "courseCode": "AP-CALC-AB",
      "courseName": "AP Calculus AB",
      "credits": 1,
      "gradeLevels": [11, 12],
      "isActive": true,
      "isGlobal": true,
      "schoolOverride": null
    }
  ],
  "total": 38,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

---

### `PUT /api/v1/school-admin/curriculum/frameworks/:type/courses/:courseId`

**Auth:** Bearer (school_admin)

**Request body (all optional — partial update):**
```json
{
  "credits": 1.5,
  "gradeLevels": [10, 11, 12],
  "isActive": true,
  "localName": "Biología AP"
}
```

**Response:** Updated course with school override applied.

---

## 9. Auth / Token Inconsistency

### 🟠 Refresh token response field name vs Login

| Endpoint | Response token field | Frontend reads |
|----------|---------------------|----------------|
| `POST /authapi/login` | `data.token` | `data.token` ✅ |
| `POST /authapi/refresh` | `data.accessToken` | `data.accessToken` ✅ |

The two endpoints use **different field names** (`token` vs `accessToken`). The frontend handles both correctly via dedicated typed interfaces, but the inconsistency is a maintenance hazard.

**Backend recommendation:** Standardize to `data.token` on both endpoints (or `data.accessToken` on both). The login endpoint is used in more places, so changing it has higher risk — recommend changing the refresh endpoint to also return `data.token`.

---

## Summary — Backend Work Still Required

| Priority | Feature | Endpoints | Effort Est. |
|----------|---------|-----------|-------------|
| 🟠 High | Counselor Notes (§3) | 5 | 8h |
| 🟠 High | Student Portfolio (§4) | 6 | 8h |
| 🟠 High | Student Course Plan (§5) | 5 | 10h |
| � High | Counselor direct plan edit (§5a) | 2 | 3h |
| 🟠 High | Student change requests + counselor approval (§5b) | 6 | 8h |
| 🟡 Medium | Academic Calendar sub-features (§6) | 9 | 6h |
| 🟡 Medium | Graduation Rules write ops + batch progress (§7) | 3 | 6h |
| 🟡 Medium | Assessment status stats endpoint (§8) | 1 | 2h |
| 🟡 Medium | Curriculum framework course endpoints (§8) | 2 | 4h |
| 🟡 Low | Standardize refresh token field name (§9) | — | 1h |

**Total estimated backend effort: ~56h**

---

*Frontend changes applied (2026-02-28):*
- *`src/types/assessmentConfig.ts` — `AssessmentConfigItem`/`Response`/`Payload` updated to `configs` array shape; `assignAll`/`studentIds` removed from `StaffInvitePayload`*
- *`src/app/school-admin/assessments/page.tsx` — UI simplified to toggle + description per assessment type*
- *`src/app/school-admin/users/page.tsx` — Dead `assignAll`/`studentIds` code and `inviteScope` state removed*
- *`src/app/parent/onboarding/page.tsx` — Phone field removed from form*
- *`src/services/parentPortalService.ts` — `phone?` removed from `ParentOnboardingPayload`*
- *`src/services/schoolProfileService.ts` — Counselor student paths fixed to `/me/` prefix (prior session)*
- *`src/services/counselorService.ts` — `CounselorOnboardingPayload` flattened with required `name` (prior session)*
- *`src/app/counselor/onboarding/page.tsx` — Full Name field added (prior session)*

*All frontend files verified zero TypeScript errors.*

*Contact frontend team for any schema clarifications before implementation.*
