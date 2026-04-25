# Backend API Request — All EPICs (Arquitectos del Futuro)

**Date:** 2026-02-17
**Author:** Frontend / Product (TIMS)
**Platform:** B2B SaaS Multi-Tenant College Counseling
**Backend:** .NET 8.0 (separate repo)
**Priority:** HIGH — required for CDS school onboarding and full platform launch

---

## Purpose

Single source of truth for **all backend API endpoints** required across 6 EPICs (SCRUM-130 → SCRUM-151). This document replaces the previous grade-import-only spec and covers every JIRA task with: current implementation status, what frontend already exists, exact endpoint contracts, data models, security requirements, and open questions.

### Related Documents (already delivered)

| Document | Scope |
|----------|-------|
| `docs/SCHOOL_ADMIN_BACKEND_API_REQUIREMENTS.md` | School admin auth, students, analytics, results, settings |
| `API_REQUIREMENTS_2026-02-06.md` | Student onboarding token verification |
| `BACKEND_API_REQUIREMENTS_SCHOOLS.md` | School invite, school CRUD, coach management |
| `API_UPDATES_REQUIRED.md` | Admin analytics fixes, user management |
| `docs/2026-01-30_CALENDAR_API_REQUIREMENTS.md` | Calendar OAuth integration |
| `DATA_API_REQUIREMENTS.md` | Assessment report PDF data |

### Conventions

- **Base URL:** `NEXT_PUBLIC_API_BASE_URL` (e.g., `https://api.timcare.com`)
- **Auth:** Bearer JWT in `Authorization` header. All endpoints require valid JWT.
- **Tenant isolation:** Every school-scoped endpoint receives `schoolId` either from JWT claims or query param. Backend MUST verify the caller belongs to that school.
- **Pagination:** `{ data: T[], total: number, page: number, limit: number, totalPages: number }`
- **Error format:** `{ success: false, error: { code: string, message: string, details?: object } }`
- **Async jobs:** Return `202 Accepted` with `{ jobId }`. Provide `GET .../jobs/{jobId}` for polling.
- **Language:** All endpoints accept `?language=en|es` for bilingual responses.

---

## Status Summary

| SCRUM | EPIC | Task | Status | Est. |
|-------|------|------|--------|------|
| 130 | 1.1 | School Profile Setup | **PARTIAL** | 4h |
| 131 | 1.2 | Curriculum Framework Configuration | **MISSING** | 8h |
| 132 | 1.4 | Graduation Rules Engine | **MISSING** | 12h |
| 133 | 1.5 | Academic Calendar Setup | **MISSING** | 6h |
| 134 | 1.6 | User Role Management | **PARTIAL** | 8h |
| 135 | 2.1 | Course Catalog Import (CSV) | **PARTIAL** | 8h |
| 136 | 2.2 | AP/IB Course Recognition (AI) | **MISSING** | 12h |
| 137 | 2.3 | Prerequisites Engine | **PARTIAL** | 10h |
| 138 | 2.4 | Course Sequence Builder | **MISSING** | 20h |
| 139 | 2.5 | Gap Analysis Algorithm | **PARTIAL** | 16h |
| 140 | 2.6 | AI Course Recommendations | **PARTIAL** | 16h |
| 141 | 3.1 | CSV Grade Import (iSAMS) | **DONE** | 12h |
| 142 | 3.2 | Data Mapping Engine | **MISSING** | 8h |
| 143 | 4.1 | Assessment Configuration | **PARTIAL** | 8h |
| 145 | 5.1 | Student List View (Counselor) | **PARTIAL** | 8h |
| 146 | 5.2 | Alert System | **MISSING** | 12h |
| 151 | 5.2 | Basic Alert Infrastructure | **MISSING** | 8h |

**Totals:** 1 DONE · 7 PARTIAL · 9 MISSING = **17 tasks requiring backend work**

---

## Cross-Cutting Requirements

### Multi-Tenant Isolation

Every endpoint under `/api/v1/school-admin/*` and `/api/v1/counselor/*` MUST:

1. Extract `schoolId` from the JWT `claims.schoolId` (preferred) or from query param `?schoolId=`.
2. Verify the authenticated user belongs to that school. Return `403 Forbidden` on mismatch.
3. Scope ALL database queries to that `schoolId` — never leak data across tenants.

### RBAC Roles

| Role | Access |
|------|--------|
| `super_admin` | Platform-wide |
| `school_admin` | Own school only |
| `counselor` | Own school + assigned students |
| `student` | Own data only |

### Common Models (reused across EPICs)

```
AuditFields {
  createdAt: DateTime
  updatedAt: DateTime
  createdBy: string (userId)
  updatedBy: string (userId)
}
```

---

# EPIC 1 — School Administration Portal

---

## SCRUM-130: School Profile Setup

