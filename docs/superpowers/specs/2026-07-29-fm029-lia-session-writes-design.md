# FM-029: LIA Session Write Lifecycle — .NET Port Design

**Status:** approved by Federico 2026-07-29, ready for planning.
**Scope:** the full LIA assessment session write surface — 7 endpoints sharing one `lia_assessment_sessions` row — cut over to `.NET` together under one flag. Corrects the original manifest's FM-029 scope (which only covered `/complete`) after discovering the other 6 write endpoints share the same row and would otherwise split ownership.

## Why this is bigger than a normal cutover

Every prior write-coupled domain in this migration had disposable fixtures or simple CRUD. This one:
- Shares one row across 7 endpoints, several of which mutate overlapping fields (`status`, `currentSubtest`, `currentItem`, `subtestTimes`).
- Was extended by a separate, more recent session (2026-07-25/26, the Madhav client-fix wave) with reentry-lock + server-authoritative-timer logic that went through **3 real bug-fix rounds in Node itself**: an atomic-counter race (concurrent `/start` calls undercounting strikes), a live-clock-reset bypass (re-`startSubtest` on a running subtest zeroed the clock and strikes), and an ended-subtest rewind bypass (restarting an ENDED subtest rewound state and destroyed the audit trail).
- Is the first slice where real students could be actively mid-session when the flag flips — every prior slice was either pure reads or touched disposable/empty data.
- The `.NET` side currently has zero knowledge of any of this (confirmed via grep — no `reentryCount`/`lockedAt` anywhere in the .NET codebase).

## Real scope: 7 endpoints, not 4

The original roadmap entry said "port /complete, Node still owns /start/answer/timeout." Reading the legacy service in full surfaced 3 more write endpoints on the same row that would otherwise stay split forever:

| Route | Service fn | Status |
|---|---|---|
| `POST /lia/start` | `startSession` | dark |
| `POST /lia/session/:id/practice/answer` | `submitPracticeAnswer` | dark |
| `POST /lia/session/:id/subtest/start` | `startSubtest` | dark |
| `POST /lia/session/:id/answer` | `submitAnswer` | dark |
| `POST /lia/session/:id/timeout` | `handleTimeout` | dark |
| `POST /lia/session/:id/violations` | `saveViolations` | dark |
| `POST /lia/session/:id/complete` | `completeSession` | dark (confirmed — no Vercel flag exists despite the manifest's FM-DOTNET-029 entry) |

Also moves with the writes (their lazy-expiry logic depends on the same row): `GET /lia/access`, `GET /lia/session/:id`, `GET /lia/session/:id/practice`.

## Data model

No new Postgres columns — everything already exists from the Node-side Wave 1 migration (`reentryCount`, `lockedAt`, `flagForReview`, `lockdownViolations`, `currentSubtest`, `currentItem`, `practiceCompleted`, `subtestTimes`, `language`, `startedAt`, `deviceInfo`). Just new C# read/write mapping in the existing `SessionRow` shape (currently only carries completion-relevant fields).

## Components

One extended `LiaSessionWriter` class (matches this migration's one-writer-per-slice convention — `VocationalWriter.cs` already holds 2 recompute methods; Node's own equivalent file is 662 lines for this exact scope, so a larger file here is expected, not a smell).

New public methods, each opening its own `FOR UPDATE`-locked writable session like `CompleteAsync` already does:
- **`StartAsync`** — reentry-lock gate via atomic `UPDATE ... SET reentry_count = reentry_count + 1 RETURNING reentry_count` (single statement, not read-modify-write — this is the direct port of Node's first bug fix; a read-then-write can't reintroduce the race because there's no read step to race on), threshold check on the returned value, then expiry-check, then resume-in-place or fresh-create.
- **`StartSubtestAsync`** — one-shot clock guard as a `WHERE` predicate on the same statement that writes `subtestTimes` (`WHERE subtest_times->@subtest->>'startedAt' IS NULL`), rejecting both live and ended sessions in one atomic check — directly ports Node's second and third bug fixes as a single SQL guard instead of two separate application-level checks, which is a strictly stronger guarantee than Node's own fix (SQL-atomic vs. read-then-conditional-write).
- **`SubmitPracticeAnswerAsync`**, **`SubmitAnswerAsync`**, **`HandleTimeoutAsync`**, **`SaveViolationsAsync`** — direct ports of their Node counterparts.

Shared private helpers, named 1:1 with Node's for cross-audit: `ExpireIfPastDeadlineAsync`, `ApplyTimeoutAsync`, `AdvancePastSubtestAsync`, `RecordSubtestEndAsync`. Called from `StartAsync`, `SubmitAnswerAsync`, and the 3 reads (`GetAccessAsync`/`GetSessionAsync`/`GetPracticeQuestionsAsync` — these need porting too, since a read staying on Node while writes move to `.NET` would serve stale past-deadline state the write side already knows is expired).

## Rollout

One flag: `FORMMAPS_ROUTE_LIA_SESSION_TO_DOTNET`, gating all 7 writes + the 3 reads above together. No existing flag to reconcile with — confirmed `/complete` was never actually flipped despite manifest FM-DOTNET-029 marking it "completed" (code-complete only).

Flip during a verified-quiet window: query `SELECT count(*) FROM lia_assessment_sessions WHERE status='in_progress' AND updated_at > now() - interval '1 hour'` immediately before flipping — proceed only on zero rows. Real-auth gate uses a disposable canary session (fresh `startSession` call through the full lifecycle to `complete`), never real student data.

## Testing

Port Node's exact 3 caught bugs as red-if-regressed C# tests before anything else:
1. Concurrent `Task.WhenAll` of N `StartAsync` calls on the same locked session → exactly N strikes counted, not fewer (proves the atomic increment, not a race-prone read-modify-write).
2. Re-`StartSubtestAsync` on a still-live subtest → rejected, clock/strikes unchanged.
3. Re-`StartSubtestAsync` on an ended subtest → rejected (the bug Node's fix #2 initially missed).

Plus ordinary coverage for each endpoint's happy path and the shared expiry/timeout logic, mirroring Node's own test file structure.

## Self-review

- **Placeholders:** none — every method has a named Node counterpart and a concrete SQL/guard shape.
- **Consistency:** flag name, method names, and helper names used identically across all sections.
- **Scope:** appropriately sized for one implementation plan — one writer class extension, one flag, no cross-cutting changes elsewhere.
- **Ambiguity:** resolved the one open question (which reads move with the writes) explicitly above rather than leaving it implicit.
