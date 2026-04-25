# Backend API Requirements — Portal Features
**Date:** 2026-02-18  
**Priority:** High  
**Frontend Status:** UI pages built, hooks/services ready — awaiting backend endpoints  
**Related EPICs:** SCRUM-134 (Student Portal), SCRUM-139 (Course Trajectory), SCRUM-138 (Assessment System), SCRUM-140 (Counselor Dashboard)

---

## Table of Contents
1. [Parent Portal APIs](#1-parent-portal-apis)
2. [Student Portfolio APIs](#2-student-portfolio-apis)
3. [Counselor Notes APIs](#3-counselor-notes-apis)
4. [Student Course Plan APIs](#4-student-course-plan-apis)
5. [Authentication & Authorization Notes](#5-authentication--authorization-notes)

---

## 1. Parent Portal APIs

Parent users access a read-only dashboard to view their children's progress, pending 360-degree evaluations, and recent activity.

### 1.1 GET `/api/v1/parent/profile`

**Description:** Get the authenticated parent's profile including linked children.  
**Auth:** Bearer token (role: `parent`)  
**Frontend file:** `src/services/parentPortalService.ts` → `getParentProfile()`

**Response — 200 OK:**
```json
{
  "data": {
    "id": "string",
    "name": "string",
    "email": "string",
    "avatar": "string | null",
    "children": [
      {
        "studentId": "string",
        "studentName": "string",
        "gradeLevel": "string",
        "relationship": "mother | father | guardian | other"
      }
    ],
    "notificationPreferences": {
      "email": true,
      "sms": false
    }
  }
}
```

---

### 1.2 GET `/api/v1/parent/children/:childId/progress`

**Description:** Get detailed progress summary for a specific child.  
**Auth:** Bearer token (role: `parent`). Parent must be linked to this child.  
**Frontend file:** `src/services/parentPortalService.ts` → `getChildProgress(childId)`

**Path Params:**
| Param   | Type   | Description        |
|---------|--------|--------------------|
| childId | string | The student's user ID |

**Response — 200 OK:**
```json
{
  "data": {
    "studentId": "string",
    "studentName": "string",
    "gradeLevel": "string",
    "gpa": 3.8,
    "creditsEarned": 42,
    "creditsRequired": 56,
    "isOnTrack": true,
    "careerPathway": "Engineering & Technology",
    "assessmentStatus": {
      "completed": 3,
      "total": 5
    },
    "recentActivity": [
      {
        "id": "string",
        "date": "2026-02-15T10:30:00Z",
        "type": "assessment_completed | course_enrolled | milestone_reached | grade_posted",
        "description": "Completed PCA Assessment with score 85%"
      }
    ],
    "pendingActions": [
      {
        "id": "string",
        "title": "Complete 360° Evaluation for Maria",
        "description": "You have been invited to evaluate your child",
        "deadline": "2026-03-01T23:59:59Z",
        "actionUrl": "/evaluation/complete/abc123"
      }
    ]
  }
}
```

---

### 1.3 GET `/api/v1/parent/evaluations/pending`

**Description:** List all pending 360-degree evaluations the parent needs to complete.  
**Auth:** Bearer token (role: `parent`)  
**Frontend file:** `src/services/parentPortalService.ts` → `getParentPendingEvaluations()`

**Response — 200 OK:**
```json
{
  "data": [
    {
      "id": "string",
      "sessionId": "string",
      "studentName": "string",
      "title": "360° Evaluation - Spring 2026",
      "deadline": "2026-03-01T23:59:59Z",
      "status": "pending | in_progress",
      "completionUrl": "/evaluation/complete/abc123"
    }
  ]
}
```

---

## 2. Student Portfolio APIs

Students build a portfolio of extracurriculars, volunteer work, projects, awards, and more for university applications and career planning.

### 2.1 GET `/api/v1/student/portfolio`

**Description:** List the authenticated student's portfolio items with filtering and pagination.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/portfolioService.ts` → `getPortfolioItems(params)`

**Query Params:**
| Param | Type   | Default | Description                                              |
|-------|--------|---------|----------------------------------------------------------|
| type  | string | —       | Filter by type: `extracurricular`, `volunteer`, `project`, `award`, `work_experience`, `other` |
| page  | number | 1       | Page number                                              |
| limit | number | 20      | Items per page                                           |

**Response — 200 OK:**
```json
{
  "data": [
    {
      "id": "string",
      "type": "extracurricular | volunteer | project | award | work_experience | other",
      "title": "string",
      "organization": "string",
      "description": "string",
      "startDate": "2025-09-01",
      "endDate": "2026-05-15 | null",
      "isCurrent": false,
      "hoursPerWeek": 5,
      "totalHours": 120,
      "role": "President | null",
      "skills": ["Leadership", "Public Speaking"],
      "attachments": [
        {
          "id": "string",
          "fileName": "certificate.pdf",
          "fileUrl": "https://...",
          "fileType": "application/pdf",
          "uploadedAt": "2026-01-15T10:00:00Z"
        }
      ],
      "createdAt": "2026-01-10T08:00:00Z",
      "updatedAt": "2026-02-01T14:30:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 2.2 GET `/api/v1/student/portfolio/summary`

**Description:** Get aggregated portfolio statistics.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/portfolioService.ts` → `getPortfolioSummary()`

**Response — 200 OK:**
```json
{
  "data": {
    "totalItems": 15,
    "totalVolunteerHours": 240,
    "byType": {
      "extracurricular": 4,
      "volunteer": 3,
      "project": 5,
      "award": 2,
      "work_experience": 1,
      "other": 0
    }
  }
}
```

---

### 2.3 POST `/api/v1/student/portfolio`

**Description:** Create a new portfolio item.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/portfolioService.ts` → `createPortfolioItem(payload)`

**Request Body:**
```json
{
  "type": "extracurricular",
  "title": "Student Council",
  "organization": "Lincoln High School",
  "description": "Served as VP of Student Council organizing school events",
  "startDate": "2025-09-01",
  "endDate": null,
  "isCurrent": true,
  "hoursPerWeek": 5,
  "totalHours": 120,
  "role": "Vice President",
  "skills": ["Leadership", "Event Planning"]
}
```

**Response — 201 Created:**
```json
{
  "data": { /* full PortfolioItem object */ }
}
```

---

### 2.4 PUT `/api/v1/student/portfolio/:id`

**Description:** Update an existing portfolio item.  
**Auth:** Bearer token (role: `student`). Must own the item.  
**Frontend file:** `src/services/portfolioService.ts` → `updatePortfolioItem(id, payload)`

**Path Params:**
| Param | Type   | Description     |
|-------|--------|-----------------|
| id    | string | Portfolio item ID |

**Request Body:** Same shape as POST (all fields optional for partial update).

**Response — 200 OK:**
```json
{
  "data": { /* updated PortfolioItem object */ }
}
```

---

### 2.5 DELETE `/api/v1/student/portfolio/:id`

**Description:** Delete a portfolio item and its attachments.  
**Auth:** Bearer token (role: `student`). Must own the item.  
**Frontend file:** `src/services/portfolioService.ts` → `deletePortfolioItem(id)`

**Response — 200 OK:**
```json
{
  "message": "Portfolio item deleted successfully"
}
```

---

### 2.6 POST `/api/v1/student/portfolio/:id/attachments`

**Description:** Upload a file attachment to a portfolio item.  
**Auth:** Bearer token (role: `student`). Must own the item.  
**Content-Type:** `multipart/form-data`  
**Frontend file:** `src/services/portfolioService.ts` → `uploadPortfolioAttachment(itemId, file)`

**Form Data:**
| Field | Type | Description |
|-------|------|-------------|
| file  | File | The file to upload (max 10MB, PDF/image/doc formats) |

**Response — 201 Created:**
```json
{
  "data": {
    "id": "string",
    "fileName": "certificate.pdf",
    "fileUrl": "https://...",
    "fileType": "application/pdf",
    "uploadedAt": "2026-02-18T10:00:00Z"
  }
}
```

---

## 3. Counselor Notes APIs

Counselors (school-admin role with counselor permissions) can create, read, update, and delete private notes about students. Notes support types, tags, and follow-up dates.

### 3.1 GET `/api/v1/school-admin/students/:studentId/notes`

**Description:** List counselor notes for a specific student, paginated.  
**Auth:** Bearer token (role: `school_admin`)  
**Frontend file:** `src/services/counselorNotesService.ts` → `getStudentNotes(studentId, params)`

**Path Params:**
| Param     | Type   | Description |
|-----------|--------|-------------|
| studentId | string | Student ID  |

**Query Params:**
| Param | Type   | Default | Description                                                  |
|-------|--------|---------|--------------------------------------------------------------|
| type  | string | —       | Filter: `general`, `meeting`, `follow_up`, `academic`, `career`, `personal` |
| page  | number | 1       | Page number                                                  |
| limit | number | 20      | Items per page                                               |

**Response — 200 OK:**
```json
{
  "data": [
    {
      "id": "string",
      "studentId": "string",
      "counselorId": "string",
      "counselorName": "string",
      "type": "general | meeting | follow_up | academic | career | personal",
      "content": "Met with student to discuss career goals...",
      "isPrivate": true,
      "followUpDate": "2026-03-15 | null",
      "followUpCompleted": false,
      "tags": ["career-planning", "university-prep"],
      "createdAt": "2026-02-18T10:00:00Z",
      "updatedAt": "2026-02-18T10:00:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 3.2 POST `/api/v1/school-admin/students/:studentId/notes`

**Description:** Create a new counselor note for a student.  
**Auth:** Bearer token (role: `school_admin`)  
**Frontend file:** `src/services/counselorNotesService.ts` → `createNote(payload)`

**Path Params:**
| Param     | Type   | Description |
|-----------|--------|-------------|
| studentId | string | Student ID  |

**Request Body:**
```json
{
  "type": "meeting",
  "content": "Discussed career interests and upcoming college fair",
  "isPrivate": false,
  "followUpDate": "2026-03-01",
  "tags": ["career-planning"]
}
```

| Field        | Type     | Required | Description                        |
|--------------|----------|----------|------------------------------------|
| type         | string   | Yes      | Note type (see enum above)         |
| content      | string   | Yes      | Note content                       |
| isPrivate    | boolean  | Yes      | Whether note is visible only to the author |
| followUpDate | string   | No       | ISO date for follow-up reminder    |
| tags         | string[] | No       | Categorization tags                |

**Response — 201 Created:**
```json
{
  "data": { /* full CounselorNote object */ }
}
```

---

### 3.3 PUT `/api/v1/school-admin/notes/:noteId`

**Description:** Update an existing counselor note.  
**Auth:** Bearer token (role: `school_admin`). Must be the author.  
**Frontend file:** `src/services/counselorNotesService.ts` → `updateNote(noteId, payload)`

**Request Body:** Same shape as POST (all fields optional for partial update).

**Response — 200 OK:**
```json
{
  "data": { /* updated CounselorNote object */ }
}
```

---

### 3.4 DELETE `/api/v1/school-admin/notes/:noteId`

**Description:** Delete a counselor note.  
**Auth:** Bearer token (role: `school_admin`). Must be the author.  
**Frontend file:** `src/services/counselorNotesService.ts` → `deleteNote(noteId)`

**Response — 200 OK:**
```json
{
  "message": "Note deleted successfully"
}
```

---

### 3.5 PUT `/api/v1/school-admin/notes/:noteId/complete-followup`

**Description:** Mark a note's follow-up as completed.  
**Auth:** Bearer token (role: `school_admin`)  
**Frontend file:** `src/services/counselorNotesService.ts` → `completeFollowUp(noteId)`

**Response — 200 OK:**
```json
{
  "data": {
    "id": "string",
    "followUpCompleted": true,
    "updatedAt": "2026-02-18T15:00:00Z"
  }
}
```

---

### 3.6 Counselor Onboarding & Dashboard APIs
Counselors require a token-based onboarding flow plus a dedicated counselor-scoped dashboard. School-admins must be able to invite counselors **and** optionally assign them to all students or a selected set at invite time.

#### 3.6.1 POST `/api/v1/school-admin/staff/invite` (extend)

**Description:** Invite school staff (existing). When `role === "counselor"` the request MAY include the optional fields below to pre-assign student access at invite time.
**Auth:** Bearer token (role: `school_admin`)  
**Frontend file:** `src/services/schoolProfileService.ts` → `inviteStaff()`

Request body additions (optional when role is `counselor`):
- `assignAll?: boolean` — if true, counselor has access to all students
- `studentIds?: string[]` — explicit list of student IDs to assign

Example request body:
```json
{
  "email": "counselor@example.edu",
  "name": "Jane Counselor",
  "role": "counselor",
  "assignAll": false,
  "studentIds": ["stu-1","stu-2"]
}
```

**Security note:** The API should **not** return the onboarding token in the response (token must be delivered via email). If the team needs a token-return option for test/dev, expose a separate admin-only endpoint.

#### 3.6.2 GET `/api/v1/counselor/onboarding/verify?token=<token>`

**Description:** Validate an invite token and return invite metadata (invited email, invitedBy, schoolId, assignedStudentCount, assignAll flag).
**Auth:** none (token in query)

Response — 200 OK:
```json
{ "data": { "email":"counselor@example.edu","invitedBy":"admin-1","assignAll":false,"assignedStudentCount":2 } }
```

#### 3.6.3 POST `/api/v1/counselor/onboarding/complete`

**Description:** Complete onboarding using the invite token — set password/profile — returns JWT/session on success.  
**Auth:** none (token in body)

Request:
```json
{ "token":"<invite-token>","password":"P@ssw0rd","profile":{ "phone":"", "timezone":"" } }
```

Response — 200 OK:
```json
{ "data": { "token":"<jwt>", "user": { /* counselor user */ } } }
```

#### 3.6.4 GET `/api/v1/counselor/dashboard`

**Description:** Counselor-scoped dashboard showing assigned students (paginated), upcoming follow-ups, recent counselor notes, and quick stats.  
**Auth:** Bearer token (role: `counselor`)  
**Frontend files:** `src/services/counselorService.ts`, `src/hooks/useCounselorDashboard.ts`, `src/app/counselor/dashboard/page.tsx`

---

## 4. Student Course Plan APIs

Students can view their 4-year course trajectory, see AI-recommended courses, and add/remove planned courses. Counselors can view any student's plan.

### 4.1 GET `/api/v1/student/course-plan`

**Description:** Get the authenticated student's course plan with graduation progress.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/coursePlanService.ts` → `getMyCoursePlan()`

**Response — 200 OK:**
```json
{
  "data": {
    "plan": {
      "studentId": "string",
      "graduationProgress": {
        "totalCreditsEarned": 42,
        "totalCreditsRequired": 56,
        "percentage": 75,
        "isOnTrack": true
      },
      "enrollments": [
        {
          "courseId": "string",
          "courseName": "AP Calculus AB",
          "courseCode": "MATH-301",
          "category": "Mathematics",
          "gradeLevel": 11,
          "credits": 1.0,
          "status": "completed | in_progress | planned | dropped",
          "grade": "A | null",
          "semester": "Fall 2025",
          "isRequired": true
        }
      ],
      "byGrade": {
        "9": [ /* enrollments for grade 9 */ ],
        "10": [ /* enrollments for grade 10 */ ],
        "11": [ /* enrollments for grade 11 */ ],
        "12": [ /* enrollments for grade 12 */ ]
      }
    }
  }
}
```

---

### 4.2 GET `/api/v1/school-admin/students/:studentId/course-plan`

**Description:** Get a specific student's course plan (counselor/admin view).  
**Auth:** Bearer token (role: `school_admin`)  
**Frontend file:** `src/services/coursePlanService.ts` → `getStudentCoursePlan(studentId)`

**Path Params:**
| Param     | Type   | Description |
|-----------|--------|-------------|
| studentId | string | Student ID  |

**Response:** Same structure as 4.1.

---

### 4.3 GET `/api/v1/student/course-plan/recommendations`

**Description:** Get AI-powered course recommendations based on the student's career interests, assessment results, and current course history.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/coursePlanService.ts` → `getMyCourseRecommendations()`

**Response — 200 OK:**
```json
{
  "data": [
    {
      "courseId": "string",
      "courseName": "AP Computer Science A",
      "courseCode": "CS-201",
      "category": "Computer Science",
      "credits": 1.0,
      "reason": "Aligns with your interest in Software Engineering and strong math performance",
      "matchScore": 92,
      "prerequisites": ["CS-101"]
    }
  ]
}
```

---

### 4.4 POST `/api/v1/student/course-plan/courses`

**Description:** Add a course to the student's plan.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/coursePlanService.ts` → `addCourseToPlan(payload)`

**Request Body:**
```json
{
  "courseId": "string",
  "gradeLevel": 11,
  "semester": "Fall 2026"
}
```

**Response — 201 Created:**
```json
{
  "data": { /* updated StudentCoursePlan object */ }
}
```

---

### 4.5 DELETE `/api/v1/student/course-plan/courses/:courseId`

**Description:** Remove a planned course from the student's plan. Only courses with status `planned` can be removed.  
**Auth:** Bearer token (role: `student`)  
**Frontend file:** `src/services/coursePlanService.ts` → `removeCourseFromPlan(courseId)`

**Response — 200 OK:**
```json
{
  "data": { /* updated StudentCoursePlan object */ }
}
```

---

## 5. Authentication & Authorization Notes

### Roles Required
| API Group        | Required Role   | Notes                                               |
|-----------------|-----------------|-----------------------------------------------------|
| Parent Portal   | `parent`        | New role — needs parent user registration flow       |
| Student Portfolio | `student`     | Student must own the portfolio items                 |
| Counselor Notes | `school_admin`  | Notes belong to the authoring counselor              |
| Counselor Onboarding & Dashboard | `counselor` | Token-based onboarding; counselor-scoped dashboard |
| Student Course Plan (student) | `student` | Student views/manages own plan             |
| Student Course Plan (admin)   | `school_admin` | Admin views any student's plan            |

### Token Format
All endpoints expect the standard `Authorization: Bearer <JWT>` header. The `Accept-Language` header should be forwarded for i18n responses.

### Response Envelope
All responses should follow the existing API envelope pattern:
```json
{
  "data": { ... },
  "message": "optional success message"
}
```

Error responses:
```json
{
  "error": "Error description",
  "statusCode": 400
}
```

### Frontend Service Files Ready
The following frontend service files are already implemented and awaiting these endpoints:
- `src/services/parentPortalService.ts` — Parent Portal
- `src/services/portfolioService.ts` — Student Portfolio
- `src/services/counselorNotesService.ts` — Counselor Notes
- `src/services/coursePlanService.ts` — Student Course Plan

### Frontend Hook Files Ready
- `src/hooks/useParentPortalQueries.ts`
- `src/hooks/usePortfolioQueries.ts`
- `src/hooks/useCounselorNotesQueries.ts`
- `src/hooks/useCoursePlanQueries.ts`

---

## Summary Table

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | GET | `/api/v1/parent/profile` | Parent profile + linked children |
| 2 | GET | `/api/v1/parent/children/:childId/progress` | Child progress summary |
| 3 | GET | `/api/v1/parent/evaluations/pending` | Parent's pending 360° evaluations |
| 4 | GET | `/api/v1/student/portfolio` | List portfolio items (paginated, filterable) |
| 5 | GET | `/api/v1/student/portfolio/summary` | Portfolio statistics |
| 6 | POST | `/api/v1/student/portfolio` | Create portfolio item |
| 7 | PUT | `/api/v1/student/portfolio/:id` | Update portfolio item |
| 8 | DELETE | `/api/v1/student/portfolio/:id` | Delete portfolio item |
| 9 | POST | `/api/v1/student/portfolio/:id/attachments` | Upload attachment |
| 10 | GET | `/api/v1/school-admin/students/:studentId/notes` | List counselor notes |
| 11 | POST | `/api/v1/school-admin/students/:studentId/notes` | Create counselor note |
| 12 | PUT | `/api/v1/school-admin/notes/:noteId` | Update counselor note |
| 13 | DELETE | `/api/v1/school-admin/notes/:noteId` | Delete counselor note |
| 14 | PUT | `/api/v1/school-admin/notes/:noteId/complete-followup` | Complete follow-up |
| 15 | GET | `/api/v1/student/course-plan` | Student's own course plan |
| 16 | GET | `/api/v1/school-admin/students/:studentId/course-plan` | Admin view of student plan |
| 17 | GET | `/api/v1/student/course-plan/recommendations` | AI course recommendations |
| 18 | POST | `/api/v1/student/course-plan/courses` | Add course to plan |
| 19 | DELETE | `/api/v1/student/course-plan/courses/:courseId` | Remove course from plan |
| 20 | POST | `/api/v1/school-admin/staff/invite` | Invite staff (extended) — support assignAll/studentIds for counselors |
| 21 | GET | `/api/v1/counselor/onboarding/verify` | Verify counselor invite token |
| 22 | POST | `/api/v1/counselor/onboarding/complete` | Complete counselor onboarding |
| 23 | GET | `/api/v1/counselor/dashboard` | Counselor-scoped dashboard |

**Total new endpoints: 23**