**Status:** PARTIAL
**EPIC:** 1.1 · **Estimate:** 4h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/app/school-admin/settings/page.tsx` | Admin profile edit + password change (315 lines) |
| `src/services/schoolAdminService.ts` | `getSchoolSettings`, `updateAdminProfile`, `changePassword` |
| `src/hooks/useSchoolAdmin.ts` | `useSchoolSettings` query hook |
| `src/types/student.ts` | `SchoolSettings` interface |
| `src/app/school-admin/_components/SchoolAdminStats.tsx` | Dashboard stats display |

### What's Missing

- Dedicated school profile edit form (name, logo, address, contact info, timezone)
- Logo upload endpoint
- School profile detail view for school admins (current settings page only shows admin profile)

### Required Endpoints

#### 1. `GET /api/v1/school-admin/school/profile`

Returns full school profile for the authenticated school admin.

**Auth:** `school_admin` role, `schoolId` from JWT.

**Response (200):**

```json
{
  "id": "school-uuid",
  "name": "CDS International School",
  "logo": "https://cdn.timcare.com/logos/school-uuid.png",
  "address": {
    "street": "123 Main St",
    "city": "San José",
    "state": "San José",
    "country": "Costa Rica",
    "postalCode": "10101"
  },
  "phone": "+506 2222-3333",
  "email": "admin@cds.ed.cr",
  "website": "https://cds.ed.cr",
  "timezone": "America/Costa_Rica",
  "maxStudents": 500,
  "currentStudents": 150,
  "contractStart": "2025-09-01",
  "contractEnd": "2026-08-31",
  "status": "active"
}
```

#### 2. `PUT /api/v1/school-admin/school/profile`

Update school profile fields.

**Auth:** `school_admin` role.

**Request Body:**

```json
{
  "name": "CDS International School",
  "address": {
    "street": "123 Main St",
    "city": "San José",
    "state": "San José",
    "country": "Costa Rica",
    "postalCode": "10101"
  },
  "phone": "+506 2222-3333",
  "email": "admin@cds.ed.cr",
  "website": "https://cds.ed.cr",
  "timezone": "America/Costa_Rica"
}
```

**Response (200):** Updated school profile object (same as GET).

#### 3. `POST /api/v1/school-admin/school/logo`

Upload school logo.

**Auth:** `school_admin` role.
**Content-Type:** `multipart/form-data`
**Body:** `file` — image (PNG/JPG/SVG, max 2 MB).

**Response (200):**

```json
{
  "success": true,
  "logoUrl": "https://cdn.timcare.com/logos/school-uuid.png"
}
```

### Data Model

```
SchoolProfile {
  id: string (PK)
  name: string
  logoUrl: string?
  address: JSON { street, city, state, country, postalCode }
  phone: string?
  email: string
  website: string?
  timezone: string (IANA)
  maxStudents: int
  contractStart: Date
  contractEnd: Date
  status: enum (active | suspended | expired)
  ...AuditFields
}
```

### Acceptance Criteria

- School admin can view their school profile via GET.
- School admin can update name, address, contact, timezone via PUT.
- Logo upload accepts PNG/JPG/SVG ≤2 MB and returns a CDN URL.
- `super_admin` can also access/edit any school profile.

---

## SCRUM-131: Curriculum Framework Configuration

**Status:** MISSING
**EPIC:** 1.2 · **Estimate:** 8h

### What Already Exists (Frontend)

Nothing — no curriculum/framework configuration page, services, types, or hooks.

### What's Needed

Schools must configure which curriculum frameworks they follow: **AP** (Advanced Placement), **IB** (International Baccalaureate), **National** (Costa Rica MEP), or **Custom**. Each framework comes with a pre-loaded list of courses. Schools toggle frameworks on/off and customize course lists.

### Required Endpoints

#### 1. `GET /api/v1/school-admin/curriculum/frameworks`

Returns all available frameworks with the school's enabled/disabled status.

**Auth:** `school_admin` role.

**Response (200):**

```json
{
  "data": [
    {
      "id": "fw-ap",
      "type": "AP",
      "label": "Advanced Placement",
      "enabled": true,
      "courseCount": 38,
      "configuredAt": "2026-01-15T10:00:00Z"
    },
    {
      "id": "fw-ib",
      "type": "IB",
      "label": "International Baccalaureate",
      "enabled": false,
      "courseCount": 0,
      "configuredAt": null
    },
    {
      "id": "fw-national",
      "type": "NATIONAL",
      "label": "Costa Rica MEP",
      "enabled": true,
      "courseCount": 24,
      "configuredAt": "2026-01-15T10:00:00Z"
    },
    {
      "id": "fw-custom",
      "type": "CUSTOM",
      "label": "Custom / School-Specific",
      "enabled": false,
      "courseCount": 0,
      "configuredAt": null
    }
  ]
}
```

#### 2. `PUT /api/v1/school-admin/curriculum/frameworks`

Toggle frameworks on/off for the school.

**Request Body:**

```json
{
  "frameworks": [
    { "type": "AP", "enabled": true },
    { "type": "IB", "enabled": false },
    { "type": "NATIONAL", "enabled": true },
    { "type": "CUSTOM", "enabled": false }
  ]
}
```

**Response (200):** Updated frameworks list (same as GET).

#### 3. `GET /api/v1/school-admin/curriculum/frameworks/{type}/courses`

Returns the pre-loaded course list for a framework type, overlaid with school-specific customizations.

**Query params:** `?page=1&limit=50&search=`

**Response (200):**

```json
{
  "data": [
    {
      "id": "course-uuid",
      "code": "AP-BIO",
      "name": "AP Biology",
      "frameworkType": "AP",
      "department": "Sciences",
      "credits": 1.0,
      "gradeLevel": [11, 12],
      "description": "...",
      "isCustomized": false
    }
  ],
  "total": 38,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```

#### 4. `PUT /api/v1/school-admin/curriculum/frameworks/{type}/courses/{courseId}`

Customize a framework course for the school (override credits, name, grade levels, etc.).

**Request Body:**

```json
{
  "credits": 1.5,
  "gradeLevel": [10, 11, 12],
  "localName": "Biología AP"
}
```

**Response (200):** Updated course object.

### Data Model

```
CurriculumFramework {
  id: string (PK)
  schoolId: string (FK → School)
  type: enum (AP | IB | NATIONAL | CUSTOM)
  enabled: boolean
  configuredAt: DateTime?
  ...AuditFields
}

FrameworkCourse {
  id: string (PK)
  frameworkType: enum (AP | IB | NATIONAL | CUSTOM)
  code: string
  name: string
  department: string
  credits: decimal
  gradeLevel: int[]
  description: string?
  isGlobal: boolean  -- true = seeded by platform, false = school-added
}

SchoolFrameworkCourseOverride {
  id: string (PK)
  schoolId: string (FK)
  frameworkCourseId: string (FK)
  credits: decimal?  -- null = use default
  gradeLevel: int[]? -- null = use default
  localName: string? -- null = use default name
  isActive: boolean  -- school can disable specific courses
}
```

### Questions for Backend

1. Should framework course lists (AP, IB) be seeded from a static dataset at deployment, or maintained per-school from scratch?
2. Who can add courses to the CUSTOM framework? School admin only, or counselors too?
3. Should framework courses be versioned (e.g., AP 2025-2026 list vs 2026-2027)?

### Acceptance Criteria

- School admin can view all 4 framework types with enabled status.
- School admin can toggle frameworks on/off.
- Enabling a framework pre-populates it with the standard course list.
- School admin can customize individual course properties (credits, grade levels).
- Course lists are tenant-scoped; changes in one school don't affect others.

---

## SCRUM-132: Graduation Rules Engine

**Status:** MISSING
**EPIC:** 1.4 · **Estimate:** 12h

### What Already Exists (Frontend)

Nothing — no graduation rules, credit tracking, or category requirements code found.

### What's Needed

Schools define graduation requirements: total credits, per-category credit minimums, required courses, and special requirements (e.g., CDS: 24 credits total, 40h community service, senior project, 4 assessment pillars). The system must compute each student's progress against these rules.

### Required Endpoints

#### 1. `GET /api/v1/school-admin/graduation/rules`

Returns the school's graduation rules configuration.

**Auth:** `school_admin` role.

**Response (200):**

```json
{
  "schoolId": "school-uuid",
  "academicYearId": "ay-2025-2026",
  "totalCreditsRequired": 24,
  "categoryRequirements": [
    {
      "id": "cat-1",
      "category": "Mathematics",
      "minCredits": 4,
      "requiredCourses": ["MATH-101", "MATH-201"],
      "electivesAllowed": true
    },
    {
      "id": "cat-2",
      "category": "Sciences",
      "minCredits": 3,
      "requiredCourses": [],
      "electivesAllowed": true
    },
    {
      "id": "cat-3",
      "category": "English / Language Arts",
      "minCredits": 4,
      "requiredCourses": ["ENG-101", "ENG-102", "ENG-201", "ENG-202"],
      "electivesAllowed": false
    },
    {
      "id": "cat-4",
      "category": "Social Studies",
      "minCredits": 3,
      "requiredCourses": [],
      "electivesAllowed": true
    },
    {
      "id": "cat-5",
      "category": "World Languages",
      "minCredits": 2,
      "requiredCourses": [],
      "electivesAllowed": true
    },
    {
      "id": "cat-6",
      "category": "Electives",
      "minCredits": 4,
      "requiredCourses": [],
      "electivesAllowed": true
    }
  ],
  "specialRequirements": [
    {
      "id": "sr-1",
      "name": "Community Service",
      "type": "hours",
      "value": 40,
      "unit": "hours",
      "description": "40 hours of documented community service"
    },
    {
      "id": "sr-2",
      "name": "Senior Project",
      "type": "completion",
      "value": 1,
      "unit": "project",
      "description": "Complete and defend a senior capstone project"
    },
    {
      "id": "sr-3",
      "name": "Assessment Pillars",
      "type": "assessment",
      "value": 4,
      "unit": "pillars",
      "description": "Complete all 4 assessment pillars (MIL, PCA, 360°, TIMS)"
    }
  ]
}
```

#### 2. `POST /api/v1/school-admin/graduation/rules`

Create graduation rules for a new academic year.

**Request Body:** Same structure as GET response (without `id` fields).

**Response (201):** Created rules object with generated IDs.

#### 3. `PUT /api/v1/school-admin/graduation/rules/{ruleSetId}`

Update existing graduation rules.

**Request Body:** Partial update of the rules object.

**Response (200):** Updated rules object.

#### 4. `GET /api/v1/school-admin/graduation/progress/{studentId}`

Compute a student's graduation progress against the active rules.

**Auth:** `school_admin` or `counselor` role.

**Response (200):**

```json
{
  "studentId": "student-uuid",
  "studentName": "Maria Paula Mendoza",
  "ruleSetId": "rules-uuid",
  "totalCreditsEarned": 18,
  "totalCreditsRequired": 24,
  "overallProgress": 75,
  "onTrack": true,
  "expectedGraduation": "2027-06",
  "categoryProgress": [
    {
      "category": "Mathematics",
      "creditsEarned": 3,
      "creditsRequired": 4,
      "progress": 75,
      "completedCourses": ["MATH-101"],
      "remainingRequired": ["MATH-201"],
      "status": "in_progress"
    }
  ],
  "specialRequirementProgress": [
    {
      "name": "Community Service",
      "completed": 25,
      "required": 40,
      "progress": 62.5,
      "status": "in_progress"
    },
    {
      "name": "Assessment Pillars",
      "completed": 2,
      "required": 4,
      "progress": 50,
      "completedItems": ["MIL", "PCA"],
      "remainingItems": ["360°", "TIMS"],
      "status": "in_progress"
    }
  ]
}
```

#### 5. `GET /api/v1/school-admin/graduation/progress`

Batch: graduation progress for all students. Used by school admin dashboard.

**Query params:** `?page=1&limit=20&status=on_track|at_risk|off_track&sortBy=progress`

**Response (200):** Paginated list of student progress summaries (same structure as single student, without `completedCourses` detail).

### Data Model

```
GraduationRuleSet {
  id: string (PK)
  schoolId: string (FK)
  academicYearId: string (FK)
  totalCreditsRequired: decimal
  isActive: boolean
  ...AuditFields
}

CategoryRequirement {
  id: string (PK)
  ruleSetId: string (FK)
  category: string
  minCredits: decimal
  requiredCourses: string[] (course codes)
  electivesAllowed: boolean
  sortOrder: int
}

SpecialRequirement {
  id: string (PK)
  ruleSetId: string (FK)
  name: string
  type: enum (hours | completion | assessment | custom)
  value: decimal
  unit: string
  description: string
}
```

### Questions for Backend

1. Should graduation rules be versioned per academic year? (Recommended: yes.)
2. Should the progress endpoint compute in real-time or use a nightly-cached snapshot?
3. How are community service hours tracked — manual entry by counselor, or imported from external system?
4. Should there be a clone endpoint to copy rules from one academic year to the next?

### Acceptance Criteria

- School admin can define credit requirements per category.
- School admin can define special requirements (community service, senior project, pillars).
- Progress endpoint accurately computes each student's standing against the rules.
- Batch progress endpoint supports filtering by on_track / at_risk / off_track.

---

## SCRUM-133: Academic Calendar Setup

**Status:** MISSING
**EPIC:** 1.5 · **Estimate:** 6h

### What Already Exists (Frontend)

Nothing — only a `semester` field in CSV grade import columns. No calendar configuration page.

### What's Needed

Schools configure academic years, terms/semesters, assessment periods, and holidays. These drive scheduling for assessments, grade import validation, and timeline features.

### Required Endpoints

#### 1. `GET /api/v1/school-admin/calendar/academic-years`

List all academic years for the school.

**Response (200):**

```json
{
  "data": [
    {
      "id": "ay-2025-2026",
      "name": "2025-2026",
      "startDate": "2025-08-12",
      "endDate": "2026-06-15",
      "isCurrent": true,
      "terms": [
        {
          "id": "term-1",
          "name": "Semester 1",
          "startDate": "2025-08-12",
          "endDate": "2025-12-20"
        },
        {
          "id": "term-2",
          "name": "Semester 2",
          "startDate": "2026-01-13",
          "endDate": "2026-06-15"
        }
      ]
    }
  ]
}
```

#### 2. `POST /api/v1/school-admin/calendar/academic-years`

Create a new academic year with terms.

**Request Body:**

```json
{
  "name": "2026-2027",
  "startDate": "2026-08-10",
  "endDate": "2027-06-13",
  "terms": [
    { "name": "Semester 1", "startDate": "2026-08-10", "endDate": "2026-12-18" },
    { "name": "Semester 2", "startDate": "2027-01-11", "endDate": "2027-06-13" }
  ]
}
```

**Response (201):** Created academic year with generated IDs.

#### 3. `PUT /api/v1/school-admin/calendar/academic-years/{id}`

Update an academic year and/or its terms.

#### 4. `DELETE /api/v1/school-admin/calendar/academic-years/{id}`

Delete an academic year (only if no data references it).

#### 5. `GET /api/v1/school-admin/calendar/assessment-periods`

List assessment periods (exam windows) for the current academic year.

**Response (200):**

```json
{
  "data": [
    {
      "id": "ap-1",
      "name": "Mid-Semester 1 Exams",
      "termId": "term-1",
      "startDate": "2025-10-14",
      "endDate": "2025-10-25",
      "assessmentTypes": ["MIL", "PCA"]
    },
    {
      "id": "ap-2",
      "name": "Final Semester 1",
      "termId": "term-1",
      "startDate": "2025-12-09",
      "endDate": "2025-12-20",
      "assessmentTypes": ["360", "TIMS"]
    }
  ]
}
```

#### 6. `POST /api/v1/school-admin/calendar/assessment-periods`

Create an assessment period.

**Request Body:**

```json
{
  "name": "Mid-Semester 1 Exams",
  "termId": "term-1",
  "startDate": "2025-10-14",
  "endDate": "2025-10-25",
  "assessmentTypes": ["MIL", "PCA"]
}
```

#### 7. `PUT /api/v1/school-admin/calendar/assessment-periods/{id}`

Update an assessment period.

#### 8. `DELETE /api/v1/school-admin/calendar/assessment-periods/{id}`

Delete an assessment period.

#### 9. `GET /api/v1/school-admin/calendar/holidays`

List holidays/non-school days for the current academic year.

**Response (200):**

```json
{
  "data": [
    {
      "id": "hol-1",
      "name": "Día de la Independencia",
      "date": "2025-09-15",
      "type": "national"
    }
  ]
}
```

#### 10. `POST /api/v1/school-admin/calendar/holidays`

Add holiday(s). **Request:** `{ holidays: [{ name, date, type }] }` (bulk).

#### 11. `DELETE /api/v1/school-admin/calendar/holidays/{id}`

Remove a holiday.

### Data Model

```
AcademicYear {
  id: string (PK)
  schoolId: string (FK)
  name: string
  startDate: Date
  endDate: Date
  isCurrent: boolean
  ...AuditFields
}

AcademicTerm {
  id: string (PK)
  academicYearId: string (FK)
  name: string
  startDate: Date
  endDate: Date
  sortOrder: int
}

AssessmentPeriod {
  id: string (PK)
  schoolId: string (FK)
  termId: string (FK)
  name: string
  startDate: Date
  endDate: Date
  assessmentTypes: string[] (enum: MIL | PCA | 360 | TIMS)
}

Holiday {
  id: string (PK)
  schoolId: string (FK)
  academicYearId: string (FK)
  name: string
  date: Date
  type: enum (national | school | custom)
}
```

### Questions for Backend

1. Should creating an academic year auto-generate default terms (2 semesters)?
2. Should assessment period deadlines trigger automated alerts when approaching?
3. Should holidays be seeded per-country (Costa Rica national holidays)?

### Acceptance Criteria

- School admin can CRUD academic years with terms.
- School admin can CRUD assessment periods tied to terms.
- School admin can manage holidays.
- Only one academic year can be marked `isCurrent`.
- Validation: term dates must fall within academic year range.
- Validation: assessment period dates must fall within term range.

---

## SCRUM-134: User Role Management

**Status:** PARTIAL
**EPIC:** 1.6 · **Estimate:** 8h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/services/roleService.ts` | `getAllRoles`, `getActiveRoles`, `getRoleById`, `getRoleByName` (read-only, 141 lines) |
| `src/components/school-admin/StudentInviteForm.tsx` | Single + bulk (CSV) student invitation |
| `src/hooks/useSchoolAdmin.ts` | `useInviteStudent`, `useBulkInviteStudents`, `useResendStudentInvite`, `useRemoveStudent` |
| `src/services/schoolAdminService.ts` | All student management API calls |

### What's Missing

- Staff/counselor invitation (only students can be invited now)
- Role assignment UI and endpoint
- Counselor-to-student assignment
- school-level user listing with role filter

### Required Endpoints

#### 1. `GET /api/v1/school-admin/users`

List all users (students, counselors, staff) belonging to the school.

**Query params:** `?role=student|counselor|staff&status=active|pending|inactive&search=&page=1&limit=20`

**Response (200):**

```json
{
  "data": [
    {
      "id": "user-uuid",
      "name": "John Smith",
      "email": "john@school.edu",
      "role": "counselor",
      "status": "active",
      "assignedStudentCount": 25,
      "joinedAt": "2025-09-01T00:00:00Z",
      "lastActive": "2026-02-15T14:30:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### 2. `POST /api/v1/school-admin/staff/invite`

Invite a counselor or staff member.

**Request Body:**

```json
{
  "email": "counselor@school.edu",
  "name": "Jane Doe",
  "role": "counselor"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "user": {
    "id": "user-uuid",
    "email": "counselor@school.edu",
    "name": "Jane Doe",
    "role": "counselor",
    "status": "pending"
  }
}
```

#### 3. `POST /api/v1/school-admin/staff/bulk-invite`

Bulk invite counselors/staff via CSV or JSON array.

**Request Body:**

```json
{
  "users": [
    { "email": "counselor1@school.edu", "name": "Jane", "role": "counselor" },
    { "email": "staff1@school.edu", "name": "Bob", "role": "staff" }
  ]
}
```

**Response (200):**

```json
{
  "success": true,
  "invited": 2,
  "failed": 0,
  "results": [
    { "email": "counselor1@school.edu", "status": "invited" },
    { "email": "staff1@school.edu", "status": "invited" }
  ]
}
```

#### 4. `PUT /api/v1/school-admin/users/{userId}/role`

Change a user's role within the school.

**Request Body:**

```json
{
  "role": "counselor"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Role updated successfully",
  "user": { "id": "user-uuid", "role": "counselor" }
}
```

#### 5. `POST /api/v1/school-admin/counselors/{counselorId}/assign-students`

Assign students to a counselor.

**Request Body:**

```json
{
  "studentIds": ["student-1", "student-2", "student-3"]
}
```

**Response (200):**

```json
{
  "success": true,
  "assigned": 3,
  "counselorId": "counselor-uuid",
  "totalAssigned": 28
}
```

#### 6. `DELETE /api/v1/school-admin/counselors/{counselorId}/assign-students`

Remove student assignments from a counselor.

**Request Body:**

```json
{
  "studentIds": ["student-1"]
}
```

#### 7. `GET /api/v1/school-admin/counselors/{counselorId}/students`

List students assigned to a specific counselor.

**Query params:** `?page=1&limit=20&search=`

**Response (200):** Standard paginated student list.

### Data Model

```
SchoolUser {
  id: string (PK)
  schoolId: string (FK)
  userId: string (FK → User)
  role: enum (school_admin | counselor | staff | student)
  status: enum (active | pending | inactive)
  invitedAt: DateTime
  joinedAt: DateTime?
  ...AuditFields
}

CounselorStudentAssignment {
  id: string (PK)
  counselorId: string (FK → SchoolUser)
  studentId: string (FK → SchoolUser)
  assignedAt: DateTime
  assignedBy: string (FK → User)
}
```

### Questions for Backend

1. Can a student be assigned to multiple counselors simultaneously?
2. Should role changes trigger email notifications?
3. What happens to counselor-student assignments when a counselor is deactivated?
4. Should there be a maximum student-to-counselor ratio?

### Acceptance Criteria

- School admin can invite counselors and staff (single + bulk).
- School admin can change user roles within their school.
- School admin can assign students to counselors.
- User list supports filtering by role and status.
- Student invite flow (existing) continues to work unchanged.

---

# EPIC 2 — Curriculum & Course Trajectory

---

## SCRUM-135: Course Catalog Import (CSV)

**Status:** PARTIAL
**EPIC:** 2.1 · **Estimate:** 8h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/services/courseService.ts` | `adminStartImport(url)`, `adminGetImportStatus(jobId)`, `adminAcceptImport(jobId)` — URL-based import only |
| `src/app/api/admin/courses/import/route.ts` | Local mock: URL import job (Coursera/edX) |
| `src/lib/importJobs.ts` | Import job status tracking (in-memory) |

### What's Missing

- CSV file upload for courses (only URL import exists)
- School-admin-level course import (current import is platform-admin only)
- Course CSV validation and preview

### Required Endpoints

#### 1. `POST /api/v1/school-admin/courses/import`

Upload a CSV file of courses to import into the school's catalog.

**Auth:** `school_admin` role.
**Content-Type:** `multipart/form-data`
**Body:** `file` — CSV file (UTF-8, max 5 MB).

**CSV Schema (required columns):**

| Column | Description | Required |
|--------|-------------|----------|
| `course_code` | Unique course code (e.g., MATH-301) | Yes |
| `name` | Course name | Yes |
| `department` | Department/category (e.g., Mathematics) | Yes |
| `credits` | Credit value (decimal) | Yes |
| `grade_levels` | Applicable grades, comma-separated (e.g., "9,10,11") | Yes |
| `description` | Course description | No |
| `prerequisites` | Prerequisite course codes, comma-separated | No |
| `framework_type` | AP / IB / NATIONAL / CUSTOM | No |

**Response (202 Accepted):**

```json
{
  "success": true,
  "jobId": "import-job-uuid",
  "totalRows": 85,
  "validRows": 82,
  "invalidRows": 3,
  "validationErrors": [
    { "row": 12, "message": "Missing required field: credits" },
    { "row": 45, "message": "Invalid grade_levels format" },
    { "row": 67, "message": "Duplicate course_code: MATH-301" }
  ]
}
```

#### 2. `GET /api/v1/school-admin/courses/import/{jobId}`

Poll import job status. Same pattern as grade import job status.

#### 3. `GET /api/v1/school-admin/courses/import/{jobId}/download-failures`

Download CSV of failed rows with error messages.

#### 4. `GET /api/v1/school-admin/courses`

List the school's course catalog.

**Query params:** `?page=1&limit=20&search=&department=&frameworkType=&gradeLevel=`

**Response (200):**

```json
{
  "data": [
    {
      "id": "course-uuid",
      "code": "MATH-301",
      "name": "Calculus I",
      "department": "Mathematics",
      "credits": 1.0,
      "gradeLevels": [11, 12],
      "prerequisites": ["MATH-201"],
      "frameworkType": "AP",
      "description": "...",
      "enrollmentCount": 28,
      "status": "active"
    }
  ],
  "total": 85,
  "page": 1,
  "limit": 20,
  "totalPages": 5
}
```

#### 5. `POST /api/v1/school-admin/courses`

Add a single course manually.

#### 6. `PUT /api/v1/school-admin/courses/{courseId}`

Update a course.

#### 7. `DELETE /api/v1/school-admin/courses/{courseId}`

Soft-delete a course (if not actively enrolled).

### Data Model

```
SchoolCourse {
  id: string (PK)
  schoolId: string (FK)
  code: string (unique per school)
  name: string
  department: string
  credits: decimal
  gradeLevels: int[]
  prerequisites: string[] (course codes)
  corequisites: string[] (course codes)
  frameworkType: enum? (AP | IB | NATIONAL | CUSTOM)
  frameworkCourseId: string? (FK → FrameworkCourse, if linked)
  description: string?
  status: enum (active | inactive | archived)
  ...AuditFields
}
```

### Acceptance Criteria

- School admin can upload a CSV of courses and receive validation summary.
- Valid courses are imported into the school's catalog; invalid rows are downloadable.
- School admin can list, search, filter, add, edit, and soft-delete courses.
- Course codes are unique per school.
- Reuses the async job pattern from grade import (202 → poll → download failures).

---

## SCRUM-136: AP/IB Course Recognition (AI)

**Status:** MISSING
**EPIC:** 2.2 · **Estimate:** 12h

### What Already Exists (Frontend)

Nothing — no AI course recognition code.

### What's Needed

AI analyzes a school's course catalog and suggests AP/IB equivalents. For each course it returns a suggested equivalent, confidence score, and reasoning. Counselors review and approve/reject suggestions.

### Required Endpoints

#### 1. `POST /api/v1/school-admin/courses/ai-recognize`

Submit courses for AI recognition.

**Request Body:**

```json
{
  "courseIds": ["course-1", "course-2", "course-3"]
}
```

**OR** submit all un-mapped courses:

```json
{
  "scope": "unmapped"
}
```

**Response (200):**

```json
{
  "results": [
    {
      "courseId": "course-1",
      "courseName": "Biología Avanzada",
      "courseCode": "BIO-301",
      "suggestions": [
        {
          "equivalentCode": "AP-BIO",
          "equivalentName": "AP Biology",
          "frameworkType": "AP",
          "confidenceScore": 0.92,
          "reasoning": "Course description matches AP Biology curriculum: lab-based, covers molecular biology, genetics, evolution, ecology.",
          "matchedTopics": ["molecular biology", "genetics", "evolution"]
        },
        {
          "equivalentCode": "IB-BIO-HL",
          "equivalentName": "IB Biology HL",
          "frameworkType": "IB",
          "confidenceScore": 0.78,
          "reasoning": "Content overlap with IB Biology Higher Level, though lab component structure differs."
        }
      ]
    },
    {
      "courseId": "course-2",
      "courseName": "Arte y Diseño",
      "courseCode": "ART-101",
      "suggestions": []
    }
  ]
}
```

#### 2. `POST /api/v1/school-admin/courses/{courseId}/ai-mapping`

Approve or reject an AI suggestion, creating a formal course mapping.

**Request Body:**

```json
{
  "equivalentCode": "AP-BIO",
  "frameworkType": "AP",
  "action": "approve",
  "counselorNotes": "Confirmed by Science department head"
}
```

**Response (200):**

```json
{
  "success": true,
  "mapping": {
    "courseId": "course-1",
    "equivalentCode": "AP-BIO",
    "frameworkType": "AP",
    "status": "approved",
    "approvedBy": "counselor-uuid",
    "approvedAt": "2026-02-17T10:00:00Z"
  }
}
```

### Questions for Backend (AI Architecture — CRITICAL)

> **This question applies to ALL AI tasks (SCRUM-136, 140, 142). Please clarify once:**

1. **Where does AI processing happen?** Does the backend call OpenAI/LLM directly (server-side), or should the frontend call the LLM and POST results back to the backend for storage?
2. **Which model/provider?** OpenAI GPT-4, Azure OpenAI, or other?
3. **What data feeds into the AI prompt?** Course name + description + department? Or does the backend have access to the full AP/IB curriculum database for context?
4. **Rate limiting / cost controls?** Should there be a daily/monthly AI call budget per school?
5. **Confidence threshold for auto-approval?** Above what score should mappings be auto-approved vs requiring counselor review?

### Acceptance Criteria

- School admin or counselor can trigger AI recognition for selected or all unmapped courses.
- AI returns suggestions with confidence scores and reasoning.
- Counselor can approve/reject each suggestion.
- Approved mappings are persisted and reflected in the course catalog.

---

## SCRUM-137: Prerequisites Engine

**Status:** PARTIAL
**EPIC:** 2.3 · **Estimate:** 10h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/types/course.ts` | `prerequisites: string[]` on `Course` interface |
| `src/components/dashboard/courses/CourseDetailsModal.tsx` | Displays prerequisites (read-only) |

### What's Missing

- Prerequisite creation/editing endpoints
- Corequisite support
- OR-prerequisite groups (e.g., "MATH-201 OR MATH-202")
- Prerequisite validation during enrollment

### Required Endpoints

#### 1. `PUT /api/v1/school-admin/courses/{courseId}/prerequisites`

Set prerequisites and corequisites for a course.

**Request Body:**

```json
{
  "prerequisiteRules": [
    {
      "type": "AND",
      "courseIds": ["MATH-101"]
    },
    {
      "type": "OR",
      "courseIds": ["MATH-201", "MATH-202"]
    }
  ],
  "corequisites": ["MATH-LAB-301"]
}
```

**Response (200):** Updated course prerequisites.

#### 2. `GET /api/v1/courses/{courseId}/prerequisite-check`

Check if a student meets the prerequisites for a course.

**Query params:** `?studentId=student-uuid`

**Auth:** `counselor`, `school_admin`, or the `student` themselves.

**Response (200):**

```json
{
  "courseId": "course-uuid",
  "studentId": "student-uuid",
  "eligible": false,
  "requirements": [
    {
      "type": "AND",
      "courses": [
        { "code": "MATH-101", "name": "Algebra I", "completed": true }
      ],
      "satisfied": true
    },
    {
      "type": "OR",
      "courses": [
        { "code": "MATH-201", "name": "Pre-Calculus", "completed": false },
        { "code": "MATH-202", "name": "Discrete Math", "completed": false }
      ],
      "satisfied": false
    }
  ],
  "corequisites": [
    { "code": "MATH-LAB-301", "name": "Calculus Lab", "enrolled": false }
  ]
}
```

#### 3. `GET /api/v1/school-admin/courses/{courseId}/prerequisite-chain`

Returns the full prerequisite tree/chain for visualization.

**Response (200):**

```json
{
  "courseId": "course-uuid",
  "courseName": "Calculus II",
  "chain": [
    {
      "level": 0,
      "courses": [{ "code": "MATH-401", "name": "Calculus II" }]
    },
    {
      "level": 1,
      "courses": [{ "code": "MATH-301", "name": "Calculus I" }]
    },
    {
      "level": 2,
      "courses": [
        { "code": "MATH-201", "name": "Pre-Calculus", "type": "OR" },
        { "code": "MATH-202", "name": "Discrete Math", "type": "OR" }
      ]
    },
    {
      "level": 3,
      "courses": [{ "code": "MATH-101", "name": "Algebra I" }]
    }
  ]
}
```

### Data Model

```
CoursePrerequisiteRule {
  id: string (PK)
  courseId: string (FK → SchoolCourse)
  type: enum (AND | OR)
  prerequisiteCourseIds: string[]
  sortOrder: int
}

CourseCorequisite {
  id: string (PK)
  courseId: string (FK → SchoolCourse)
  corequisiteCourseId: string (FK → SchoolCourse)
}
```

### Questions for Backend

1. Should prerequisite validation be enforced at enrollment time (hard block) or advisory (warning)?
2. How deep should the prerequisite chain go for cycle detection?
3. Should prerequisites reference course codes (portable) or course IDs (strict)?

### Acceptance Criteria

- School admin/counselor can set AND/OR prerequisite rules per course.
- School admin/counselor can set corequisites.
- Students can check prerequisite eligibility before enrollment.
- Prerequisite chain endpoint returns full dependency tree.
- Backend detects and rejects circular prerequisite chains.

---

## SCRUM-138: Course Sequence Builder

**Status:** MISSING
**EPIC:** 2.4 · **Estimate:** 20h

### What Already Exists (Frontend)

Nothing — no ReactFlow, course trajectory visualization, or drag-and-drop course planner.

### What's Needed

A flowchart-style course sequence builder using ReactFlow. Counselors create 4-column grids (Grade 9 → 12) with courses as nodes. Counselors edit; students view their assigned sequence. Sequences are persisted server-side.

### Required Endpoints

#### 1. `GET /api/v1/school-admin/course-sequences`

List course sequence templates for the school.

**Query params:** `?page=1&limit=10&search=`

**Response (200):**

```json
{
  "data": [
    {
      "id": "seq-uuid",
      "name": "STEM Track - Pre-Engineering",
      "description": "Recommended course sequence for students interested in engineering",
      "createdBy": "counselor-uuid",
      "createdByName": "Jane Doe",
      "studentCount": 15,
      "lastModified": "2026-02-10T14:30:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

#### 2. `GET /api/v1/school-admin/course-sequences/{id}`

Get full sequence detail (nodes + edges for ReactFlow).

**Response (200):**

```json
{
  "id": "seq-uuid",
  "name": "STEM Track - Pre-Engineering",
  "description": "...",
  "nodes": [
    {
      "id": "node-1",
      "type": "courseNode",
      "data": {
        "courseId": "course-uuid",
        "courseCode": "MATH-101",
        "courseName": "Algebra I",
        "credits": 1.0,
        "gradeLevel": 9,
        "semester": "Fall",
        "status": "required"
      },
      "position": { "x": 100, "y": 50 }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "type": "prerequisite",
      "animated": true
    }
  ],
  "columns": [
    { "gradeLevel": 9, "label": "Grade 9" },
    { "gradeLevel": 10, "label": "Grade 10" },
    { "gradeLevel": 11, "label": "Grade 11" },
    { "gradeLevel": 12, "label": "Grade 12" }
  ]
}
```

#### 3. `POST /api/v1/school-admin/course-sequences`

Create a new course sequence.

**Request Body:** Same structure as GET response (without `id`).

**Response (201):** Created sequence.

#### 4. `PUT /api/v1/school-admin/course-sequences/{id}`

Update sequence (nodes, edges, metadata).

#### 5. `DELETE /api/v1/school-admin/course-sequences/{id}`

Delete a sequence template.

#### 6. `POST /api/v1/school-admin/course-sequences/{id}/assign`

Assign a sequence to students.

**Request Body:**

```json
{
  "studentIds": ["student-1", "student-2", "student-3"]
}
```

**Response (200):**

```json
{
  "success": true,
  "assigned": 3,
  "sequenceId": "seq-uuid"
}
```

#### 7. `GET /api/v1/students/{studentId}/course-sequence`

Get the student's assigned course sequence (student view).

**Auth:** `student` (own data) or `counselor`/`school_admin`.

**Response (200):** Same structure as GET sequence detail, plus completion status per node.

### Data Model

```
CourseSequence {
  id: string (PK)
  schoolId: string (FK)
  name: string
  description: string?
  nodes: JSON  -- ReactFlow nodes array
  edges: JSON  -- ReactFlow edges array
  columns: JSON
  createdBy: string (FK → User)
  isTemplate: boolean
  ...AuditFields
}

StudentCourseSequence {
  id: string (PK)
  studentId: string (FK)
  sequenceId: string (FK → CourseSequence)
  assignedBy: string (FK → User)
  assignedAt: DateTime
}
```

### Questions for Backend

1. Should sequence templates be shareable across schools, or strictly per-school?
2. Should the sequence JSON (nodes/edges) be validated server-side, or stored as-is?
3. When a student completes a course, should their sequence view auto-update node status?
4. Maximum size for the JSON payload (nodes + edges)?

### Acceptance Criteria

- Counselors can create, edit, and delete course sequence templates.
- Sequences store ReactFlow-compatible JSON (nodes + edges).
- Counselors can assign sequences to students.
- Students can view their assigned sequence.
- Sequence list is paginated and searchable.

---

## SCRUM-139: Gap Analysis Algorithm

**Status:** PARTIAL
**EPIC:** 2.5 · **Estimate:** 16h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/app/dashboard/learning/gaps/page.tsx` | Smart Gaps Analysis page: skill gap cards, ROI calculator, course recommendations |
| `src/services/benchmarkService.ts` | `getSkillGaps`, `getROIAnalysis` |
| Components | `SkillGapCard`, `ROICalculator`, `CourseRecommendations`, `AIStrategyCard`, `LearningTimeline` |

### What's Missing

The current implementation is **skill-based** gap analysis (soft skills, competencies). What's needed is **academic credit-based** gap analysis: credit gaps (vs graduation requirements), course gaps (missing required courses), pace gaps (off-track for graduation), and career alignment gaps.

### Required Endpoints

#### 1. `GET /api/v1/students/{studentId}/academic-gaps`

Compute comprehensive academic gap analysis for a student.

**Auth:** `student` (own data), `counselor`, `school_admin`.

**Response (200):**

```json
{
  "studentId": "student-uuid",
  "analysisDate": "2026-02-17T00:00:00Z",
  "graduationTarget": "2027-06",
  "overallStatus": "at_risk",
  "creditGaps": [
    {
      "category": "Sciences",
      "creditsEarned": 2.0,
      "creditsRequired": 3.0,
      "deficit": 1.0,
      "severity": "warning",
      "recommendation": "Enroll in a science elective next semester"
    }
  ],
  "courseGaps": [
    {
      "courseCode": "ENG-201",
      "courseName": "English Literature II",
      "category": "English / Language Arts",
      "reason": "Required course not yet taken",
      "suggestedSemester": "Fall 2026",
      "urgency": "high"
    }
  ],
  "paceGaps": [
    {
      "metric": "credits_per_semester",
      "current": 5.0,
      "required": 6.0,
      "status": "behind",
      "message": "Student needs to take 1 additional course per semester to graduate on time"
    }
  ],
  "careerGaps": [
    {
      "careerPath": "Software Engineering",
      "missingSkills": ["Advanced Mathematics", "Computer Science Fundamentals"],
      "recommendedCourses": ["CS-101", "MATH-301"]
    }
  ],
  "prioritizedRecommendations": [
    {
      "priority": 1,
      "type": "course_gap",
      "action": "Enroll in ENG-201 (English Literature II) in Fall 2026",
      "impact": "Fulfills required English credits for graduation",
      "urgency": "high"
    },
    {
      "priority": 2,
      "type": "credit_gap",
      "action": "Add a Science elective to next semester",
      "impact": "Closes 1.0 credit deficit in Sciences category",
      "urgency": "medium"
    }
  ]
}
```

#### 2. `GET /api/v1/school-admin/academic-gaps/summary`

Aggregate gap analysis for all students (dashboard view).

**Query params:** `?status=at_risk|on_track|behind&page=1&limit=20`

**Response (200):**

```json
{
  "summary": {
    "totalStudents": 150,
    "onTrack": 98,
    "atRisk": 35,
    "behind": 17
  },
  "data": [
    {
      "studentId": "student-uuid",
      "studentName": "Maria Mendoza",
      "overallStatus": "at_risk",
      "creditDeficit": 2.0,
      "missingRequiredCourses": 1,
      "topGap": "Sciences: 1.0 credit deficit"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Data Dependencies

This endpoint cross-references:

- Graduation rules (SCRUM-132) — credit requirements per category
- Student grades (SCRUM-141) — completed courses + credits earned
- Course catalog (SCRUM-135) — valid courses + prerequisites
- Career data — student's career interests
- Academic calendar (SCRUM-133) — time remaining until graduation

### Questions for Backend

1. Should gap analysis be computed on-demand or cached/precomputed on a nightly schedule?
2. Should the `prioritizedRecommendations` scoring be a deterministic algorithm or AI-generated?
3. What threshold defines "at_risk" vs "behind"? (e.g., <80% pace = at_risk, <60% = behind?)

### Acceptance Criteria

- Per-student academic gap analysis covering credits, courses, pace, and career alignment.
- Aggregated gap summary for school admin dashboard with status breakdown.
- Prioritized recommendations with actionable next steps.
- Gap analysis reflects real-time changes when grades are imported or courses are enrolled.

---

## SCRUM-140: AI Course Recommendations

**Status:** PARTIAL
**EPIC:** 2.6 · **Estimate:** 16h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/services/courseService.ts` | `getRecommendationsBySkills(skills)` — mock string-match on course titles |
| `src/hooks/useCareerQueries.ts` | `useRecommendations` query hook |
| `src/components/dashboard/courses/CourseRecommendations` | Skill-gap-driven recommendations UI |

### What's Missing

True AI/LLM-powered recommendation engine that considers assessments (MIL, PCA, 360°), career interests, academic progress, and graduation requirements to produce next-semester and long-term course recommendations.

### Required Endpoints

#### 1. `GET /api/v1/students/{studentId}/course-recommendations`

Get AI-powered course recommendations.

**Auth:** `student` (own), `counselor`, `school_admin`.

**Response (200):**

```json
{
  "studentId": "student-uuid",
  "generatedAt": "2026-02-17T10:00:00Z",
  "nextSemester": [
    {
      "courseId": "course-uuid",
      "courseCode": "CS-101",
      "courseName": "Intro to Computer Science",
      "credits": 1.0,
      "reason": "Aligns with career interest in Software Engineering; fills elective requirement",
      "priority": "high",
      "source": "career_alignment"
    },
    {
      "courseId": "course-uuid-2",
      "courseCode": "MATH-301",
      "courseName": "Calculus I",
      "credits": 1.0,
      "reason": "Required for STEM track; prerequisite for Physics II",
      "priority": "high",
      "source": "graduation_requirement"
    }
  ],
  "longTerm": [
    {
      "courseId": "course-uuid-3",
      "courseCode": "AP-CSA",
      "courseName": "AP Computer Science A",
      "credits": 1.0,
      "suggestedGrade": 11,
      "reason": "Strong MIL logical reasoning (85th percentile) suggests aptitude for AP-level CS",
      "source": "assessment_based"
    }
  ],
  "reasoning": "Based on Maria's MIL assessment (logical reasoning: 85th percentile, spatial: 72nd), PCA profile (investigative-realistic), career interest in software engineering, and current credit standing (18/24), the following courses maximize both graduation progress and career alignment."
}
```

### Questions for Backend (AI Architecture — See Consolidated Section)

1. **Where does AI processing live?** Should the backend query OpenAI with student context (assessments + grades + career interests) and return recommendations? Or should the frontend pass context to a generic AI endpoint?
2. **What data feeds the prompt?** MIL scores, PCA profile, 360° competencies, career interests, completed courses, graduation gaps — confirm which fields are available to the recommendation engine.
3. **Caching strategy?** Recommendations should be cached and refreshed when student data changes (new grade, new assessment result). Is this feasible?
4. **Fallback when AI is unavailable?** Should there be a rule-based fallback (graduation requirements → fill gaps first)?

### Acceptance Criteria

- Student receives next-semester and long-term course recommendations.
- Each recommendation includes a reason (career alignment, graduation requirement, assessment-based).
- Recommendations are contextual: they change when grades, assessments, or career interests change.
- AI reasoning is transparent and displayed to the student.

---

# EPIC 3 — Integration Layer

---

## SCRUM-141: CSV Grade Import (iSAMS)

**Status:** DONE (Frontend) — Awaiting Backend Implementation
**EPIC:** 3.1 · **Estimate:** 12h

### Frontend Implementation (Complete)

| File | What it does |
|------|-------------|
| `src/components/school-admin/GradeImportForm.tsx` | CSV upload form with Papaparse validation, preview, column check |
| `src/components/school-admin/GradeImportPreview.tsx` | Preview table component |
| `src/services/gradeImportService.ts` | `uploadGrades(file, schoolId)` → `POST /api/v1/school-admin/grades/import` |
| `src/hooks/useGradeImport.ts` | React Query mutation, invalidates results on success |
| `src/services/isamsService.ts` | `saveIsamsConfig`, `getIsamsStatus`, `triggerIsamsSync` |
| `src/app/school-admin/integrations/isams/page.tsx` | iSAMS admin config UI |
| `src/app/api/school-admin/grades/import/route.ts` | Local dev stub (to be replaced by real backend) |
| `src/services/__tests__/gradeImportService.test.ts` | Service unit tests |
| `src/components/school-admin/__tests__/GradeImportForm.test.tsx` | Component tests |

### Required Backend Endpoints (Already Specified)

| # | Endpoint | Method | Purpose |
|---|----------|--------|---------|
| 1 | `/api/v1/school-admin/grades/import?schoolId=` | POST | Upload CSV, validate, enqueue job |
| 2 | `/api/v1/school-admin/grades/import/{jobId}?schoolId=` | GET | Poll job status |
| 3 | `/api/v1/school-admin/grades/import/{jobId}/download-failures` | GET | Download failed rows CSV |
| 4 | `/api/v1/school-admin/integrations/isams?schoolId=` | POST | Save iSAMS config (encrypted) |
| 5 | `/api/v1/school-admin/integrations/isams/status?schoolId=` | GET | Connection status |
| 6 | `/api/v1/school-admin/integrations/isams/sync?schoolId=` | POST | Trigger sync job |

### CSV Schema

Required columns: `student_id`, `student_email`, `course_code`, `semester`, `grade`, `credits`, `status`.

### Processing Model

1. Receive file → shallow CSV validation → create `GradeImportJob` (status=queued).
2. Background worker: iterate rows → map `course_code` → find student → create/update grade record.
3. Unresolved mappings → `GradeImportError` table.
4. On completion: update job status, generate failure CSV, emit notification.

### Data Models

```
GradeImportJob { id, schoolId, uploaderUserId, filename, status, totalRows, processedRows, failedRows, errors JSON, createdAt, completedAt }
GradeImportError { id, jobId, rowNumber, rawRow JSON, errorMessages JSON }
StudentGrade { id, schoolId, studentId, courseId, semester, grade, credits, status, importJobId, ...AuditFields }
IsamsConfig { id, schoolId, endpoint, authType, credentialsEncrypted, lastSyncAt, lastSyncStatus }
IsamsSyncJob { id, schoolId, initiatedBy, status, details, startedAt, finishedAt }
```

### Questions for Backend

1. Preferred job queue (Hangfire / Quartz / Azure Queue)?
2. Failure CSV storage (DB vs S3/Azure Blob)?
3. Default upsert behavior (true/false)?
4. iSAMS API auth method the client uses (API key vs OAuth)?

---

## SCRUM-142: Data Mapping Engine

**Status:** MISSING
**EPIC:** 3.2 · **Estimate:** 8h

### What Already Exists (Frontend)

Nothing — no data mapping UI, services, or types.

### What's Needed

When importing grades from external systems (iSAMS), external course codes may not match internal ones. The Data Mapping Engine allows school admins to create manual mappings and request AI-suggested mappings.

### Required Endpoints

#### 1. `GET /api/v1/school-admin/data-mappings`

List all course code mappings for the school.

**Query params:** `?page=1&limit=20&status=approved|pending|rejected&search=`

**Response (200):**

```json
{
  "data": [
    {
      "id": "mapping-uuid",
      "externalCode": "SCI301",
      "externalName": "Science Advanced",
      "externalSource": "iSAMS",
      "internalCourseId": "course-uuid",
      "internalCode": "PHYS-301",
      "internalName": "Physics I",
      "confidence": 0.95,
      "source": "ai_suggested",
      "status": "approved",
      "approvedBy": "admin-uuid",
      "approvedAt": "2026-02-10T10:00:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### 2. `POST /api/v1/school-admin/data-mappings`

Create a manual mapping.

**Request Body:**

```json
{
  "externalCode": "SCI301",
  "externalName": "Science Advanced",
  "externalSource": "iSAMS",
  "internalCourseId": "course-uuid"
}
```

**Response (201):** Created mapping with `source: "manual"`, `status: "approved"`.

#### 3. `PUT /api/v1/school-admin/data-mappings/{id}`

Update a mapping.

#### 4. `DELETE /api/v1/school-admin/data-mappings/{id}`

Delete a mapping.

#### 5. `POST /api/v1/school-admin/data-mappings/ai-suggest`

Request AI-suggested mappings for unmapped external codes.

**Request Body:**

```json
{
  "unmappedCodes": [
    { "externalCode": "SCI301", "externalName": "Science Advanced" },
    { "externalCode": "MTH202", "externalName": "Mathematics Intermediate" }
  ]
}
```

**Response (200):**

```json
{
  "suggestions": [
    {
      "externalCode": "SCI301",
      "externalName": "Science Advanced",
      "suggestedInternalCourseId": "course-uuid",
      "suggestedInternalCode": "PHYS-301",
      "suggestedInternalName": "Physics I",
      "confidence": 0.88,
      "reasoning": "Course name and department match. Science Advanced at similar credit level."
    },
    {
      "externalCode": "MTH202",
      "externalName": "Mathematics Intermediate",
      "suggestedInternalCourseId": "course-uuid-2",
      "suggestedInternalCode": "MATH-201",
      "suggestedInternalName": "Pre-Calculus",
      "confidence": 0.72,
      "reasoning": "Intermediate math level aligns with Pre-Calculus curriculum."
    }
  ]
}
```

#### 6. `POST /api/v1/school-admin/data-mappings/bulk-approve`

Approve multiple AI-suggested mappings at once.

**Request Body:**

```json
{
  "mappingIds": ["mapping-1", "mapping-2", "mapping-3"]
}
```

**Response (200):**

```json
{
  "success": true,
  "approved": 3
}
```

### Data Model

```
DataMapping {
  id: string (PK)
  schoolId: string (FK)
  externalCode: string
  externalName: string?
  externalSource: enum (iSAMS | CSV | manual | other)
  internalCourseId: string (FK → SchoolCourse)
  confidence: decimal? (0.0 - 1.0)
  source: enum (manual | ai_suggested)
  status: enum (pending | approved | rejected)
  approvedBy: string? (FK → User)
  approvedAt: DateTime?
  ...AuditFields
}
```

### Questions for Backend (AI)

1. **Should AI mapping suggestions be computed server-side?** The backend would need access to both the school's internal course catalog and the external codes. Confirm the AI call happens on the backend.
2. **What confidence threshold should auto-approve a mapping?** (e.g., ≥0.95 = auto-approve, <0.95 = requires counselor review)
3. During grade import, if an external `course_code` has no mapping, should the import row fail or be queued for mapping?

### Acceptance Criteria

- School admin can create manual course code mappings.
- School admin can request AI-suggested mappings for unmapped codes.
- AI suggestions include confidence scores and reasoning.
- Mappings can be approved/rejected individually or in bulk.
- Approved mappings are used during subsequent grade imports to resolve `course_code → internalCourseId`.

---

# EPIC 4 — Assessment System

---

## SCRUM-143: Assessment Configuration

**Status:** PARTIAL
**EPIC:** 4.1 · **Estimate:** 8h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/components/evaluation/EvaluationConfiguration.tsx` | Rating scale, competency dimensions, evaluator requirements (597 lines) |
| `src/services/evaluationService.ts` | `EvaluationConfiguration` with settings: allowAnonymous, requireAllQuestions, sendReminders, etc. (1566 lines) |
| `src/services/milService.ts` | `timeLimitMinutes` per MIL exam type |

### What's Missing

- Centralized assessment configuration dashboard for school admins
- Per-school scheduling configuration (date ranges for each assessment type)
- Proctoring settings
- Retake policies per assessment type
- Settings for all 4 assessment types in one place (MIL, PCA, 360°, TIMS)

### Required Endpoints

#### 1. `GET /api/v1/school-admin/assessments/config`

Get assessment configuration for all assessment types.

**Auth:** `school_admin` role.

**Response (200):**

```json
{
  "schoolId": "school-uuid",
  "assessments": [
    {
      "type": "MIL",
      "label": "MIL (Fluid Intelligence)",
      "enabled": true,
      "scheduling": {
        "windowStart": "2026-03-01T08:00:00Z",
        "windowEnd": "2026-03-15T17:00:00Z",
        "assessmentPeriodId": "ap-1"
      },
      "settings": {
        "timeLimitMinutes": 45,
        "maxRetakes": 1,
        "retakeCooldownDays": 30,
        "proctored": true,
        "proctorInstructions": "Ensure student has webcam enabled and photo ID ready."
      }
    },
    {
      "type": "PCA",
      "label": "PCA (Career Assessment)",
      "enabled": true,
      "scheduling": {
        "windowStart": "2026-03-01T08:00:00Z",
        "windowEnd": "2026-04-30T17:00:00Z",
        "assessmentPeriodId": "ap-1"
      },
      "settings": {
        "timeLimitMinutes": 0,
        "maxRetakes": 2,
        "retakeCooldownDays": 14,
        "proctored": false,
        "proctorInstructions": null
      }
    },
    {
      "type": "360",
      "label": "360° Evaluation",
      "enabled": true,
      "scheduling": {
        "windowStart": "2026-04-01T08:00:00Z",
        "windowEnd": "2026-05-15T17:00:00Z",
        "assessmentPeriodId": "ap-2"
      },
      "settings": {
        "timeLimitMinutes": 0,
        "maxRetakes": 0,
        "retakeCooldownDays": 0,
        "proctored": false,
        "proctorInstructions": null
      }
    },
    {
      "type": "TIMS",
      "label": "TIMS Assessment",
      "enabled": false,
      "scheduling": null,
      "settings": {
        "timeLimitMinutes": 60,
        "maxRetakes": 1,
        "retakeCooldownDays": 90,
        "proctored": true,
        "proctorInstructions": null
      }
    }
  ]
}
```

#### 2. `PUT /api/v1/school-admin/assessments/config`

Update assessment configuration.

**Request Body:**

```json
{
  "assessments": [
    {
      "type": "MIL",
      "enabled": true,
      "scheduling": {
        "windowStart": "2026-03-01T08:00:00Z",
        "windowEnd": "2026-03-15T17:00:00Z",
        "assessmentPeriodId": "ap-1"
      },
      "settings": {
        "timeLimitMinutes": 45,
        "maxRetakes": 1,
        "retakeCooldownDays": 30,
        "proctored": true,
        "proctorInstructions": "Ensure webcam is enabled."
      }
    }
  ]
}
```

**Response (200):** Updated configuration (same as GET).

#### 3. `GET /api/v1/school-admin/assessments/status`

Overview of assessment completion across all students.

**Response (200):**

```json
{
  "summary": {
    "MIL": { "completed": 85, "inProgress": 20, "notStarted": 45, "total": 150 },
    "PCA": { "completed": 72, "inProgress": 15, "notStarted": 63, "total": 150 },
    "360": { "completed": 40, "inProgress": 30, "notStarted": 80, "total": 150 },
    "TIMS": { "completed": 0, "inProgress": 0, "notStarted": 150, "total": 150 }
  }
}
```

### Data Model

```
SchoolAssessmentConfig {
  id: string (PK)
  schoolId: string (FK)
  assessmentType: enum (MIL | PCA | 360 | TIMS)
  enabled: boolean
  windowStart: DateTime?
  windowEnd: DateTime?
  assessmentPeriodId: string? (FK → AssessmentPeriod)
  timeLimitMinutes: int
  maxRetakes: int
  retakeCooldownDays: int
  proctored: boolean
  proctorInstructions: string?
  ...AuditFields
}
```

### Questions for Backend

1. Should proctoring be enforced at the API level (reject assessment submissions outside scheduled windows)?
2. How are retake counts tracked — per student per assessment type?
3. Should assessment windows respect the academic calendar holidays (auto-exclude)?
4. Is there a lockdown mode (block student access to other browser tabs during proctored exams)?

### Acceptance Criteria

- School admin can configure all 4 assessment types from one dashboard.
- Each assessment type has scheduling windows, time limits, retake policies, and proctoring settings.
- Assessment status endpoint shows completion rates across all students.
- Disabled assessments are hidden from students.

---

# EPIC 5 — Counselor Dashboard

---

## SCRUM-145: Student List View (Counselor)

**Status:** PARTIAL
**EPIC:** 5.1 · **Estimate:** 8h

### What Already Exists (Frontend)

| File | What it does |
|------|-------------|
| `src/app/school-admin/students/page.tsx` | Student list with search, status filter, sort, pagination (393 lines) |
| `src/app/school-admin/students/[id]/page.tsx` | Student detail page |
| `src/services/schoolAdminService.ts` | `getStudents(params)`, `getStudentResults` |

### What's Missing

This is a **school-admin view**, not a **counselor-specific view**. Missing: counselor-scoped endpoint (only assigned students), additional columns (assessment status, credit progress, alert count), bulk actions for counselors.

### Required Endpoints

#### 1. `GET /api/v1/counselor/students`

List students assigned to the authenticated counselor.

**Auth:** `counselor` role. Returns only the counselor's assigned students.

**Query params:** `?page=1&limit=20&search=&status=active|at_risk|behind&sortBy=name|lastActive|creditProgress|alertCount&sortOrder=asc|desc`

**Response (200):**

```json
{
  "data": [
    {
      "id": "student-uuid",
      "name": "Maria Mendoza",
      "email": "maria@school.edu",
      "gradeLevel": 11,
      "status": "active",
      "assessmentStatus": {
        "MIL": "completed",
        "PCA": "completed",
        "360": "in_progress",
        "TIMS": "not_started"
      },
      "creditProgress": {
        "earned": 18,
        "required": 24,
        "percentage": 75
      },
      "gpa": 3.45,
      "alertCount": 2,
      "careerPath": "Software Engineering",
      "lastActive": "2026-02-16T14:30:00Z"
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

#### 2. `GET /api/v1/counselor/students/{studentId}/summary`

Counselor-focused student summary (not the same as school-admin results detail).

**Response (200):**

```json
{
  "student": {
    "id": "student-uuid",
    "name": "Maria Mendoza",
    "email": "maria@school.edu",
    "gradeLevel": 11,
    "joinedAt": "2025-09-01T00:00:00Z"
  },
  "academicOverview": {
    "gpa": 3.45,
    "creditsEarned": 18,
    "creditsRequired": 24,
    "onTrack": true
  },
  "assessments": {
    "MIL": { "status": "completed", "score": 85, "completedAt": "2026-01-15" },
    "PCA": { "status": "completed", "score": null, "completedAt": "2026-01-20" },
    "360": { "status": "in_progress", "evaluatorsComplete": 3, "evaluatorsTotal": 5 },
    "TIMS": { "status": "not_started" }
  },
  "activeAlerts": [
    {
      "id": "alert-uuid",
      "type": "credit_gap",
      "title": "Sciences credit deficit",
      "priority": "medium",
      "createdAt": "2026-02-10T00:00:00Z"
    }
  ],
  "careerPath": {
    "primary": "Software Engineering",
    "fitScore": 87,
    "alternates": ["Data Science", "UX Design"]
  },
  "courseSequenceId": "seq-uuid"
}
```

#### 3. `POST /api/v1/counselor/students/bulk-action`

Counselor bulk actions (send message, assign course sequence, flag for review).

**Request Body:**

```json
{
  "studentIds": ["student-1", "student-2"],
  "action": "assign_sequence",
  "payload": {
    "sequenceId": "seq-uuid"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "affected": 2,
  "action": "assign_sequence"
}
```

### Data Model

No new models required — this endpoint aggregates existing data (students, grades, assessments, alerts, career data) into a counselor-optimized view.

### Questions for Backend

1. Should the counselor student list precompute aggregated columns (alertCount, creditProgress) or compute per-request?
2. Should counselors see students from other counselors within the same school (read-only), or strictly their own?
3. Bulk actions scope — what actions should be supported initially? (assign sequence, send message, flag for review)

### Acceptance Criteria

- Counselors see only their assigned students (not all school students).
- Student list includes assessment status, credit progress, alert count.
- Sortable by multiple columns.
- Counselor can open a student summary with academic overview + active alerts.
- Bulk actions work for 2+ selected students.

---

## SCRUM-146: Alert System

**Status:** MISSING
**EPIC:** 5.2 · **Estimate:** 12h

### What Already Exists (Frontend)

Nothing — only the generic ShadCN `Alert` UI component (unrelated).

### What's Needed

Automated alert system that generates alerts for: grade drops, missing assessments, credit gaps, no career path selected, and student inactivity. Alerts are visible to counselors on their dashboard and can be dismissed/acknowledged.

### Required Endpoints

#### 1. `GET /api/v1/alerts`

List alerts for the authenticated user (counselor sees alerts for their students, school_admin sees all).

**Query params:** `?type=grade_drop|missing_assessment|credit_gap|no_career_path|inactive&priority=critical|high|medium|low&status=active|acknowledged|dismissed&studentId=&page=1&limit=20`

**Response (200):**

```json
{
  "data": [
    {
      "id": "alert-uuid",
      "schoolId": "school-uuid",
      "studentId": "student-uuid",
      "studentName": "Carlos Rivera",
      "type": "grade_drop",
      "priority": "high",
      "title": "Grade dropped from B+ to D in MATH-301",
      "message": "Carlos's grade in Calculus I dropped from B+ (87) to D (63) between Semester 1 and Mid-Semester 2. This may indicate difficulty with the material.",
      "data": {
        "courseCode": "MATH-301",
        "previousGrade": "B+",
        "currentGrade": "D",
        "dropPercentage": 27.6
      },
      "status": "active",
      "createdAt": "2026-02-15T06:00:00Z",
      "acknowledgedAt": null,
      "acknowledgedBy": null
    },
    {
      "id": "alert-uuid-2",
      "schoolId": "school-uuid",
      "studentId": "student-uuid-2",
      "studentName": "Ana López",
      "type": "missing_assessment",
      "priority": "medium",
      "title": "PCA assessment not started",
      "message": "Ana has not started the PCA assessment. The assessment window closes on March 15, 2026.",
      "data": {
        "assessmentType": "PCA",
        "windowEnd": "2026-03-15T17:00:00Z",
        "daysRemaining": 26
      },
      "status": "active",
      "createdAt": "2026-02-14T06:00:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

#### 2. `GET /api/v1/alerts/summary`

Alert count breakdown by type and priority.

**Response (200):**

```json
{
  "total": 45,
  "byType": {
    "grade_drop": 8,
    "missing_assessment": 15,
    "credit_gap": 12,
    "no_career_path": 5,
    "inactive": 5
  },
  "byPriority": {
    "critical": 3,
    "high": 12,
    "medium": 20,
    "low": 10
  },
  "newSinceLastLogin": 7
}
```

#### 3. `PATCH /api/v1/alerts/{alertId}`

Acknowledge or dismiss an alert.

**Request Body:**

```json
{
  "status": "acknowledged",
  "notes": "Scheduled meeting with student for Feb 20"
}
```

**Response (200):**

```json
{
  "success": true,
  "alert": {
    "id": "alert-uuid",
    "status": "acknowledged",
    "acknowledgedAt": "2026-02-17T11:00:00Z",
    "acknowledgedBy": "counselor-uuid",
    "notes": "Scheduled meeting with student for Feb 20"
  }
}
```

#### 4. `POST /api/v1/alerts/bulk-action`

Bulk acknowledge/dismiss alerts.

**Request Body:**

```json
{
  "alertIds": ["alert-1", "alert-2", "alert-3"],
  "action": "acknowledge",
  "notes": "Reviewed in weekly counselor meeting"
}
```

**Response (200):**

```json
{
  "success": true,
  "affected": 3
}
```

### Alert Type Definitions

| Type | Trigger | Priority Logic |
|------|---------|---------------|
| `grade_drop` | Grade decreases by ≥1 letter grade between grading periods | ≥2 letter drop = critical; 1 letter = high |
| `missing_assessment` | Assessment window open but student hasn't started | <7 days remaining = high; >7 days = medium |
| `credit_gap` | Student is behind on graduation credits for their grade level | ≥3 credits behind = critical; 1-2 = high |
| `no_career_path` | Student has completed PCA but has no career path selected | Default = medium |
| `inactive` | Student hasn't logged in for >14 days | >30 days = high; 14-30 days = medium |

### Questions for Backend

1. Alert generation: daily batch job (cron), event-driven (on grade import, assessment completion), or both?
2. Should dismissed alerts be permanently deleted or soft-deleted (queryable with `?status=dismissed`)?
3. Should alerts generate email/push notifications to counselors, or are they in-app only?
4. What are the exact thresholds for each alert type? (The ones above are recommendations — please confirm.)
5. Should students see their own alerts, or are alerts counselor/admin-only?

### Acceptance Criteria

- Alerts are automatically generated based on defined triggers.
- Counselors see alerts for their assigned students; school admins see all.
- Alerts are filterable by type, priority, and status.
- Alerts can be acknowledged (with optional notes) or dismissed.
- Bulk actions work on multiple alerts.
- Summary endpoint provides dashboard-level counts.

---

## SCRUM-151: Basic Alert Infrastructure

**Status:** MISSING
**EPIC:** 5.2 · **Estimate:** 8h

### What's Needed

This is the foundational backend work for SCRUM-146. Defines the data model, generation service, API endpoints, and notification dispatch.

### Required Backend Work

1. **Alert data model** — see `Alert` model below.
2. **Alert generation service** — daily scheduled job that scans student data and creates alerts based on triggers defined in SCRUM-146.
3. **API endpoints** — as defined in SCRUM-146.
4. **Notification dispatch** — in-app alert badge count + optional email digest to counselors.

### Data Model

```
Alert {
  id: string (PK)
  schoolId: string (FK)
  studentId: string (FK → User)
  counselorId: string? (FK → User, assigned counselor)
  type: enum (grade_drop | missing_assessment | credit_gap | no_career_path | inactive)
  priority: enum (critical | high | medium | low)
  title: string
  message: string
  data: JSON  -- type-specific payload (courseCode, assessmentType, etc.)
  status: enum (active | acknowledged | dismissed)
  notes: string?
  createdAt: DateTime
  acknowledgedAt: DateTime?
  acknowledgedBy: string? (FK → User)
  dismissedAt: DateTime?
  expiresAt: DateTime?  -- auto-dismiss after X days?
  ...AuditFields
}

AlertPreference {
  id: string (PK)
  userId: string (FK → User)
  alertType: enum
  emailEnabled: boolean
  inAppEnabled: boolean
  frequency: enum (immediate | daily_digest | weekly_digest)
}
```

### Implementation Steps for Backend

1. Create `Alert` and `AlertPreference` tables.
2. Implement alert generation service (scheduled daily):
   - Query student grades → detect drops → create `grade_drop` alerts.
   - Query assessment status vs windows → create `missing_assessment` alerts.
   - Query graduation progress → create `credit_gap` alerts.
   - Query career path status → create `no_career_path` alerts.
   - Query last login → create `inactive` alerts.
3. Implement REST endpoints (list, summary, update, bulk-action).
4. Implement notification dispatch (email digest via SendGrid/etc.).
5. Add alert count to counselor dashboard API response.

### Questions for Backend

1. Scheduling technology: Hangfire / Quartz / Azure Functions Timer?
2. Should alert generation be idempotent (don't create duplicate alerts for the same issue)?
3. Alert retention policy: auto-delete after 90 days? Archive?
4. Email notification provider preference?

### Acceptance Criteria

- Alert table exists and supports all 5 alert types.
- Generation service runs daily and creates appropriate alerts.
- No duplicate alerts for the same student + type + trigger.
- API endpoints return alerts scoped by user role.
- (Optional) Email digest sent to counselors daily.

---

# Consolidated: AI Architecture Questions

> **The following questions apply jointly to SCRUM-136 (AP/IB Recognition), SCRUM-140 (AI Course Recommendations), and SCRUM-142 (Data Mapping AI)**

1. **Where does AI processing live?**
   - Option A: Backend calls OpenAI/Azure OpenAI directly (server-side). Frontend just triggers and receives results.
   - Option B: Frontend calls LLM (we already have `src/lib/ai/llmClient.ts` for OpenAI), then POSTs results to backend for persistence.
   - **Recommendation:** Option A — server-side AI calls. This keeps API keys secure, allows caching, rate limiting, and audit logging.

2. **Which model/provider?** OpenAI GPT-4o? Azure OpenAI (for data residency)? Other?

3. **What student data feeds into AI prompts?**
   - MIL scores (logical reasoning, spatial, etc.)
   - PCA profile (career interest types)
   - 360° competency evaluations
   - Completed courses + grades
   - Graduation gap status
   - Career interests
   - Confirm which of these are available and in what format.

4. **Rate limiting / cost controls?**
   - Max AI calls per school per day?
   - Should AI results be cached (e.g., recommendations valid for 7 days unless data changes)?

5. **Confidence thresholds:**
   - AP/IB Recognition: above what confidence should mappings be auto-approved?
   - Data Mapping: above what confidence should course code mappings be auto-approved?
   - Recommendations: is the current `getRecommendationsBySkills` string-matching acceptable as a fallback when AI is unavailable?

6. **Fallback behavior:** When AI is unavailable (rate limit, outage), should endpoints:
   - Return empty results?
   - Return rule-based fallback suggestions?
   - Queue the request and process later?

---

# Implementation Priority (Suggested Sequencing)

The following order minimizes cross-dependencies:

| Phase | Tasks | Rationale |
|-------|-------|-----------|
| **Phase 1: Foundations** | SCRUM-133 (Calendar), SCRUM-130 (School Profile), SCRUM-131 (Frameworks) | Calendar + Profile + Frameworks are prerequisites for everything else |
| **Phase 2: Courses & Grades** | SCRUM-135 (Course Import), SCRUM-141 (Grade Import — already specified), SCRUM-142 (Data Mapping) | Course catalog + grades are needed for gap analysis |
| **Phase 3: Rules & Progress** | SCRUM-132 (Graduation Rules), SCRUM-137 (Prerequisites) | Rules depend on course catalog |
| **Phase 4: Roles & Assignments** | SCRUM-134 (User Roles), SCRUM-145 (Counselor Student View) | Counselor view depends on role assignments |
| **Phase 5: Analysis & AI** | SCRUM-139 (Gap Analysis), SCRUM-140 (AI Recommendations), SCRUM-136 (AP/IB Recognition) | Depends on grades + rules + courses |
| **Phase 6: Visualization** | SCRUM-138 (Course Sequence Builder) | Depends on course catalog + prerequisites |
| **Phase 7: Alerts** | SCRUM-151 (Alert Infrastructure), SCRUM-146 (Alert System) | Depends on grades + assessments + gap analysis |
| **Phase 8: Assessment Config** | SCRUM-143 (Assessment Configuration) | Can be done in parallel; lower coupling |

---

# Final Notes for Backend Team

1. **Existing APIs:** Several school-admin endpoints already exist (students, analytics, results, settings) — see `docs/SCHOOL_ADMIN_BACKEND_API_REQUIREMENTS.md`. New endpoints should follow the same patterns.

2. **Frontend stubs:** The frontend has a local dev stub at `src/app/api/school-admin/grades/import/route.ts` that will be removed once real backend endpoints are available.

3. **Testing:** Please provide OpenAPI/Swagger docs for each new endpoint. Frontend will integrate against staging and needs sample data for each endpoint.

4. **Bilingual support:** All user-facing text responses should support `?language=en|es`.

5. **Coordination:** After implementing each phase, please notify frontend so we can integrate and test. We'll provide Postman collections for validation.

---

**Please review this document and respond with:**
1. Clarifications on any endpoint contracts
2. Answers to the AI Architecture questions
3. Estimated timeline per phase
4. Any technical constraints or alternative approaches

We're ready to integrate as each phase ships. 🚀
