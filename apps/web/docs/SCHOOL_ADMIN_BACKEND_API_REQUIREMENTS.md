# School Admin Panel - Backend API Requirements

> **For**: Backend Developer  
> **Date**: January 27, 2026  
> **Priority**: High

---

## Overview

The School Admin Panel allows school administrators (invited by super admin) to manage their students, track performance, and view analytics. This document outlines the required backend APIs.

---

## Authentication & Authorization

### Role: `school_admin`

School admins are created when a super admin invites a school. The invited email receives a link to set password and complete registration.

**Authorization**: All endpoints below require `school_admin` role in JWT token.

---

## API Endpoints Required

### 1. School Admin Authentication

#### `POST /api/v1/auth/school-admin/complete-registration`

Complete registration after invitation.

**Request Body**:

```json
{
  "token": "invitation-token-from-email",
  "password": "securePassword123",
  "name": "John Smith"
}
```

**Response**:

```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "admin@school.com",
    "name": "John Smith",
    "role": { "name": "school_admin" },
    "schoolId": "school-uuid"
  }
}
```

---

### 2. Dashboard Stats

#### `GET /api/v1/school-admin/dashboard/stats`

Get dashboard statistics for the school.

**Response**:

```json
{
  "totalStudents": 150,
  "pendingInvites": 12,
  "acceptedStudents": 130,
  "activeStudents": 98,
  "completedAssessments": 245,
  "averageScore": 78.5
}
```

---

### 3. Student Management

#### `GET /api/v1/school-admin/students`

List all students for the school.

**Query Parameters**:

- `page` (number, default: 1)
- `limit` (number, default: 10)
- `search` (string, optional) - search by name or email
- `status` (string, optional) - filter by: `pending`, `accepted`, `active`, `inactive`
- `sortBy` (string, optional) - `name`, `email`, `createdAt`, `lastActive`
- `sortOrder` (string, optional) - `asc`, `desc`

**Response**:

```json
{
  "data": [
    {
      "id": "student-uuid",
      "name": "Jane Doe",
      "email": "jane@student.com",
      "status": "active",
      "joinedAt": "2025-09-01T00:00:00Z",
      "lastActive": "2026-01-25T14:30:00Z",
      "completedAssessments": 5,
      "averageScore": 82.3,
      "progress": 65
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 10,
  "totalPages": 15
}
```

---

#### `POST /api/v1/school-admin/students/invite`

Invite a new student.

**Request Body**:

```json
{
  "email": "student@email.com",
  "name": "Student Name"
}
```

**Response**:

```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "student": {
    "id": "student-uuid",
    "email": "student@email.com",
    "name": "Student Name",
    "status": "pending"
  }
}
```

---

#### `POST /api/v1/school-admin/students/bulk-invite`

Invite multiple students at once.

**Request Body**:

```json
{
  "students": [
    { "email": "student1@email.com", "name": "Student One" },
    { "email": "student2@email.com", "name": "Student Two" }
  ]
}
```

**Response**:

```json
{
  "success": true,
  "invited": 2,
  "failed": 0,
  "results": [
    { "email": "student1@email.com", "status": "invited" },
    { "email": "student2@email.com", "status": "invited" }
  ]
}
```

---

#### `POST /api/v1/school-admin/students/:studentId/resend-invite`

Resend invitation email to a pending student.

**Response**:

```json
{
  "success": true,
  "message": "Invitation resent successfully"
}
```

---

#### `DELETE /api/v1/school-admin/students/:studentId`

Remove a student from the school.

**Response**:

```json
{
  "success": true,
  "message": "Student removed successfully"
}
```

---

### 4. Analytics

#### `GET /api/v1/school-admin/analytics/overview`

Get overall analytics for the school.

**Query Parameters**:

- `period` (string) - `week`, `month`, `quarter`, `year`

**Response**:

```json
{
  "studentEngagement": {
    "active": 98,
    "inactive": 32,
    "trend": 5.2
  },
  "assessmentCompletion": {
    "completed": 245,
    "inProgress": 45,
    "notStarted": 60,
    "completionRate": 70.3
  },
  "averagePerformance": {
    "score": 78.5,
    "trend": 2.1
  },
  "timeSpent": {
    "averageHours": 4.5,
    "totalHours": 675,
    "trend": 8.3
  }
}
```

---

#### `GET /api/v1/school-admin/analytics/performance-trends`

Get performance trends over time.

**Query Parameters**:

- `period` (string) - `week`, `month`, `quarter`, `year`
- `metric` (string) - `score`, `completion`, `time`

