# API Requirements for Student Onboarding

**Date:** 2026-02-06

To support the student onboarding flow where invited students click a link to set their password, the following API endpoints are required:

## 1. Verify Invitation Token

**Endpoint:** `GET /api/v1/student/onboarding/verify/{token}`
**Purpose:** Verify if the invitation token is valid and retrieve basic student info to display "Welcome, [Name]".
**Response (Success - 200):**

```json
{
  "isValid": true,
  "student": {
    "name": "John Doe",
    "email": "john@example.com",
    "avatar": "https://..." // optional
  }
}
```

**Response (Invalid/Expired - 400/404):**

```json
{
  "isValid": false,
  "message": "This invitation link is invalid or has expired."
}
```

## 2. Complete Onboarding (Set Password)

**Endpoint:** `POST /api/v1/student/onboarding/complete`
**Purpose:** Set the student's password and activate their account.
**Request Body:**

```json
{
  "token": "abc-123-xyz",
  "password": "NewStrongPassword123!"
}
```

**Response (Success - 200):**

```json
{
  "success": true,
  "token": "jwt_token_here", // Automatically log them in
  "user": {
    "id": "123",
    "name": "John Doe",
    "role": "student"
  }
}
```
