# Domain 7a: Video (Daily.co REST port) — Design

**Status:** approved by Federico 2026-07-30, ready for planning.
**Scope:** port `video.ts` (533 lines, `.NET` repo has zero Video code today) to `.NET` as a faithful
mechanical REST port — the low-risk, no-real-time half of Domain 7. Domain 7b (Messaging, the SignalR
architectural fork) is a separate, later brainstorm→spec→plan cycle per
[[reference-formmaps-migration-docs]] and the master sequencing design
(`2026-07-27-master-completion-sequencing-design.md`).

## Why split from Domain 7b

The roadmap treats Domain 7 (Messaging/Video) as one ~10–16-slice unit, but the two halves have wildly
different risk profiles: Video is pure REST session-lifecycle management around Daily.co (an external
video provider) with no real-time delivery of its own — the same shape as every domain already ported.
Messaging is the genuine SignalR architectural fork the roadmap flags as unresolved. Splitting lets Video
ship immediately using the established playbook while Messaging gets its own focused design cycle for the
harder hub/backplane decisions.

## What's actually in `video.ts` today

Pure REST lifecycle management around Daily.co rooms/tokens, backed entirely by the existing
`counselor_sessions` table (filtered `topic = "Video Call"`, `meetingLink != ""`) — **no new tables, no
WebSocket, no real-time signaling on the platform side** (Daily.co's client SDK handles WebRTC signaling
directly between browsers once each side has a room URL + token).

## Calendar-sync boundary (the one real complication)

`POST /sessions/schedule` and `POST /sessions/:id/cancel` both call
`syncRecordSafe("counselorSession", id, "upsert" | "cancel")` — a push to each participant's connected
Google/other calendar via `calendarSyncService.ts`. `counselor.ts`'s own `/me/sessions/:id/cancel` already
hit this exact boundary and was **deliberately left in Node** (`ICounselorSessionsRepository.cs`
doc-comment: *"cancel stays Node until/unless the calendar sync is ported as its own surface"*).

**Same call here:** `POST /sessions/schedule` and `POST /sessions/:id/cancel` stay in Node. The other 7
endpoints have no calendar-sync side effect and port cleanly.

## Components

- **`FormMaps.Application/Video`** — `IVideoSessionsRepository` (sibling to, not shared with,
  `ICounselorSessionsRepository` — different query/write shapes over the same table, same
  one-folder-per-legacy-route-file convention as `Resumes`, `Reports`, `Assessments`) + `IDailyClient`.
