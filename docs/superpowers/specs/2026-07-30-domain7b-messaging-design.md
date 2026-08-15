# Domain 7b: Messaging (SignalR real-time rebuild) — Design

**Status:** approved by Federico 2026-07-30, ready for planning.
**Scope:** the genuine architectural fork of Domain 7 (split from 7a/Video, which shipped as a plain
REST port — see [[reference_formmaps_migration_docs]] and
`2026-07-27-master-completion-sequencing-design.md`). Port `formmaps-platform/api/src/routes/messages.ts`
(586 lines) to `.NET`, and — per Federico's 2026-07-27 decision — add a real SignalR hub for live
message-arrival push, replacing the frontend's current 15-second `setInterval` poll. This is the largest
remaining net-new build in the migration: no prior .NET real-time infra exists to build on.

## Feature scope (settled 2026-07-30)

Three questions were open going into this design; all resolved toward the smallest net-new surface:

1. **Hub delivers live message-arrival push only** — no presence, no typing indicators. Matches
   current Node behavior (send/receive/read); the "SignalR" decision settled the transport, not new
   features.
2. **No Redis/ElastiCache.** Prod runs on App Runner (auto-scaling, no documented sticky-session
   support) and this stack has zero Redis infra today. A naive in-memory SignalR hub breaks past one
   instance — so `formmaps-api-prod`'s App Runner autoscaling max is pinned to **1 instance** for the
   duration of this feature's dark/early-live rollout (an ops change, not code, tracked at cutover
   time). Redis is deferred until real multi-instance traffic proves it's needed.
3. **Broadcast stays exactly as-is** — REST-created rows + the existing `notificationOutboxService.ts`
   async-email path. No hub involvement. A one-to-many announcement isn't time-sensitive the way a 1:1
   conversation reply is.

## What's actually in `messages.ts` today

Pure REST + client-side polling — **no WebSocket exists today**, despite the "real-time" framing anyone
might assume from the feature name. 7 routes: `GET /unread-count`, `GET /contacts`, `GET /conversations`,
`POST /conversations` (create/send-first-message), `GET /conversations/:id`, `POST /conversations/:id`
(send message), `POST /broadcast`. Two tables, both simple 1:1 (no group chat): `Conversation`
(`participantAId`/`participantBId`, unique pair) and `Message` (`conversationId`, `senderId`, `content`,
`readAt`). Frontend polls both the conversation list and the open thread every 15s
(`frontend/src/app/dashboard/messages/page.tsx`).

## Components

- **`FormMaps.Application/Messaging`** — `IMessagesRepository` (7 REST operations, same
  one-folder-per-legacy-route-file convention as `Video`/`Resumes`/`Reports`) + `IMessagesRealtimeNotifier`
  (one method: notify a user id of a new message). The notifier interface lives in Application so the
  write path doesn't depend on SignalR directly — mirrors this codebase's existing pattern of only
  triggering a side effect (audit event, in LIA's case) *after* the DB commit succeeds.
- **`FormMaps.Infrastructure/Messaging`** — `MessagesRepository` (Postgres, ADO.NET raw SQL, matching
  every other domain) + `SignalRMessagesNotifier : IMessagesRealtimeNotifier`, a thin wrapper over
  `IHubContext<MessagesHub>`.
- **`FormMaps.Api/Endpoints/MessagesHub.cs`** — the actual `Hub` class. JWT-authenticated via the same
  bearer-token pipeline as every REST endpoint (ASP.NET Core SignalR supports the standard
  `Authorization` header on the initial handshake). One server→client method: `messageReceived(payload)`.
  No client→server hub methods — sending a message still goes through the REST endpoint, not the hub;
  the hub is push-only.
- **`FormMaps.Api/Endpoints/MessagesEndpoints.cs`** — minimal-API group at `/api/messages`, same shape
  as every other domain's endpoints file.
- **`frontend`** — swap the 15s poll for a persistent connection via the `@microsoft/signalr` npm
  package (new dependency) once the flag is on. REST still serves conversation list/history reads and
  the initial load; the hub only pushes live updates while connected. Same
  `shouldRouteXToDotnet()` + flag-gated rewrite pattern as every prior slice for the REST half; the hub
  connection itself is separately flag-gated (no point connecting a socket the backend can't yet serve).

## Data flow

- **Send:** client `POST /conversations/:id` → `.NET` writes the `Message` row → commits → notifier
  calls `hub.Clients.User(recipientId).SendAsync("messageReceived", payload)` if the recipient has a
  live connection → REST response returns to the sender exactly as today, unaffected by whether the
  push succeeded.
- **Receive (live):** connected recipient's client gets the pushed payload, updates the conversation
  list + open thread without a poll.
- **Receive (reconnect/offline):** client reconnect triggers a normal REST refetch to pick up anything
  missed while disconnected. No message-replay/ack protocol, no delivery guarantee beyond "eventually
  consistent via the next REST load" — YAGNI given the feature scope is live-arrival convenience, not
  guaranteed real-time delivery.
- **Broadcast:** entirely unchanged — REST-created, outbox email, no hub.

## Error handling

- A hub push failure (dropped connection mid-flight, hub exception) must **never** fail the send — the
  notifier call happens strictly after the DB commit and is isolated (try/catch swallowing, logged) from
  the REST response path.
- Hub auth failure (expired/invalid JWT on connect) → standard SignalR connection rejection; client
  falls back to poll-free but still-functional REST (degrades to "no live push," not "broken").

## Testing

- REST endpoints: same Testcontainers integration-test pattern as every other domain (real Postgres,
  real auth pipeline).
- Hub: unit-test `SignalRMessagesNotifier` against a mocked `IHubContext<MessagesHub>` — no real
  SignalR client spun up in tests, matching this codebase's preference for testing at the interface
  boundary rather than through the transport.
- No new e2e infra required beyond what already exists.

## Rejected alternatives

- **Presence/typing indicators.** Real feature work with no Node precedent and no current user-facing
  gap being filled — explicitly out of scope per Federico's 2026-07-30 decision.
- **Redis backplane now.** New infra, new cost, new failure mode, before any evidence multi-instance
  scale is actually needed for this feature. Single-instance pin is reversible and far cheaper to stand
  up; Redis stays a future decision if real traffic demands it.
- **Broadcast over SignalR.** Would add hub fan-out complexity (hundreds of simultaneous pushes) for a
  use case (school-wide announcements) that isn't time-sensitive and already has a working async path.
- **Hub methods for reads/sends (fully hub-driven, no REST for messaging).** More SignalR-idiomatic but
  a much bigger rewrite and a bigger departure from every other domain's REST-port pattern, for no
  concrete benefit given the settled push-only scope.
