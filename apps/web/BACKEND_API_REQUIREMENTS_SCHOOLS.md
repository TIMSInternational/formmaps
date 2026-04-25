# Backend API Requirements - School Invite Feature

**Additional Requirements:**

- Mutual exclusivity logic should be enforced on backend if possible, or frontend handles it (as implemented).
- Calendar sync webhooks/polling should support Outlook events.
- **Redirect URL**: Both Google and Outlook auth endpoints (`/auth/{provider}/url`) MUST accept a query parameter (e.g., `redirectUrl` or `from`) to validly redirect the user back to the originating page (Settings vs Onboarding) after OAuth flow. The frontend sends `redirectUrl` with the current page URL.

## 7. Update Coach List API (Missing Data)

**Endpoint:** `GET /authapi/coaches`

**Issue:**
The current response is missing critical fields required for the Admin Dashboard "Coaches" table and view details.

**Assignments:**
Please ensure the following fields are included in each coach object in the `data` array:

- `contractStart` (ISO Date)
- `contractEnd` (ISO Date)
- `platformCommission` (Number, e.g., 15)
- `bio` (String)
- `title` (String, e.g., "Senior Coach")
- `image`: Ensure this returns the full URL (e.g. S3/Cloudinary URL) if the user has an uploaded profile picture. Currently, it is returning an empty string `""` for all users, which should be investigated.

**Response Structure (Current & Correct):**

```json
{
  "data": {
    "data": [
      {
        "id": "...",
        "fullName": "...",
        "status": "...",
        "contractStart": "2025-01-01T00:00:00Z",
        "contractEnd": "2025-12-31T00:00:00Z",
        "platformCommission": 15,
        "image": "https://...",
        "bio": "...",
        "title": "..."
      }
    ],
    "meta": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "totalPages": 10
    }
  }
}
```

This document outlines the new API endpoints required to support the "School Invite" feature in the Admin Dashboard.

## 1. Invite School

**Endpoint:** `POST /api/v1/admin/schools/invite` (or `/authapi/invite-school`)

**Description:** Sends an invitation to a school admin to join the platform.

**Request Payload:**

```json
{
  "name": "Springfield High School",
  "adminEmail": "principal@springfield.edu",
  "maxStudents": 500,
  "details": "Contract ID: #12345, Premium Plan",
  "contractStart": "2024-01-01",
  "contractEnd": "2025-01-01"
}
```

- `name` (string, required): Name of the school.
- `adminEmail` (string, required, email): Email address of the school administrator.
- `maxStudents` (number, required): Maximum number of students allowed for this school.
- `details` (string, optional): Additional details or notes.
- `contractStart` (string, optional): ISO date string.
- `contractEnd` (string, optional): ISO date string.

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation sent successfully to principal@springfield.edu",
  "data": {
    "invitationId": "inv_987654321"
  }
}
```

**Error Responses:**

- `400 Bad Request`: Validation error (missing fields, invalid email).
- `409 Conflict`: School or admin email already exists.
- `500 Internal Server Error`: Server error.

---

## 2. Get All Schools

**Endpoint:** `GET /api/v1/admin/schools`

**Description:** Retrieves a paginated list of schools for the admin dashboard.

**Query Parameters:**

- `page` (number, default: 1): Page number.
- `limit` (number, default: 10): Items per page.
- `search` (string, optional): Search by school name or admin email.

**Success Response (200 OK):**

```json
{
  "data": [
    {
      "id": "school_1",
      "name": "Springfield High School",
      "adminEmail": "principal@springfield.edu",
      "maxStudents": 500,
      "studentCount": 120,
      "status": "active",
      "contractEnd": "2025-01-01",
      "createdAt": "2024-01-01T10:00:00Z"
    },
    {
      "id": "school_2",
      "name": "Shelbyville Elementary",
      "adminEmail": "skinner@shelbyville.edu",
      "maxStudents": 200,
      "studentCount": 0,
      "status": "invited",
      "contractEnd": "2024-12-31",
      "createdAt": "2024-02-15T14:30:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

````

---

## 3. Update School Details
**Endpoint:** `PUT /api/v1/admin/schools/:id`

**Description:** Updates the details of an existing school.

**Request Payload:**
```json
{
  "name": "Springfield High School",
  "adminEmail": "principal@springfield.edu",
  "maxStudents": 600,
  "details": "Updated contract details...",
  "contractStart": "2024-01-01",
  "contractEnd": "2026-01-01"
}
````

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "School updated successfully",
  "data": { ... } // Updated school object
}
```

---

## 4. Resend Invitation

**Endpoint:** `POST /api/v1/admin/schools/:id/invite`

**Description:** Resends the invitation email to the school administrator. Only valid for schools with status `invited` or `pending`.

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Invitation resent successfully"
}
```

---

## 5. Get School Statistics (Optional but Recommended)

**Endpoint:** `GET /api/v1/admin/schools/stats`

**Description:** Returns aggregated statistics for the Schools dashboard.

**Success Response (200 OK):**

```json
{
  "data": {
    "totalSchools": 50,
    "activeSchools": 45,
    "pendingInvites": 5,
    "totalStudents": 12500,
    "totalCapacity": 20000
  }
}
```

---

# Coach Management APIs

## 1. Get Coach Statistics

**Endpoint:** `GET /api/v1/admin/coaches/stats`

**Description:** Returns aggregated statistics for the Coaches dashboard.

**Success Response (200 OK):**

```json
{
  "data": {
    "totalCoaches": 150,
    "activeNow": 42,
    "pendingInvites": 12,
    "expiringContracts": 5,
    "statusBreakdown": {
      "active": 120,
      "invited": 12,
      "pending": 5,
      "inactive": 13
    }
  }
}
```

## 2. Update Invite Coach

**Endpoint:** `POST /authapi/invite-coach`

**Changes:**

- Payload must accept optional `platformCommission` (number, 0-100).
- If not provided, default to system setting (e.g. 15%).

## 3. Update Bulk Invite Coach

**Endpoint:** `POST /authapi/invite-coach-bulk`

**Changes:**

- CSV processing must handle `platformCommission` column.
- Validation should ensure it is a number between 0-100.

## 4. Update Coach Details

**Endpoint:** `PUT /authapi/coaches/:id`

**Changes:**

- Payload must accept `platformCommission` (number) to update the fee.

## 5. Calendar Session Filtering

**Endpoint:** `GET /api/v1/coach/me/sessions`

**Changes:**

- If provided, return sessions within that date range.
- This is required for the new Calendar View (Month/Week).

## 6. Deactivate Coach

**Endpoint:** `POST /authapi/coaches/:id/deactivate`

**Description:** Deactivates a coach account, revoking access and hiding the profile.

**Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Coach deactivated successfully"
}
```
