# Cross-Role Recommendation Inbox — Design Spec

**Date:** 2026-06-24
**Branch:** `feat/recommendation-inbox` (off `develop`)
**Status:** Approved (design), ready for plan

## Problem

Letter-of-recommendation (LOR) functionality has a working **student request flow** and a fully-built **recommender-side backend** (PRs #160/#166), but the **recipient experience is missing or broken on every staff role**:

- **Teacher** — holds `recommendations:respond` but has **zero** recommendation UI.
- **School-admin** — no recommendation surface at all.
- **Counselor** — a page exists (`/counselor/recommendations`) but it is **orphaned** (no sidebar link) and has **no upload-letter UI**.
- **Coach** — no portal surface, and coaches are **not even requestable** as recommenders.
- **Letter upload UI is dead code on every role** — `uploadRecommendationLetter` (`frontend/src/services/recommendationService.ts:56`) has zero consumers. Today no recommender can upload a letter from any screen, so the "submit" path is effectively unreachable from the UI (`updateStatus` blocks submit unless a file already exists — `recommendationsService.ts:322`).

## What already exists (do not rebuild)

Recommender-side endpoints, mounted at `/api/v1/recommendations` (`api/src/index.ts:341`, `authenticate` + `tenantContext`). Authorization is **ownership-based** (`recommenderId === req.userId`), not role-gated:

| Method + Path | Purpose |
|---|---|
| `GET /received` | List requests addressed to me (`listReceived`, `recommendationsService.ts:175`, `where: { recommenderId, isActive }`) |
| `PUT /:id/respond` | Accept / decline (`respond`, svc:282; action `accept`/`decline`) |
| `PUT /:id/status` | Mark in_progress / submitted (`updateStatus`, svc:311) |
| `POST /:id/letter` | Upload completed PDF → S3, auto-flip to submitted (multer PDF-only, route:16-20; `uploadLetter`, svc:386) |
| `GET /:id/letter` | Download via short-TTL signed URL (`canAccessUser` gated, svc:439) |

Data model — `RecommendationRequest` (`api/prisma/schema.prisma:2797-2831`, `@@map("recommendation_requests")`):
`studentId`, `recommenderId` (**User FK, by userId — not email**), `status String @default("requested")` (plain string; values `requested, accepted, in_progress, submitted, declined`), `relationship?`, `requestMessage?`, `declineReason?`, `dueDate?`, `submittedAt?`, `letterFileKey?`, `letterFileName?`, `letterUploadedAt?`, audit cols. `@@unique([studentId, recommenderId])`, `@@index([recommenderId])`, `@@index([studentId])`.

Coach↔student link — `Booking` (`schema.prisma:620`, `@@map("bookings")`): `coachId`, `studentId`, `status BookingStatus`, `completedAt?`. `Coach` (`schema.prisma:553`) has `userId @unique` → the coach's `User`. So a coach's recommender identity = `Coach.userId`.

## Decisions (locked with user)

1. **"Move it on" = decline back to the student** (with a reason), which already exists as the `decline` action. **No new forward/reassign endpoint.**
2. **Full coach support** — coaches become first-class recommenders.
3. **Coach eligibility = booking relationship** — a student can request any coach they have a `Booking` with, regardless of school (coaches are not in the school-membership model). Same-school-staff path stays for counselor/teacher/school-admin.
4. **Permission tightening approved** — grant `recommendations:respond` to counselor, school_admin, coach (teacher already has it) and gate the four recommender endpoints with `requirePermission("recommendations:respond")`. Behavior-preserving; closes the currently-open routes.
5. **Coach inbox lives under `/dashboard/coaching`** (its existing portal shell), not a new `/coach` portal.
6. **Architecture = one shared inbox component mounted per portal** (not bespoke per-role pages).

## Backend changes

### B1 — Coach eligibility via booking
`recommendationsService.ts`:
- `searchStaff(studentId, search)` (svc:186) currently returns same-school staff (`roleName ∈ STAFF_ROLES`, same `schoolId`, active). Extend to **also** return coaches the student has a `Booking` with: resolve `Booking.findMany({ where: { studentId, isActive } })` → distinct `coachId` → `Coach.findMany` → their `userId` Users (active). Merge + dedupe by user id with the staff results; tag each row with `roleName`. Keep result shape `{ id, name, email, roleName }`.
- `create` (svc:80-88) currently requires the recommender to be active staff at the same school. Change the validation to: **valid if** (same-school staff in `STAFF_ROLES`) **OR** (a coach `User` with at least one `Booking` to this student). Reject otherwise (same error contract).
- Keep `STAFF_ROLES` as the same-school set; add a separate coach-eligibility check rather than putting `coach` in `STAFF_ROLES` (coaches are not same-school-scoped).

### B2 — Permissions
- `api/src/lib/auth.ts` — add `recommendations:respond` to `ROLE_PERMISSIONS` for `Counselor`, `SchoolAdmin`, `Coach` (Teacher already has it, auth.ts:110).
- `frontend/src/lib/permissions.ts` — mirror: add `Recommendations.Respond` to the `RolePermissionMap` entries for counselor, school_admin, coach.
- `api/src/routes/recommendations.ts` — add `requirePermission("recommendations:respond")` to `GET /received`, `PUT /:id/respond`, `PUT /:id/status`, `POST /:id/letter`. (Leave `GET /:id/letter` on its existing `canAccessUser` gate — students download too. Leave student-side routes unchanged.)

Service-layer ownership checks (`loadOwnedByRecommender`, svc:276) remain — permission gate is additive defense.

## Frontend changes

### F1 — Shared inbox feature
New shared component set at `frontend/src/components/recommendations/` (role-agnostic, imported by each portal page), consuming the existing endpoints + service functions:
- `RecommendationInbox` — fetches `GET /received` (new query hook), renders list grouped/sorted (pending + due-soon first), empty/loading/error states (reuse `QueryStateBoundary` from the student-pages stabilization work).
- `RecommendationActionMenu` — Accept, Decline (→ prompts for `declineReason`, this is "move it on"), Mark In Progress, Upload Letter, Download. Mirrors the existing counselor `ActionMenu.tsx:125-174` but adds upload.
- `UploadLetterDialog` — file picker (PDF), calls `uploadRecommendationLetter` (`recommendationService.ts:56` — currently dead), shows progress, invalidates the received query on success.
- `StatusBadge` — requested / accepted / in_progress / submitted / declined.

### F2 — Mount per portal (+ nav)
- **Teacher** — new `frontend/src/app/teacher/recommendations/page.tsx`; add nav item to `TeacherSidebar.tsx` (`getNavSections`, currently Dashboard + Evaluations only).
- **Counselor** — refactor existing `frontend/src/app/counselor/recommendations/page.tsx` to use the shared component (gains upload UI it lacks); add the missing sidebar link to `CounselorSidebar.tsx` (under Communication group).
- **School-admin** — new `frontend/src/app/school-admin/recommendations/page.tsx`; add nav.
- **Coach** — new `frontend/src/app/dashboard/coaching/recommendations/page.tsx`; add nav item to the coaching sidebar (`frontend/src/app/dashboard/coaching/_components`).

Brand tokens per role shell (admin blue `#065292` / role-appropriate). Reuse existing data-extraction + mutation patterns (`frontend-standards`).

## Out of scope

- Forward/reassign-to-colleague workflow (explicitly declined; "move on" = decline).
- New `/coach` portal scaffold (coach uses `/dashboard/coaching`).
- Changes to the student request UI beyond coaches now appearing in the picker (which is automatic once `searchStaff` returns them).
- LOR analytics/oversight dashboard changes (the existing `/dashboard` oversight endpoint is untouched).

## Testing & verification

- **Backend (vitest + tsc):** coach-eligibility path in `searchStaff` (booking match found / no booking → not eligible / cross-student booking → not eligible); `create` accepts coach-with-booking and same-school staff, rejects non-eligible; permission-gate tests (role without perm → 403, with perm → 200). IDOR: recommender acting on a request that isn't theirs → 404 (existing, regression-locked).
- **Frontend (jest + tsc + next build):** each shared component — list render, accept, decline-with-reason, upload happy + non-PDF/error path, status badge mapping, download.
- **Live Playwright (per role):** student requests a teacher **and** a coach they've booked → both appear in respective inboxes → accept → upload a PDF → status flips to submitted → student sees "submitted" and downloads. Fixtures: `test.counselor@formmaps.dev`, `test.teacher@formmaps.dev`, `test.schooladmin@formmaps.dev` (all `Test1234!`); a coach fixture + a booking between coach and a test student (seed or create).

## Critical files

- `api/src/services/recommendationsService.ts` — `searchStaff` (186), `create` (80), `STAFF_ROLES` (13), `loadOwnedByRecommender` (276).
- `api/src/routes/recommendations.ts` — add permission gates.
- `api/src/lib/auth.ts:101-113` — `recommendations:respond` to 3 more roles.
- `api/prisma/schema.prisma` — `RecommendationRequest:2797`, `Booking:620`, `Coach:553` (read-only; no schema change).
- `frontend/src/services/recommendationService.ts` — `uploadRecommendationLetter:56` (wire up), `listReceivedRecommendations`, `getRecommendationLetterUrl:64`.
- `frontend/src/lib/permissions.ts` — `RolePermissionMap`.
- `frontend/src/app/{teacher,counselor,school-admin}/...`, `frontend/src/app/dashboard/coaching/...` — portal pages + sidebars.
- Existing counselor LOR UI to mirror/refactor: `frontend/src/app/counselor/recommendations/_components/{RequestsTable,ActionMenu,StatusBadge}.tsx`.

## No schema change

`RecommendationRequest` and `Booking` already have every field needed (recommenderId, letter fields, booking student/coach link). **No migration in this slice.**