- **`FormMaps.Infrastructure/Video`** — `VideoSessionsRepository` (Postgres, via the existing
  `counselor_sessions` table) + `DailyClient : IDailyClient` (`HttpClient`, 15s timeout, matching the
  Node client's own `AbortSignal.timeout(15000)`).
- **`FormMaps.Api/Endpoints/VideoEndpoints.cs`** — minimal-API group at `/api/v1/video`, same shape as
  `CounselorSessionsEndpoints.cs`.
- **Infra:** new `DAILY_API_KEY` Secrets Manager secret + `RuntimeEnvironmentSecrets` entry in both
  `infra/aws/formmaps-api-staging-service.yml` and `infra/aws/formmaps-api-prod-service.yml` — today only
  `JWT_SECRET`/`DATABASE_URL` are wired through App Runner; this is the first third-party API key to join
  that list.
- **`frontend/next.config.ts`** — flag-gated rewrite entries, identical pattern to every prior slice
  (`shouldRouteXToDotnet()` + rewrite ahead of the `/api/:path*` catch-all), all flags default OFF.

## Rejected alternatives

- **Fold Video into the existing `Counselor` domain/repository.** Saves one folder but couples two
  independently-evolving query surfaces for no benefit — breaks the established convention.
- **`IVideoProvider` abstraction over Daily.co.** Speculative — nothing on the roadmap suggests a
  provider swap; no other domain in this migration uses this kind of abstraction layer. YAGNI.

## Routes and exact legacy semantics

| Route | Ticket | Access check | Behavior |
|---|---|---|---|
| `GET /enabled` | FM-091 | `requireSchoolMembership` (no membership → `{enabled:false}`, not an error) | Reads `school.videoCallsEnabled`. |
| `GET /sessions` | FM-092 | Participant-only (`counselorId` or `studentId` = caller) | Lists caller's video-call sessions (`topic="Video Call"`, `meetingLink != ""`), desc by `startTime`, take 50. |
| `GET /sessions/:id` | FM-093 | Participant-only, else 403 | Single session detail for joining. |
| `POST /signature` | FM-094 | Session must exist + caller must be a participant; school must have `videoCallsEnabled` if caller has a school | Creates/gets a Daily.co room (idempotent — "already exists" error is swallowed, falls back to the deterministic `formmaps.daily.co/{roomName}` URL) + a meeting token (`is_owner` = counselor). `503` if `DAILY_API_KEY` unset; `502` if Daily.co returns no token. |
| `POST /sessions` | FM-095 | Role gate: `counselor`/`school_admin`/`super admin` only. Non-super-admin: same school + (if counselor) an active `counselorStudentAssignment`. Denials return 404 "Participant not found" — existence-oracle-safe, not 403, mirroring the rest of this migration. | Creates an ad-hoc session, `status="video_active"`, 1hr default window, random `formmaps-{hex}` session name. |
| `POST /sessions/:id/end` | FM-096 | Participant-only | Sets `status="completed"`, stamps `completedAt`/`endTime`. |
| `POST /sessions/:id/start` | FM-097 | Participant-only, and `status` must currently be `"scheduled"` (400 otherwise) | Sets `status="video_active"`, restamps `startTime`. |
| `POST /sessions/schedule` | — not ported | — | Stays Node (calendar-sync). |
| `POST /sessions/:id/cancel` | — not ported | — | Stays Node (calendar-sync). |

## Flags

**Correction (caught during plan-writing, not the original brainstorm):** the spec's first draft grouped
FM-092 (`GET /sessions`) with FM-093 (`GET /sessions/:id`) as "both read-only," and put FM-095
(`POST /sessions`) under its own flag. That's wrong. Next.js `rewrites()` matches by **path, not
method** — `GET /sessions` and `POST /sessions` are the *same literal path* on the frontend rewrite, so
they are forced to co-flip under one flag regardless of grouping intent, exactly like `resume.ts`'s own
documented `GET/POST /` "co-flip, path-not-method" precedent. `GET /sessions/:id` has its own distinct
path (`/sessions/:id` vs `/sessions`) and is unaffected — it gets its own flag.

| Flag | Covers |
|---|---|
| `FORMMAPS_ROUTE_VIDEO_ENABLED_TO_DOTNET` | FM-091 (`GET /enabled`) |
| `FORMMAPS_ROUTE_VIDEO_SESSIONS_TO_DOTNET` | FM-092 (`GET /sessions`) + FM-095 (`POST /sessions`) — forced co-flip, shared path |
| `FORMMAPS_ROUTE_VIDEO_SESSION_DETAIL_TO_DOTNET` | FM-093 (`GET /sessions/:id`) |
| `FORMMAPS_ROUTE_VIDEO_SIGNATURE_TO_DOTNET` | FM-094 (isolated — the actual external-call risk surface) |
| `FORMMAPS_ROUTE_VIDEO_SESSION_LIFECYCLE_TO_DOTNET` | FM-096 (`POST /sessions/:id/end`) + FM-097 (`POST /sessions/:id/start`) — distinct paths, grouped by choice (same risk profile) |

All default OFF.

## Error handling

Matches this migration's established conventions throughout: access-denial on participant-scoped reads
uses 403 (legacy's own behavior here, not 404 — `video.ts` uses 403 for session access, unlike
`resume.ts`'s existence-oracle-safe 404s; **preserved as-is, not "fixed"**, since these sessions aren't a
cross-user-viewable-by-privileged-roles surface the way resumes are — every route here is strictly
participant-only). `POST /sessions` and `/sessions/schedule`'s role/assignment denials use 404
("Participant not found") specifically, matching legacy. Daily.co failures degrade the way legacy does:
missing key → 503, room-exists races → deterministic URL fallback, missing token → 502. Unhandled
exceptions → generic 500, never leak `err.Message`.

## Testing

Same three-tier pattern as every prior slice:

- Unit tests: `DailyClient` (room-exists fallback, timeout, missing-key path), the session-lifecycle
  status-transition guards (`start` requires `scheduled`).
- Testcontainers integration tests against real Postgres for `VideoSessionsRepository`.
- Endpoint tests (faked repository/client) covering each route's status-code matrix, including the
  participant-only 403 paths and the role/assignment-gated 404 paths on `POST /sessions`.
- Dedicated adversarial access-control review before merge (participant-only reads, role-gated create,
  cross-school isolation via the counselor-assignment check) — same rigor Phase F's Fork 1 used, since
  this is participant-scoped session data.

## Rollout

Lands as **local commits only** — no push, no PR, no staging deploy, no flag flip, per this project's
standing convention ([[feedback-push-deploy-caution]]). All 5 new flags default OFF. Push/deploy/flag-flip
remain separate, explicitly-confirmed decisions made later and one at a time.

## Self-review

- **Placeholders:** none — every ported route has a named legacy counterpart, an exact access-check, and
  a concrete flag assignment. The 2 unported routes are explicitly justified, not silently dropped.
- **Consistency:** the participant-only-403 (not existence-oracle-404) behavior is stated once and applies
  uniformly across every route in this slice — no route in `video.ts` mixes the two patterns the way
  `resume.ts` does between its GET and PUT/DELETE.
- **Scope:** one bounded unit, small enough for a single implementation plan (7 endpoints, 1 new
  repository, 1 new external client, 1 new secret).
- **Ambiguity:** resolved the one open design question (calendar-sync scope) explicitly, with the
  `counselor.ts` precedent cited as the deciding factor.
