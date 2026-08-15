# Calendar Integration — Design (2026-06-06)

User-level Google Calendar + Outlook integration for all roles, with one-way
push sync of coach bookings and counselor sessions. Approved approach: B
(user-level service). Replaces the never-configurable coach-only OAuth flow.

## Context

- Existing `/api/v1/coach/auth/*` OAuth flow (api/src/routes/calendar.ts:77-303)
  is real but coach-only (tokens on `Coach.calendarIntegrations`), stores
  tokens in plaintext, has no refresh and no event sync, and 404s for
  students/counselors (the panel renders for all three roles).
- No OAuth credentials have EVER been configured (api/.env has zero
  GOOGLE_/OUTLOOK_ vars) → zero connected rows exist anywhere → no migration.
- `user_settings.calendarIntegrations` JSON column already exists (schema line
  ~357) — the natural user-level home.
- `Booking` and `CounselorSession` have identical sync-relevant shapes
  (startTime/endTime/topic/meetingLink/status/cancellation fields).

## Decisions (user-approved)

1. **Credentials**: user creates Google Cloud OAuth client + Azure app
   registration following repo instructions (docs/integrations/calendar-
   oauth-setup.md, produced as part of this work). Build + unit-test against
   the wire contract now; live E2E once 4 values land in api/.env.
2. **Roles**: all authenticated roles may connect (storage:
   `user_settings.calendarIntegrations`).
3. **Sync**: one-way push, platform → calendar, for Booking and
   CounselorSession create/cancel/reschedule. No free/busy read (later).
4. **Providers**: Google + Outlook now, behind an abstraction (one new file
   per future provider).

## Data model (additive only)

`user_settings.calendarIntegrations` per-provider value:

```json
{
  "google": {
    "connected": true,
    "email": "user@gmail.com",
    "connectedAt": "ISO",
    "expiresAt": 1740000000000,
    "encryptedTokens": "<base64 iv.tag.ciphertext of {accessToken, refreshToken}>",
    "lastSyncError": "optional string"
  },
  "outlook": { "connected": false }
}
```

- Tokens AES-256-GCM encrypted with env `CALENDAR_TOKEN_KEY` (64 hex chars).
  Decrypted only inside the integration service; NEVER in API responses or
  logs.
- New columns: `bookings.calendarEventIds Json @default("{}")` and
  `counselor_sessions.calendarEventIds Json @default("{}")` shaped
  `{ "<userId>": { "google": "<eventId>", "outlook": "<eventId>" } }`.
- `Coach.calendarIntegrations` no longer read or written (column stays;
  dropping is non-additive and there is nothing in it).

## API surface

New route file `api/src/routes/user-calendar.ts`, mounted at
`/api/v1/calendar`. Old `/api/v1/coach/auth` mount and
api/src/routes/calendar.ts OAuth section are DELETED (academic-calendar
endpoints, if co-located, stay wherever they live today).

| Endpoint | Auth | Behavior |
|---|---|---|
| `GET /:provider/url` | any role | `{url}`; when env creds missing → `{configured:false}` 200 (panel hides/disables) |
| `GET /:provider/callback` | none (state-protected) | validates signed state, exchanges code, stores encrypted tokens in user_settings, redirects `FRONTEND_BASE_URL<returnTo>?calendar=connected|error` |
| `GET /:provider/status` | any role | `{configured, connected, email, connectedAt}` — no tokens |
| `DELETE /:provider/disconnect` | any role | best-effort revoke at provider; clears provider entry |

- `:provider` Zod-validated ∈ {google, outlook}.
- `state` = JWT signed with JWT_SECRET, `{userId, provider, returnTo, nonce}`,
  10-minute expiry → CSRF + cross-account replay protection. `returnTo` is
  sanitized (same rules as login redirect: relative, known-portal).

## Services (api/src/services/)

- `calendar/tokenVault.ts` — encrypt/decrypt (AES-256-GCM, key from
  CALENDAR_TOKEN_KEY; throws at startup-use if key missing/malformed).
- `calendar/providers/types.ts` — `CalendarProvider` interface:
  `getAuthUrl(state)`, `exchangeCode(code)`, `refresh(refreshToken)`,
  `createEvent(accessToken, event)`, `updateEvent(accessToken, eventId,
  event)`, `deleteEvent(accessToken, eventId)`; `CalendarEvent` =
  `{title, description, location, start, end}` (ISO strings, UTC).
- `calendar/providers/google.ts` — raw fetch against
  accounts.google.com / oauth2.googleapis.com / www.googleapis.com/calendar/v3.
  Scope: `https://www.googleapis.com/auth/calendar.events` only.
