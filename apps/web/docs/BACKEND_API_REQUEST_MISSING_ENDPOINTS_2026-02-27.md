# Backend API Request — Missing Endpoints
**Date:** 2026-02-27  
**Author:** Frontend Team  
**Status:** Pending Backend Implementation

This document covers **only endpoints that are NOT in any prior request document** and are **not present in the Postman collection** (`JwtMongoApi.postman_collection.json`). All items below are already wired in the frontend and are awaiting backend support.

---

## Table of Contents
1. [Assessment Configuration](#1-assessment-configuration)
2. [Alert System](#2-alert-system)
3. [Course Sequences (Visual Builder)](#3-course-sequences-visual-builder)
4. [Academic Gaps & AI Course Recommendations](#4-academic-gaps--ai-course-recommendations)
5. [School Analytics Dashboard](#5-school-analytics-dashboard)
6. [Import Job Polling](#6-import-job-polling)
7. [Counselor Onboarding (Token-based)](#7-counselor-onboarding-token-based)
8. [Counselor Dashboard Summary](#8-counselor-dashboard-summary)
9. [Parent / Guardian Invitation](#9-parent--guardian-invitation-school-admin--counselor)
10. [Parent Onboarding (Public)](#10-parent-onboarding-public--token-based)
11. [Parent Portal](#11-parent-portal-parent-facing)
12. [Counselor Student Detail](#12-counselor-student-detail)

---

## Shared Conventions

### Authentication
All endpoints (except Counselor Onboarding) require:
```
Authorization: Bearer <jwt_token>
```

### Standard Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional status message"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description"
  }
}
```

---

## 1. Assessment Configuration

Allows school admins to configure assessment settings (window, retake policy, AI weights).

### `GET /api/v1/school-admin/assessments/config`

**Description:** Retrieve the school's current assessment configuration.

**Response:**
```json
{
  "data": {
    "assessmentWindowStart": "2026-03-01",
    "assessmentWindowEnd": "2026-06-30",
    "retakePolicy": "once_per_semester",
    "allowSelfSchedule": true,
    "reminderDaysBefore": 7,
    "aiWeights": {
      "academic": 0.4,
      "social": 0.3,
      "career": 0.3
    }
  }
}
```

---

### `PUT /api/v1/school-admin/assessments/config`

**Description:** Update assessment configuration for the school.

**Request Body:**
```json
{
  "assessmentWindowStart": "2026-03-01",
  "assessmentWindowEnd": "2026-06-30",
  "retakePolicy": "once_per_semester",
  "allowSelfSchedule": true,
  "reminderDaysBefore": 7,
  "aiWeights": {
    "academic": 0.4,
    "social": 0.3,
    "career": 0.3
  }
}
```

**Valid `retakePolicy` values:** `"never"`, `"once_per_semester"`, `"unlimited"`

**Response:** Updated config object (same shape as GET).

---

### `GET /api/v1/school-admin/assessments/status`

**Description:** Return high-level stats about assessment completion across the school.

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

## 2. Alert System

A school-wide alert feed surfaced both in the school-admin portal and counselor portal.

### `GET /api/v1/alerts`

**Description:** Fetch alerts for the authenticated user's school (scoped by role).

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `type` | string | Filter by type: `academic_gap`, `assessment_overdue`, `follow_up`, `low_engagement`, `graduation_risk` |
| `priority` | string | `low`, `medium`, `high`, `critical` |
| `status` | string | `active`, `dismissed`, `read` |
| `page` | number | Default: `1` |
| `limit` | number | Default: `20` |

**Response:**
```json
{
  "data": [
    {
      "id": "alert_123",
      "type": "graduation_risk",
      "priority": "critical",
      "status": "active",
      "title": "Graduation Risk: John Smith",
      "message": "John Smith is missing 4 required credits to graduate on time.",
      "studentId": "student_456",
      "studentName": "John Smith",
      "metadata": {},
      "createdAt": "2026-02-20T10:00:00Z",
      "updatedAt": "2026-02-20T10:00:00Z"
    }
  ],
  "total": 47,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/v1/alerts/summary`

**Description:** Returns count breakdown of active alerts by priority.

**Response:**
```json
{
  "data": {
    "total": 47,
    "critical": 5,
    "high": 12,
    "medium": 18,
    "low": 12,
    "unread": 23
  }
}
```

---

### `PATCH /api/v1/alerts/:alertId`

**Description:** Update a single alert's status.

**Request Body:**
```json
{
  "status": "dismissed"
}
```

**Valid `status` values:** `"read"`, `"dismissed"`

**Response:** Updated alert object.

---

### `POST /api/v1/alerts/bulk-action`

**Description:** Apply an action to multiple alerts at once.

**Request Body:**
```json
{
  "alertIds": ["alert_123", "alert_456"],
  "action": "dismiss"
}
```

**Valid `action` values:** `"dismiss"`, `"mark_read"`

**Response:**
```json
{
  "data": {
    "updatedCount": 2
  }
}
```

---

## 3. Course Sequences (Visual Builder)

Enables school admins to build drag-and-drop prerequisite trees for course sequences.

### `GET /api/v1/school-admin/course-sequences`

**Description:** List all course sequences for the school.

**Query Parameters:** `page`, `limit`, `search`

**Response:**
```json
{
  "data": [
    {
      "id": "seq_001",
      "name": "STEM Honors Track",
      "description": "4-year STEM progression",
      "gradeRange": [9, 12],
      "nodeCount": 12,
      "createdAt": "2026-01-15T00:00:00Z"
    }
  ],
  "total": 5
}
```

---

### `POST /api/v1/school-admin/course-sequences`

**Description:** Create a new course sequence.

**Request Body:**
```json
{
  "name": "STEM Honors Track",
  "description": "4-year STEM progression",
  "gradeRange": [9, 12],
  "nodes": [],
  "edges": []
}
```

**Response:** Created sequence with `id`.

---

### `GET /api/v1/school-admin/course-sequences/:sequenceId`

**Description:** Get full detail of a course sequence including nodes and edges (for the visual builder).

**Response:**
```json
{
  "data": {
    "id": "seq_001",
    "name": "STEM Honors Track",
    "description": "4-year STEM progression",
    "gradeRange": [9, 12],
    "nodes": [
      {
        "id": "node_1",
        "courseId": "course_abc",
        "courseName": "Algebra II",
        "courseCode": "MATH-201",
        "gradeLevel": 10,
        "position": { "x": 100, "y": 200 }
      }
    ],
    "edges": [
      {
        "id": "edge_1",
        "source": "node_1",
        "target": "node_2",
        "label": "prerequisite"
      }
    ]
  }
}
```

---

### `PUT /api/v1/school-admin/course-sequences/:sequenceId`

**Description:** Save updated nodes/edges for a course sequence (called by the builder on Save).

**Request Body:** Same shape as `GET` response `data`.

**Response:** Updated sequence.

---

### `DELETE /api/v1/school-admin/course-sequences/:sequenceId`

**Description:** Delete a course sequence.

**Response:** `204 No Content`

---

## 4. Academic Gaps & AI Course Recommendations

Surfaces credit shortfalls and AI-driven course recommendations per student.

### `GET /api/v1/school-admin/academic-gaps/summary`

**Description:** Aggregated gap statistics across all students in the school.

**Response:**
```json
{
  "data": [
    {
      "area": "Mathematics",
      "studentsAffected": 42,
      "avgCreditShortfall": 1.5,
      "severity": "high"
    },
    {
      "area": "Science",
      "studentsAffected": 18,
      "avgCreditShortfall": 0.5,
      "severity": "medium"
    }
  ]
}
```

---

### `GET /api/v1/students/:studentId/academic-gaps`

**Description:** Retrieve academic gaps for a specific student.

**Response:**
```json
{
  "data": {
    "studentId": "student_456",
    "studentName": "John Smith",
    "gaps": [
      {
        "area": "Mathematics",
        "required": 4,
        "completed": 2.5,
        "shortfall": 1.5,
        "severity": "high",
        "suggestedCourses": ["MATH-301", "MATH-302"]
      }
    ],
    "graduationRisk": true,
    "overallCompletionRate": 68
  }
}
```

---

### `GET /api/v1/students/:studentId/course-recommendations`

**Description:** AI-generated course recommendations to close academic gaps.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `gradeLevel` | number | Filter recommendations for a specific grade |
| `area` | string | Filter by subject area |

**Response:**
```json
{
  "data": [
    {
      "courseId": "course_xyz",
      "courseCode": "MATH-301",
      "courseName": "Pre-Calculus",
      "reason": "Closes 1.5-credit gap in Mathematics; prerequisite satisfied.",
      "confidence": 0.92,
      "gradeLevel": 11,
      "semester": "fall"
    }
  ]
}
```

---

## 5. School Analytics Dashboard

High-level school analytics for the school-admin portal.

### `GET /api/v1/school-admin/analytics/overview`

**Description:** Key performance metrics overview.

**Response:**
```json
{
  "data": {
    "totalStudents": 320,
    "activeStudents": 305,
    "assessmentCompletionRate": 54.06,
    "averageProgressScore": 72.3,
    "studentsAtRisk": 28,
    "counselorCoverage": 92.5
  }
}
```

---

### `GET /api/v1/school-admin/analytics/trends`

**Description:** Time-series data for charting trends.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `metric` | string | `completion_rate`, `engagement`, `assessment_scores` |
| `range` | string | `30d`, `90d`, `1y` |

**Response:**
```json
{
  "data": {
    "metric": "completion_rate",
    "labels": ["Jan", "Feb", "Mar"],
    "values": [42.0, 48.5, 54.1]
  }
}
```

---

### `GET /api/v1/school-admin/analytics/top-performers`

**Description:** Top students by progress score.

**Query Parameters:** `limit` (default: 10), `gradeLevel`

**Response:**
```json
{
  "data": [
    {
      "studentId": "student_001",
      "name": "Alice Johnson",
      "gradeLevel": 11,
      "progressScore": 96.4,
      "assessmentStatus": "completed"
    }
  ]
}
```

---

## 6. Import Job Polling

After uploading a grades or courses CSV, the backend should return a `jobId` and expose status/failure-download endpoints.

### `GET /api/v1/school-admin/grades/import/:jobId`

**Description:** Poll the status of an async grade import job.

**Response:**
```json
{
  "data": {
    "jobId": "job_abc123",
    "status": "processing",
    "totalRows": 450,
    "successCount": 200,
    "failureCount": 3,
    "message": "Processing rows 200–300...",
    "completedAt": null
  }
}
```

**Valid `status` values:** `"pending"`, `"processing"`, `"completed"`, `"failed"`

---

### `GET /api/v1/school-admin/grades/import/:jobId/download-failures`

**Description:** Download a CSV of rows that failed during grade import.

**Response:** `text/csv` file download

**CSV Format:**
```
row_number,student_id,course_code,error_message
3,,,missing student_id or student_email
17,S999,,course_code not found in school catalog
```

---

### `GET /api/v1/school-admin/courses/import/:jobId`

**Description:** Poll the status of an async course CSV import job.

**Response:** Same shape as grade import status above.

---

### `GET /api/v1/school-admin/courses/import/:jobId/download-failures`

**Description:** Download a CSV of rows that failed during course import.

**Response:** `text/csv` file download — same format as grade failures.

---

### Upload Endpoint Change Required

The existing `POST /api/v1/school-admin/grades/import` and `POST /api/v1/school-admin/courses/import` must **return a `jobId`** in their response instead of (or in addition to) inline results:

```json
{
  "data": {
    "jobId": "job_abc123",
    "message": "Import job queued"
  }
}
```

> **Note:** The frontend currently supports both patterns — if `jobId` is present it shows the polling panel; if not it falls back to the legacy inline result message.

---

## 7. Counselor Onboarding (Token-based)

New counselors receive an invite email containing a one-time token. They use `/counselor/onboarding?token=...` to activate their account.

### `GET /api/v1/counselor/onboarding/verify`

**Description:** Verify an invite token and return metadata before the counselor sets their password.

**Authentication:** None (public endpoint)

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `token` | string | Yes |

**Response:**
```json
{
  "data": {
    "email": "counselor@school.edu",
    "invitedBy": "Sarah Lee (School Admin)",
    "schoolName": "Greenwood High School",
    "assignAll": false,
    "assignedStudentCount": 12,
    "expiresAt": "2026-03-05T23:59:59Z"
  }
}
```

**Error (expired/invalid token):** `400` or `404` with `{ "error": { "code": "INVALID_TOKEN", "message": "..." } }`

---

### `POST /api/v1/counselor/onboarding/complete`

**Description:** Complete onboarding — sets password and optional profile fields, activates account, returns JWT.

**Authentication:** None (public endpoint)

**Request Body:**
```json
{
  "token": "one-time-invite-token",
  "password": "SecurePassword123!",
  "profile": {
    "phone": "+1-555-0100",
    "timezone": "America/New_York"
  }
}
```

**Validation:**
- `password`: min 8 characters
- `token`: must match an unexpired invite

**Response:**
```json
{
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": "user_789",
      "name": "James Carter",
      "email": "counselor@school.edu",
      "role": "counselor",
      "schoolId": "school_123"
    }
  }
}
```

---

## 8. Counselor Dashboard Summary

A single aggregated endpoint for the counselor's overview page.

### `GET /api/v1/counselor/dashboard`

**Description:** Returns a summary of the counselor's caseload for the dashboard.

**Response:**
```json
{
  "data": {
    "assignedCount": 28,
    "followUps": 5,
    "overdueFollowUps": 2,
    "recentNotes": [
      {
        "id": "note_001",
        "studentId": "student_456",
        "studentName": "John Smith",
        "type": "academic",
        "content": "Discussed AP course load and stress management strategies.",
        "createdAt": "2026-02-25T14:30:00Z"
      }
    ],
    "pendingFollowUpsList": [
      {
        "id": "note_007",
        "studentId": "student_789",
        "studentName": "Maria Garcia",
        "content": "Check in on college essay progress",
        "followUpDate": "2026-03-01"
      }
    ]
  }
}
```

---

## 9. Parent / Guardian Invitation (School-Admin & Counselor)

Allows school admins and counselors to invite parents, guardians, or siblings to the parent portal on behalf of a student.

### `GET /api/v1/school-admin/students/:studentId/parents`

**Description:** List all parents/guardians linked to a student (any status).

**Auth:** Required (school_admin, counselor)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "link_abc123",
      "name": "Ana Gomez",
      "email": "ana@example.com",
      "relationship": "mother",
      "status": "accepted",
      "invitedAt": "2026-02-20T10:00:00Z",
      "acceptedAt": "2026-02-20T11:30:00Z",
      "parentUserId": "user_789"
    },
    {
      "id": "link_def456",
      "name": "Carlos Gomez",
      "email": "carlos@example.com",
      "relationship": "father",
      "status": "pending",
      "invitedAt": "2026-02-27T09:00:00Z"
    }
  ]
}
```

---

### `POST /api/v1/school-admin/students/:studentId/parents/invite`

**Description:** Send a parent portal invite email to a parent/guardian.

**Auth:** Required (school_admin, counselor)

**Request Body:**
```json
{
  "name": "Ana Gomez",
  "email": "ana@example.com",
  "relationship": "mother",
  "message": "Hi Ana! Please join to track your child's progress."
}
```

**`relationship` values:** `mother` | `father` | `sibling` | `guardian` | `other`

**Response:**
```json
{
  "success": true,
  "data": {
    "inviteId": "link_abc123",
    "message": "Invitation email sent to ana@example.com"
  }
}
```

**Email contains:** personalized link → `https://app.univ365.com/parent/onboarding?token=<jwt_invite_token>`

---

### `DELETE /api/v1/school-admin/students/:studentId/parents/:parentLinkId`

**Description:** Revoke a parent/guardian's access to a student's data.

**Auth:** Required (school_admin, counselor)

**Response:** `204 No Content`

---

### `POST /api/v1/school-admin/students/:studentId/parents/:parentLinkId/resend`

**Description:** Resend a pending invite email (resets token expiry).

**Auth:** Required (school_admin, counselor)

**Response:**
```json
{ "success": true, "message": "Invite resent successfully" }
```

---

## 10. Parent Onboarding (Public — Token-Based)

These endpoints are **public** (no `Authorization` header required). The invite token is a short-lived JWT embedded in the email link.

### `GET /api/v1/parent/onboarding/verify`

**Description:** Verify a parent invite token and return invite context for the onboarding form.

**Auth:** None (public)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Invite JWT from email link |

**Response:**
```json
{
  "success": true,
  "data": {
    "email": "ana@example.com",
    "studentName": "Sofia Gomez",
    "relationship": "mother",
    "schoolName": "Lincoln High School",
    "invitedBy": "Ms. Johnson",
    "inviterRole": "counselor"
  }
}
```

**Error (expired/invalid):**
```json
{
  "success": false,
  "error": {
    "code": "TOKEN_INVALID",
    "message": "This invitation link has expired. Please contact the school for a new one."
  }
}
```

---

### `POST /api/v1/parent/onboarding/complete`

**Description:** Complete parent account creation (or link existing account) using the invite token.

**Auth:** None (public)

**Request Body:**
```json
{
  "token": "<invite_jwt>",
  "name": "Ana Gomez",
  "password": "SecurePass123!",
  "phone": "+1-555-000-1234"
}
```

**Response (new account created, returns JWT to log in immediately):**
```json
{
  "success": true,
  "data": {
    "token": "<session_jwt>",
    "user": {
      "id": "user_789",
      "name": "Ana Gomez",
      "email": "ana@example.com",
      "role": "parent"
    }
  }
}
```

> **Note:** If the email is already registered, the backend should link the existing account to the student instead of creating a new one, and still return a valid session JWT.

---

## 11. Parent Portal (Parent-Facing)

All endpoints below require `Authorization: Bearer <jwt>` with `role: parent`.

### `GET /api/v1/parent/profile`

**Description:** Get the authenticated parent's profile and list of linked children.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_789",
    "name": "Ana Gomez",
    "email": "ana@example.com",
    "phone": "+1-555-000-1234",
    "children": [
      {
        "studentId": "student_001",
        "studentName": "Sofia Gomez",
        "gradeLevel": 10,
        "relationship": "mother"
      }
    ]
  }
}
```

---

### `GET /api/v1/parent/children/:studentId/progress`

**Description:** Get academic progress summary for a linked child.

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "student_001",
    "studentName": "Sofia Gomez",
    "gradeLevel": 10,
    "gpa": 3.4,
    "isOnTrack": true,
    "creditsEarned": 42,
    "creditsRequired": 120,
    "creditPercentage": 35,
    "assessmentStatus": { "completed": 2, "total": 3 },
    "careerPath": "Engineering",
    "recentActivity": [
      { "id": "a1", "date": "2026-02-25", "type": "grade", "description": "Math quiz: 88%" }
    ],
    "pendingActions": [
      {
        "id": "p1",
        "type": "360_evaluation",
        "title": "Complete 360° Evaluation",
        "description": "Your assessment is needed for Sofia's evaluation.",
        "deadline": "2026-03-05",
        "actionUrl": "/evaluation/evaluator?token=<eval_token>"
      }
    ]
  }
}
```

---

### `GET /api/v1/parent/evaluations/pending`

**Description:** List all pending 360° evaluations the parent needs to complete.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "evaluationId": "eval_101",
      "studentName": "Sofia Gomez",
      "deadline": "2026-03-05T23:59:00Z",
      "token": "<eval_access_token>"
    }
  ]
}
```

---

### `GET /api/v1/parent/notifications`

**Description:** List all notifications for the parent.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notif_001",
      "title": "Sofia completed a new assessment",
      "body": "Sofia completed the LIA assessment on Feb 27, 2026.",
      "type": "assessment",
      "isRead": false,
      "createdAt": "2026-02-27T10:00:00Z",
      "actionUrl": "/parent/children/student_001"
    }
  ]
}
```

**`type` values:** `evaluation` | `grade` | `alert` | `meeting` | `system`

---

### `PATCH /api/v1/parent/notifications/:id/read`

**Description:** Mark a single notification as read.

**Response:** `204 No Content`

---

### `PATCH /api/v1/parent/notifications/read-all`

**Description:** Mark all unread notifications as read.

**Response:** `204 No Content`

---

## 12. Counselor Student Detail

### `GET /api/v1/counselor/students/:studentId`

**Description:** Get full profile details for a single student assigned to the authenticated counselor.

**Auth:** Required (counselor)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "student_001",
    "name": "Sofia Gomez",
    "email": "sofia@school.edu",
    "gradeLevel": 10,
    "status": "active",
    "gpa": 3.4,
    "alertCount": 1,
    "careerPath": "Engineering",
    "lastActive": "2026-02-26T15:30:00Z",
    "assessmentStatus": {
      "LIA": "completed",
      "PCA": "in_progress",
      "MIL": "not_started"
    },
    "creditProgress": {
      "earned": 42,
      "required": 120,
      "percentage": 35
    }
  }
}
```

> **Note:** Returns `403 Forbidden` if the student is not assigned to the requesting counselor.

---

*Questions or clarifications? Contact the frontend team before starting implementation.*