**Response**:

```json
{
  "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "datasets": [
    {
      "label": "Average Score",
      "data": [72, 74, 75, 78, 80, 78.5]
    }
  ]
}
```

---

#### `GET /api/v1/school-admin/analytics/top-performers`

Get top performing students.

**Query Parameters**:

- `limit` (number, default: 10)

**Response**:

```json
{
  "data": [
    {
      "id": "student-uuid",
      "name": "Jane Doe",
      "email": "jane@student.com",
      "averageScore": 95.5,
      "completedAssessments": 8,
      "rank": 1
    }
  ]
}
```

---

### 5. Student Results

#### `GET /api/v1/school-admin/results`

Get all student results.

**Query Parameters**:

- `page` (number, default: 1)
- `limit` (number, default: 10)
- `studentId` (string, optional)
- `assessmentType` (string, optional)
- `dateFrom` (string, optional)
- `dateTo` (string, optional)

**Response**:

```json
{
  "data": [
    {
      "id": "result-uuid",
      "student": {
        "id": "student-uuid",
        "name": "Jane Doe",
        "email": "jane@student.com"
      },
      "assessmentName": "Career Assessment",
      "assessmentType": "career",
      "score": 85,
      "completedAt": "2026-01-20T10:30:00Z",
      "duration": 45
    }
  ],
  "total": 245,
  "page": 1,
  "limit": 10,
  "totalPages": 25
}
```

---

#### `GET /api/v1/school-admin/results/:studentId/detail`

Get detailed results for a specific student.

**Response**:

```json
{
  "student": {
    "id": "student-uuid",
    "name": "Jane Doe",
    "email": "jane@student.com",
    "joinedAt": "2025-09-01T00:00:00Z",
    "status": "active"
  },
  "summary": {
    "totalAssessments": 8,
    "averageScore": 82.3,
    "totalTimeSpent": 360,
    "strongAreas": ["Communication", "Problem Solving"],
    "improvementAreas": ["Time Management"]
  },
  "assessments": [
    {
      "id": "assessment-uuid",
      "name": "Career Assessment",
      "type": "career",
      "score": 85,
      "completedAt": "2026-01-20T10:30:00Z",
      "duration": 45,
      "breakdown": {
        "sections": [
          { "name": "Interest", "score": 90 },
          { "name": "Skills", "score": 80 },
          { "name": "Values", "score": 85 }
        ]
      }
    }
  ]
}
```

---

#### `GET /api/v1/school-admin/results/export`

Export results as CSV/PDF.

**Query Parameters**:

- `format` (string) - `csv`, `pdf`
- `studentId` (string, optional)
- `dateFrom` (string, optional)
- `dateTo` (string, optional)

**Response**: File download

---

### 6. School Settings

#### `GET /api/v1/school-admin/settings`

Get school settings and info.

**Response**:

```json
{
  "school": {
    "id": "school-uuid",
    "name": "Springfield High",
    "maxStudents": 200,
    "currentStudents": 150,
    "contractStart": "2025-09-01",
    "contractEnd": "2026-08-31"
  },
  "admin": {
    "id": "admin-uuid",
    "name": "John Smith",
    "email": "admin@school.com"
  }
}
```

---

#### `PUT /api/v1/school-admin/settings/profile`

Update admin profile.

**Request Body**:

```json
{
  "name": "John Smith Updated",
  "phone": "+1234567890"
}
```

---

#### `PUT /api/v1/school-admin/settings/password`

Change password.

**Request Body**:

```json
{
  "currentPassword": "oldPassword",
  "newPassword": "newSecurePassword"
}
```

---

## Error Responses

All endpoints should return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": { "field": "email" }
  }
}
```

**Common Error Codes**:

- `UNAUTHORIZED` - Invalid or expired token
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `STUDENT_LIMIT_REACHED` - School has reached max student limit
- `DUPLICATE_EMAIL` - Student already exists

---

## Notes for Implementation

1. **Rate Limiting**: Apply rate limiting on invitation endpoints
2. **Email Delivery**: Queue invitation emails for reliable delivery
3. **Soft Delete**: Prefer soft delete for students to preserve historical data
4. **Audit Logs**: Log all admin actions for compliance
5. **Webhook**: Consider webhook for invitation status updates (optional)

---

## Questions for Discussion

1. Should students be able to be part of multiple schools?
2. What happens to student data when contract ends?
3. Should there be sub-admin roles within a school?
4. What assessment types are available?

---

_Document created by AI Assistant - Please review and update as needed_
