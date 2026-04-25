# Complete Backend API Request — All Missing Endpoints

**Date:** 2026-03-01  
**Author:** Frontend Team  
**Priority:** HIGH  
**Status:** Comprehensive list of every endpoint the frontend needs that is NOT yet in the Postman collection

This document consolidates **all** missing backend endpoints in one place — both from the original `BACKEND_CONTRACT_ISSUES_2026-02-28.md` audit and the newly identified gaps from the full requirements audit against `docs/req.md`.

**Frontend services and types for ALL endpoints below are already coded and waiting.**

---

## Table of Contents

1. [Counselor Notes (3 missing)](#1-counselor-notes)
2. [Student Portfolio (3 missing)](#2-student-portfolio)
3. [Counselor Direct Course Plan Edit (2 missing)](#3-counselor-direct-course-plan-edit)
4. [Student Course Change Requests (5 missing)](#4-student-course-change-requests)
5. [Academic Calendar Sub-features (9 missing)](#5-academic-calendar-sub-features)
6. [Graduation Rules Write (2 missing)](#6-graduation-rules-write)
7. [Assessment Status](#7-assessment-status)
8. [Curriculum Framework Courses](#8-curriculum-framework-courses)
9. [Community Service Hours Tracking (4 NEW)](#9-community-service-hours-tracking)

---

## 1. Counselor Notes

**Frontend service:** `src/services/counselorNotesService.ts`  
**Frontend hook:** `src/hooks/useCounselorNotesQueries.ts`  
**UI:** Integrated in `counselor/students/[id]` and `school-admin/students/[id]`

> `GET` and `POST` for notes already exist in Postman ✅. The following 3 are missing:

### `PUT /api/v1/school-admin/notes/:noteId`

**Auth:** Bearer (must be the note author)  
**Request:** Partial update — any fields from POST body (`type`, `content`, `isPrivate`, `followUpDate`, `tags`).  
**Response:** Updated `CounselorNote` object.

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

## 2. Student Portfolio

**Frontend service:** `src/services/portfolioService.ts`  
**Frontend hook:** `src/hooks/usePortfolioQueries.ts`  
**UI:** `dashboard/portfolio/page.tsx`

> `GET` (list), `GET` (summary), and `POST` (create) already exist in Postman ✅. The following 3 are missing:

### `PUT /api/v1/student/portfolio/:id`

**Auth:** Bearer (student — must own the item)  
**Request:** Partial update of any POST fields (`type`, `title`, `organization`, `startDate`, `endDate`, `isCurrent`, `description`, `hoursPerWeek`, `skills`).  
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

## 3. Counselor Direct Course Plan Edit

**Frontend service:** `src/services/coursePlanService.ts` → `counselorAddCourseToPlan`, `counselorRemoveCourseFromPlan`

### `POST /api/v1/counselor/me/students/:studentId/course-plan/courses`

**Auth:** Bearer (counselor or school_admin)

**Request:**

```json
{ "courseId": "course_abc", "gradeLevel": 11, "semester": "Fall 2026" }
```

**Response:** `201` — updated `StudentCoursePlan` object.

---

### `DELETE /api/v1/counselor/me/students/:studentId/course-plan/courses/:enrollmentId`

**Auth:** Bearer (counselor or school_admin). Only removes `status: "planned"` enrollments.  
**Response:** `200` — updated `StudentCoursePlan` object.

---

## 4. Student Course Change Requests

**Frontend service:** `src/services/coursePlanService.ts` → `submitChangeRequest`, `getMyChangeRequests`, `cancelChangeRequest`, `getStudentChangeRequests`, `reviewChangeRequest`

Students cannot directly modify their course plans. They submit change requests which counselors approve or reject.

### `POST /api/v1/student/course-plan/change-requests`

**Auth:** Bearer (student)

**Request:**

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

**Response:** `201` — created `CourseChangeRequest` object with `status: "pending"`.

---

### `GET /api/v1/student/course-plan/change-requests`

**Auth:** Bearer (student)  
**Query:** `status` (`pending` | `approved` | `rejected` | `cancelled`), `page`, `limit`  
**Response:** Paginated `CourseChangeRequest[]`.

---

### `DELETE /api/v1/student/course-plan/change-requests/:requestId`

**Auth:** Bearer (student — must own the request, status must be `pending`)  
**Response:** `200 { "message": "Change request cancelled" }`

---

### `GET /api/v1/counselor/me/students/:studentId/course-plan/change-requests`

**Auth:** Bearer (counselor or school_admin)  
**Query:** `status`, `page`, `limit`  
**Response:** Paginated `CourseChangeRequest[]`.

---

### `PUT /api/v1/counselor/me/students/:studentId/course-plan/change-requests/:requestId`

**Auth:** Bearer (counselor or school_admin)

**Request:**

```json
{
  "status": "approved",
  "counselorNote": "Great choice for your math track."
}
```

**`status` enum:** `approved` | `rejected`  
**Response:** Updated `CourseChangeRequest` object.

**Side effect on `approved`:** Backend must immediately apply the change to the student's course plan.

---

## 5. Academic Calendar Sub-features

**Frontend service:** `src/services/calendarService.ts`  
**UI:** `school-admin/calendar/page.tsx`

> `GET` and `POST` for academic years already exist ✅. All 9 below are missing:

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

### Assessment Periods (full CRUD)

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

**Request:**

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

### Holidays (full CRUD)

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

## 6. Graduation Rules Write

**Frontend service:** `src/services/graduationService.ts`  
**UI:** `school-admin/graduation/page.tsx`

> `GET /graduation/rules` and `GET /graduation/progress` (batch) already exist ✅. The following 2 are missing:

### `POST /api/v1/school-admin/graduation/rules`

**Auth:** Bearer (school_admin)

**Request:**

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

## 7. Assessment Status

**Frontend service:** `src/services/assessmentConfigService.ts` → `getAssessmentStatus()`

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

## 8. Curriculum Framework Courses

**Frontend service:** `src/services/curriculumService.ts` → `getFrameworkCourses()`, `updateFrameworkCourse()`

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

**Request (all optional — partial update):**

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

## 9. Community Service Hours Tracking (NEW)

> **Not in any previous document.** Identified from `docs/req.md` §4.4.1 — graduation requires 40 hours community service but no tracking mechanism exists.

**Frontend service:** To be created: `src/services/communityServiceService.ts`

### `GET /api/v1/student/community-service`

**Auth:** Bearer (student)

**Response:**

```json
{
  "data": {
    "totalHoursRequired": 40,
    "totalHoursLogged": 22,
    "totalHoursVerified": 18,
    "entries": [
      {
        "id": "cs_001",
        "organization": "Red Cross Costa Rica",
        "description": "Blood drive volunteer coordinator",
        "hours": 8,
        "date": "2026-01-15",
        "status": "verified",
        "verifiedBy": "counselor_001",
        "verifiedAt": "2026-01-20T10:00:00Z"
      }
    ]
  }
}
```

**`status` enum:** `pending` | `verified` | `rejected`

---

### `POST /api/v1/student/community-service`

**Auth:** Bearer (student)

**Request:**

```json
{
  "organization": "Red Cross Costa Rica",
  "description": "Blood drive volunteer coordinator",
  "hours": 8,
  "date": "2026-01-15",
  "supervisorName": "Maria Gonzalez",
  "supervisorEmail": "mgonzalez@redcross.cr"
}
```

**Response:** `201` — created entry.

---

### `GET /api/v1/school-admin/students/:studentId/community-service`

**Auth:** Bearer (school_admin or counselor)  
**Response:** Same structure as student GET.

---

### `PUT /api/v1/school-admin/community-service/:entryId/verify`

**Auth:** Bearer (school_admin or counselor)

**Request:**

```json
{
  "status": "verified",
  "note": "Confirmed with organization"
}
```

**Response:** Updated entry.

---

## Master Summary

| #   | Feature Area                 | Missing Endpoints | Effort Est. | Source     |
| --- | ---------------------------- | ----------------- | ----------- | ---------- |
| 1   | Counselor Notes              | 3                 | 4h          | Feb 28 doc |
| 2   | Student Portfolio            | 3                 | 4h          | Feb 28 doc |
| 3   | Counselor Direct Plan Edit   | 2                 | 3h          | Feb 28 doc |
| 4   | Student Change Requests      | 5                 | 8h          | Feb 28 doc |
| 5   | Academic Calendar            | 9                 | 6h          | Feb 28 doc |
| 6   | Graduation Rules Write       | 2                 | 6h          | Feb 28 doc |
| 7   | Assessment Status            | 1                 | 2h          | Feb 28 doc |
| 8   | Curriculum Framework Courses | 2                 | 4h          | Feb 28 doc |
| 9   | Community Service Hours      | 4                 | 6h          | **NEW**    |
|     | **TOTAL**                    | **31**            | **~43h**    |            |

---

## Open Clarifications (Need Product/Client Decision)

1. **Personality & Interests Inventory** — Is TIMS career scoring the 4th assessment pillar, or does the client expect a separate standalone assessment page?
2. **Proctoring** — Spec defines `RequireProctoring`, `ProctoringType`, `AllowPause` but nothing exists. Required for CDS pilot or deferred?
3. **Assessment Config depth** — Spec defines scheduling, time limits, retakes, cooldown. Backend only supports enable/disable toggles. Is the simplified model acceptable?
4. **Teacher evaluations** — Does 360-degree system need an explicit "teacher" evaluator type separate from "peer"?
5. **Auth token standardization** — Login returns `data.token`, refresh returns `data.accessToken`. Recommend standardizing to `data.token` on both.

---

_Contact frontend team for any schema clarifications before implementation._
