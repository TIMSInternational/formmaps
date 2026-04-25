# Calendar Integration Backend API Requirements

**Date:** 2026-01-30  
**Frontend:** TimCare Career Platform  
**Requested By:** Frontend Team

---

## Issue Summary

After successful calendar OAuth linking, the frontend currently receives connection status via URL query parameters (`?googleConnected=true&outlookConnected=true`). This is unreliable for:

- Persistent status storage
- Re-checking status on page reload
- Proper disconnect functionality

## Current APIs Available

### ✅ Already Implemented

| Endpoint                             | Method | Description                    |
| ------------------------------------ | ------ | ------------------------------ |
| `GET /api/v1/auth/{provider}/url`    | GET    | Get OAuth authorization URL    |
| `GET /api/v1/auth/{provider}/status` | GET    | Check if calendar is connected |

**Note:** The `/status` endpoint exists but may not be returning consistent data after OAuth callback success.

---

## Required API Additions/Fixes

### 1. Disconnect Calendar API (NEW)

**Endpoint:** `DELETE /api/v1/auth/{provider}/disconnect` or `POST /api/v1/auth/{provider}/disconnect`

**Purpose:** Revoke OAuth tokens and disconnect the calendar integration.

**Request:**

```json
{
  "email": "user@example.com" // Optional, use authenticated user if not provided
}
```

**Response:**

```json
{
  "success": true,
  "message": "Calendar disconnected successfully",
  "provider": "google"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Failed to disconnect calendar",
  "error": "No active connection found"
}
```

---

### 2. Verify/Fix Calendar Status API

**Endpoint:** `GET /api/v1/auth/{provider}/status?email={email}`

**Current Known Issue:**
After successful OAuth callback, the status check may not immediately reflect the connected state. The frontend calls this API but sometimes receives `connected: false` even after successful link.

**Expected Behavior:**

- After successful OAuth callback, status should immediately return `connected: true`
- OAuth tokens should be persisted in the database under the user record
- Subsequent page loads should correctly retrieve connection status

**Expected Response:**

```json
{
  "isAuthenticated": true,
  "email": "user@example.com",
  "userId": "user-123",
  "authDetails": {
    "connected": true,
    "hasAccessToken": true,
    "hasRefreshToken": true,
    "isTokenValid": true,
    "isTokenExpired": false,
    "tokenStatus": "valid",
    "provider": "google"
  }
}
```

---

### 3. OAuth Callback Token Storage

**After OAuth callback completion:**

1. Store `access_token`, `refresh_token`, and `expiry` in database
2. Associate tokens with authenticated user ID
3. Ensure subsequent `/status` calls reflect connection

---

## Frontend Implementation Details

**File:** `src/app/dashboard/coaching/settings/_components/AvailabilitySettingsTab.tsx`

**Current Flow:**

1. User clicks "Connect" → `getCalendarAuthUrl()` → Redirect to OAuth provider
2. After OAuth success → Redirect back with query params
3. Page calls `checkCalendarAuthStatus()` to verify
4. "Disconnect" button shows toast: "Disconnect functionality requires backend implementation"

**After Backend Fix:**

1. `checkCalendarAuthStatus()` returns accurate status
2. "Disconnect" button calls new disconnect API
3. No reliance on URL query parameters

---

## Priority

**HIGH** - Coaches cannot reliably manage calendar integrations without these fixes.

---

## School Admin Onboarding APIs (NEW)

The frontend has implemented a school admin onboarding flow at `/onboarding/school/{token}`. The following APIs are required:

### 4. Get School Admin Onboarding Status

**Endpoint:** `GET /api/v1/school-admin/{token}/onboarding-status`

**Purpose:** Validate the invitation token and retrieve school information for the onboarding form.

**Response:**

```json
{
  "data": {
    "userId": "school-admin-123",
    "email": "admin@school.com",
    "schoolName": "Springfield High School",
    "adminName": "John Smith",
    "maxStudents": 500,
    "contractStart": "2026-01-01",
    "contractEnd": "2027-01-01",
    "isValid": true,
    "status": "pending"
  }
}
```

**Error Response (Invalid/Expired Token):**

```json
{
  "data": {
    "isValid": false,
    "status": "expired"
  }
}
```

---

### 5. Submit School Admin Onboarding

**Endpoint:** `POST /api/v1/school-admin/{token}/onboarding`

**Purpose:** Complete the school admin onboarding process, set password, and activate the account.

**Request:**

```json
{
  "adminInfo": {
    "name": "John Smith",
    "phone": "+1 555-123-4567",
    "position": "Principal"
  },
  "schoolSettings": {
    "notifyOnStudentSignup": true,
    "notifyOnAssessmentComplete": true,
    "allowStudentSelfRegistration": false
  },
  "password": "SecurePassword123"
}
```

**Response:**

```json
{
  "success": true,
  "redirectUrl": "/school-admin"
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Failed to complete onboarding",
  "error": "Token expired or already used"
}
```

---

### Backend Implementation Notes

1. The `{token}` in the URL is the invitation token sent via email when a school is invited
2. After successful onboarding:
   - Set the school admin's password (hashed)
   - Update school status from `invited` to `active`
   - Create school admin user record with role `school-admin`
   - Store notification preferences in school settings
3. The token should be single-use and expire after completion

---

## Contact

For questions, contact the frontend team.