- `calendar/providers/outlook.ts` — raw fetch against
  login.microsoftonline.com (common tenant) / graph.microsoft.com/v1.0.
  Scopes: `Calendars.ReadWrite offline_access`.
- `calendar/calendarIntegrationService.ts` — user-level connect (store after
  exchange), getStatus, disconnect, `getValidAccessToken(userId, provider)`
  (auto-refresh when `expiresAt` within 60s; persist rotated tokens; refresh
  failure → `connected:false` + `lastSyncError`, return null).
- `calendar/calendarSyncService.ts` —
  `syncRecord(kind: "booking"|"counselorSession", record, action:
  "upsert"|"cancel")`: for each participant userId with a connected provider,
  create/update/delete the event on THEIR calendar; persist/remove event IDs
  in the record's `calendarEventIds`. Fire-and-forget from caller's
  perspective: every failure is caught, logged (no PII), and recorded as
  `lastSyncError`; never throws into the booking flow.
- Hook sites (one-line `void calendarSyncService.syncRecord(…)` after the DB
  write commits):
  - `coachBookingsService.ts`: createBooking (~:64), cancelBooking (:118 →
    cancel), rescheduleBooking (:130 → upsert).
  - `routes/counselor.ts`: session create (:404 → upsert), cancel (:330 →
    cancel), reschedule/update (:448 → upsert).
  - `routes/video.ts`: counselorSession create (:219, :393 → upsert),
    update (:316, :452 → upsert if times changed) — verify each site's
    semantics during implementation; completed-status updates do NOT sync.

Event content (no cross-party attendee invites — each participant gets the
event on their own calendar only):
- title: `Coaching session — {topic||"Coaching"}` / `Counseling session —
  {topic||"Counseling"}`
- start/end from the record; description includes the meeting link;
  location = meetingLink.

## Frontend

- `calendarService.ts` becomes the single OAuth-integration service →
  `/api/v1/calendar/*`; duplicate functions in `coachService.ts` deleted;
  `CalendarSyncStep` (coach onboarding) and `CalendarIntegrationPanel` use it.
- `CalendarIntegrationPanel` states: not-configured (info note, no buttons),
  disconnected (Connect buttons), connected (provider email + Disconnect),
  reconnect-needed (`connected:false` after refresh failure → "Reconnect"
  + warning copy). On mount with `?calendar=connected|error` → status refetch
  + success/error toast, param stripped from URL.
- Fixes batch-13 finding: students/counselors no longer hit coach-only 404s.

## Env / config

Added to api/.env.example (and setup doc):
```
GOOGLE_CLIENT_ID=  GOOGLE_CLIENT_SECRET=
OUTLOOK_CLIENT_ID= OUTLOOK_CLIENT_SECRET=
CALENDAR_TOKEN_KEY=   # 64 hex chars; openssl rand -hex 32
API_PUBLIC_URL=http://localhost:3002   # redirect URIs derive: {API_PUBLIC_URL}/api/v1/calendar/{provider}/callback
```
`docs/integrations/calendar-oauth-setup.md`: exact Google Cloud Console and
Azure portal steps + the redirect URIs for dev and prod (App Runner URL).

## Security

- Tokens encrypted at rest; absent from responses, logs, and error messages.
- Signed short-lived state (CSRF + account-swap protection); `returnTo`
  sanitized.
- Minimal scopes (events-only on Google).
- Provider HTTP errors surface as fixed strings; raw bodies only to logger.
- security-reviewer agent pass on the final diff is a ship gate.

## Testing & verification gates

- Unit (api jest/vitest): tokenVault roundtrip + tamper rejection; each
  provider's URL shape, exchange/refresh request bodies, event CRUD payloads
  (mocked fetch); integration service refresh/expiry/failure transitions;
  sync service (event IDs persisted, per-user isolation, failures contained);
  route tests (auth required, provider validation, bad/expired state rejected,
  unconfigured → `configured:false`).
- Live without creds: panel states for student/counselor/coach, no 404s,
  graceful unconfigured.
- Live with creds (user pastes env): Google E2E — connect → book → event in
  real calendar → reschedule → updated → cancel → removed; refresh path;
  disconnect. Outlook same flow.
- tsc both dirs; full suites; security-reviewer PASS.

## Out of scope (logged)

- Free/busy availability blocking (potential phase 2).
- Apple/CalDAV (one provider file each, later).
- Dropping `Coach.calendarIntegrations` column (non-additive; do in a future
  migration window).
- Cross-party calendar invites (deliberate privacy choice, not a gap).
