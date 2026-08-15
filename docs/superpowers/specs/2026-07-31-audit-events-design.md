# Audit-Events Domain — persistent audit trail for the .NET service

**Status:** proposed, not yet planned/implemented
**Part of:** FormMaps Node→.NET migration epic (TIMSInternational/formmaps#4) — has no dedicated
child issue yet (see Open items); planned as domain #2 in `docs/migration/dotnet-implementation-plan.md`
and repeatedly deferred since (see "Why now" below).
**Date:** 2026-07-31

## Scope

Build a new, .NET-owned, cross-domain **persistent audit event store** — table, write abstraction,
and a permission-gated read endpoint — and retrofit it into every write path that already claims to
emit "PII-free audit" today but in fact only writes a structured log line (see "What already exists"
below; this is not a from-scratch greenfield problem, it's closing a gap between a claim already made
in six shipped files and what those files actually do).

**In scope for v1:**
- `audit_events` table: new, immutable, RLS-bypass-only, PII-free-by-construction schema.
- `IAuditEventWriter` abstraction (Application) + `AuditEventWriter` (Infrastructure) — fail-soft-but-alert
  write path, following the `BillingShadowRepository` (Domain 9a) convention for system-owned,
  non-tenant-scoped writes.
- `IAuditEventReader` + `AuditEventReader` — paginated, filterable cross-tenant read.
- `GET /api/v1/audit/events` — permission-gated read endpoint.
- Retrofit: wire `IAuditEventWriter` into the 7 existing writer classes that currently emit
  `audit.*`-prefixed structured log lines only (`LiaSessionWriter`, `PersonalitySessionWriter`,
  `TestScoreWriter`, `VocationalWriter`, `PcaExamWriter`, `Question360Writer`,
  `EvaluationExternalService`) so those events are actually persisted, not just logged.
- Immutability enforcement (`REVOKE` + `ENABLE ALWAYS` trigger) built in from day one.
- `formmaps_dotnet_svc` least-privilege role grant update for the new table.

**Explicitly out of scope for v1 (mirrors how Domain 9a explicitly excluded booking payments):**

- **AuthN success/failure and authZ-denial audit.** SOC2 auditors ask for this, but .NET has no
  login endpoint of its own yet — JWTs are issued by legacy Node and merely *validated* by
  `LegacyJwtRequestContextFactory`. There is no "authentication happened" event to hook in .NET
  until Domain 10 (Auth) exists. AuthZ-denial audit (the many `context.Permissions.Contains(...)`
  403 checks and `IProtectedRequestGuard` denials scattered across ~60 endpoint files) is a real,
  separate, higher-volume design decision — request-rate implications, what counts as "denial"
  noise vs. signal, whether anonymous 401s are even worth persisting — that deserves its own scoping
  pass, not a bundled add-on here. **Domain 10 dependency, not this domain's job.**
- **New admin-mutation wiring** for endpoints that exist today with **zero** audit trail, not even a
  log line: `SchoolAdminEndpoints` (assessment config/schedule changes, 360 setup),
  `SchoolUsersEndpoints` (grade-level changes, counselor student-assignment add/remove). Retrofitting
  the 7 files above is a mechanical "the audit intent already exists, wire it to persistence" change;
  wiring these is new design work (deciding what metadata each mutation should carry) and is left as
  a fast-follow, tracked separately.
- **Domain 9a's live billing-state-change audit.** Domain 9a is shadow-mode-only today (writes to
  `shadow_*` tables, never live `user_subscriptions`). Its own spec already names this domain as a
  dependency for its post-cutover admin-visible actions (plan changes, cancellations) — that wiring
  happens when 9a reaches its own cutover/admin-surface task, consuming the `IAuditEventWriter` this
  domain delivers. Not blocking, not duplicated here.
- **TIMS-interop audit events.** `docs/api/security.md` requires "both systems record audit events"
  for TIMS ATS data-sharing. Grepped: no TIMS-interop write endpoints exist in `.NET` yet (only
  `docs/interop/` planning docs). Nothing to wire. Flagged as an open item, not designed here.
- **Changes to legacy Node's own `audit_logs` table/write path.** Untouched. Stays exactly as-is
  until Domain 11 (Retire Node). This spec adds a **second, separate**, .NET-owned table — it does
  not migrate or dual-write into legacy's table.
- **Real alerting integration** (PagerDuty/Slack/etc.) for audit-write failures. No alerting channel
  exists anywhere in this repo yet (the exact same stated gap Domain 9a's `BillingReconciliationWorker`
  already lives with). v1 delivers a structured, greppable `Error`-level log line
  (`audit.write_failed`) an ops dashboard can be wired to later — not a live page.
- **Frontend/UI.** Backend-only, matching how Domain 7b shipped backend-first. No task in the
  companion plan touches `apps/web`.
- **GDPR/retention interaction beyond stating the decision.** Legacy's GDPR hard-delete
  (`gdprDeleteUser`) does not touch `audit_logs` — rows outlive their subject. `audit_events` follows
  the identical policy, deliberately, for the identical reason (an audit trail that disappears when
  its subject is deleted is not an audit trail). No delete/purge job is built in v1.

## Why now (this has been deferred three times already)

This is not a new idea — it is the **second** domain in the originally planned migration order
(`docs/migration/dotnet-implementation-plan.md`: "1. platform health, context, audit"), was
explicitly scheduled in the Federico-approved master sequencing design
(`docs/superpowers/specs/2026-07-27-master-completion-sequencing-design.md`, Phase 2: "Persistent
audit log slice... after Wave 2's first 2 cutovers") and never executed, and appears as a standing
open cross-cutting item in `docs/migration/completion-roadmap.md` and `docs/migration/cutover-matrix.md`
under every phase since. The 2026-07-31 SOC2/ISO gap-assessment (issue #9) makes it concrete again:
**.NET has zero persisted audit records anywhere**, despite six shipped files already claiming to
emit "PII-free audit" events for exactly this reason.

## Why this needs its own design (not just another dark-flag port)

Every mechanical-port domain in this migration copies an existing legacy behavior faithfully. This
domain has **no legacy .NET precedent to copy** (there is no `AuditEvent`/`AuditLog` type anywhere in
`services/api/src` — confirmed by exhaustive grep) and only a thin, non-comprehensive legacy Node
precedent (`audit_logs`, 3 call sites total, see below) that is itself a known-weak reference
implementation, not a target to replicate. The design decisions below (RLS-bypass-only access,
built-in immutability, PII-free-by-construction schema) are new judgment calls this spec has to make
explicitly, because this is compliance-critical infrastructure a SOC2 auditor will read directly —
hand-waving any of them is not acceptable.

## Key existing-codebase facts this plan depends on

### Legacy Node's `audit_logs` — real, but thin, and its read endpoint is dead code

- Table: `AuditLog` Prisma model, `audit_logs` (`formmaps-platform/api/prisma/schema.prisma:2591-2609`).
  `id, actorId, actorEmail, action (free text), resourceType, resourceId?, details (json), ipAddress?,
  isActive, createdDate, updatedAt`.
- Write helper: `auditLog(...)` in `api/src/services/adminService.ts:214-218` — **fire-and-forget,
  fail-soft**: wrapped in try/catch, `logger.warn` on failure, never blocks the parent request.
- **Only 3 call sites ever**: `USER_DATA_EXPORT`, `USER_GDPR_DELETE`, `UGC_REPORT` (the only one
  that also captures `ipAddress`). No coverage for login, authz denials, role changes, flag flips,
  billing admin actions, or the ~20 other admin write endpoints.
- **No RLS at all** — `audit_logs` is explicitly classified as a "global catalog/reference" table in
  `api/prisma/rls/005-sensitive.sql:9`, no `ENABLE ROW LEVEL SECURITY` anywhere for it. Access
  control is *entirely* one route's `requirePermission("admin:settings")` check.
- **That permission gate is unreachable.** `requirePermission("admin:settings")` guards both
  `GET /api/v1/admin/audit-logs` and `GET /api/v1/admin/storage/stats` (`api/src/routes/admin.ts:233,269`)
  — but grepping `ROLE_PERMISSIONS` in `api/src/lib/auth.ts:52-148`, **no role, including Super Admin,
  has `"admin:settings"` in its permission list** (Super Admin has `admin:dashboard`, `admin:users`,
  `admin:schools`, `admin:roles`, `admin:plans`, `admin:payouts`, `admin:coaches` — not `admin:settings`).
  Legacy's own audit-log read route is, today, unreachable by any authenticated role. This is a
  reason NOT to port that exact gating pattern (see "Read-access model" below).
- **No immutability control** — a plain mutable table, no `REVOKE`, no guard trigger. An admin (or
  compromised admin credential) can edit/delete rows after the fact.
- GDPR hard-delete does not touch `audit_logs` — rows outlive their subject (carried forward as this
  spec's own explicit decision, see Scope).

### .NET already has every piece except the table

- `RequestContext.System()` + `TenantGucPlanMode.Bypass` — the established idiom for a system-owned,
  non-tenant-scoped write, demonstrated end-to-end by `BillingShadowRepository`
  (`FormMaps.Infrastructure/Billing/BillingShadowRepository.cs`, Domain 9a). This domain's writer
  follows the identical shape: `databaseSessionFactory.OpenWritableAsync(RequestContext.System())`,
  raw SQL via `Command()`/`AddParameter()`, explicit `CommitAsync`.
- `RequestActor.IsSuperAdmin` (`FormMaps.Application/Auth/RequestActor.cs`) — already available on
  every authenticated `RequestContext`, already the exact signal `TenantGucPlanResolver.Resolve` uses
  to grant RLS bypass. This is the read-gate this domain uses (see below).
- `IProtectedRequestGuard.RequireIdentity` + the established inline
  `context.Permissions.Contains(FormMapsPermissions.X)` 403 pattern (see
  `SchoolAdminEndpoints.cs:770-804`'s `AuthorizeAsync` helper) — the endpoint in this domain follows
  the identical two-step shape (identity gate, then an explicit authorization check), just swapping
  the permission-string check for an `IsSuperAdmin` check (see below for why).
- `formmaps_dotnet_svc` least-privilege DB role (`infra/aws/sql/dotnet-service-role.sql`) already
  exists and documents exactly which verbs it needs per table — this domain adds one more bucket
  (`SELECT, INSERT` only — no `UPDATE`/`DELETE`, matching the table's own immutability).

### What already claims to be "audit" today, and actually isn't (the real gap this closes)

Grepping `services/api/src` for `audit` (case-insensitive, excluding tests) finds **seven files, ~15
distinct event-type strings**, all following the *same* convention — a structured, dot-namespaced
`logger.LogInformation("audit.<domain>.<action> ...", actorId, subjectId, ...)` call, emitted **only
after** the writer's own DB transaction commits (so a completion audit can never be logged for a
write that didn't durably persist), explicitly commented as PII-free (IDs/enums/counts only) and
tagged `SOC2 CC7.2 / ISO A.8.15` in several places:

| File | Event types |
|---|---|
| `Assessments/LiaSessionWriter.cs` | `audit.assessment.lia.completed` (5 call sites — every completion path: direct complete, timeout-triggered, answer-triggered, expiry, subtest-triggered) |
| `Assessments/PersonalitySessionWriter.cs` | `audit.assessment.personality.started`, `audit.assessment.personality.completed` |
| `Assessments/TestScoreWriter.cs` | `audit.assessment.testscore.created/updated/deleted` |
| `Assessments/VocationalWriter.cs` | `audit.assessment.vocational.recomputed`, `audit.assessment.vocational.integrated_recomputed` |
| `Assessments/PcaExamWriter.cs` | `audit.assessment.pcaexam.started`, `audit.assessment.pcaexam.submitted` |
| `Assessments/Question360Writer.cs` | `audit.question360.created/updated/activated/deactivated/deleted/bulk_created` |
| `Assessments/EvaluationExternalService.cs` | `audit.evaluation.feedback.submitted` |

**None of these persist anything.** They are log lines only — greppable, but not queryable,
not retained per any policy, not tamper-evident, and invisible to the exact SOC2 read-endpoint an
auditor would ask for. The migration manifest's own entries (e.g. FM-029, FM-025, FM-028) describe
these as "PII-free audit event" without qualifying that they're log-only — this spec treats that as
an accuracy gap the retrofit closes, not a design to imitate. The naming convention itself
(`audit.<domain>.<action>`, actor/subject IDs, post-commit-only emission) is good and is reused
verbatim as this domain's `EventType` taxonomy seed — the retrofit is additive (keep the log line,
add a persisted row using the identical string), not a rewrite.

## Architecture

### Schema

New table, `audit_events`, owned exclusively by .NET (no legacy Prisma model, no legacy writer):

```sql
CREATE TABLE "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,         -- dot-namespaced, e.g. "audit.assessment.lia.completed"
    "actorUserId" TEXT,                 -- nullable: system-initiated events have no human actor
    "actorRole" TEXT,
    "schoolId" TEXT,                     -- tenant context, for filtering only (not RLS-enforced per-row)
    "subjectType" TEXT NOT NULL,          -- e.g. "lia_session", "test_score", "vocational_result"
    "subjectId" TEXT,                      -- nullable: bulk operations may have no single subject
    "outcome" TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'failure' | 'denied'
    "metadata" JSONB                        -- IDs/enums/counts only -- see PII rule below
);
```

No `updatedAt` column, deliberately — the table is immutable (see below), so "last updated" is a
category error. `occurredAt` is the single timestamp; every v1 writer calls `WriteAsync` synchronously
right after its own commit, so `occurredAt` and "when the underlying business event happened" are
never more than milliseconds apart — no separate `createdDate`/`occurredAt` split is needed.

**PII rule (enforced, not just documented):** `metadata` may only contain IDs, enums, short labels,
and numeric counts/scores — never email, name, free-text notes, or (in v1) IP address.
`AuditMetadataGuard.Validate` (Application layer, unit-tested) rejects any metadata dictionary whose
keys match a PII-shaped denylist (`email`, `name`, `phone`, `address`, `ssn`, `dob`, `ipaddress`, …)
before a row is ever written. This is defense-in-depth, not the primary control — the primary control
is that every v1 wiring target already only has IDs/enums/counts available to log (verified per file
above); the guard exists to fail loudly (well, fail *closed* — see Failure semantics) if a future
call site tries to smuggle PII in.

### Read-access model (deliberate decision, not a copy of legacy)

Audit events originate across every school (tenant) — write is always under `RequestContext.System()`
bypass, exactly like `BillingShadowRepository`. Read needs to be cross-tenant too (an auditor/platform
admin looks at events from every school), so the read endpoint's DB session is **also**
`RequestContext.System()` — RLS-bypass, not per-tenant Identity-mode.

Because the DB session itself carries no per-request authorization signal once it's in bypass mode,
`audit_events` gets its own defense-in-depth beyond legacy's single-route app-layer gate:

```sql
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_bypass_only" ON "audit_events"
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');
```

Any ordinary tenant-scoped (Identity-mode) RLS session — the normal case for every other endpoint in
the codebase — gets **zero rows** and cannot write, even by accident, even if some future code path
forgets to route through `IAuditEventWriter`/`IAuditEventReader`. This is strictly stronger than
legacy's `audit_logs` (no RLS at all, app-layer-only), which the SOC2 gap-assessment flagged as a soft
spot on the exact table this domain replaces.

The application-layer gate on the read endpoint itself: **`RequestActor.IsSuperAdmin`, not a
permission string**, for v1. Legacy's own equivalent gate (`admin:settings`) is confirmed dead code
(no role has it — see above); rather than port a broken pattern or invent a new permission string
that requires a cross-repo change to Node's `ROLE_PERMISSIONS` before it can ever be satisfied,
v1 gates on `IsSuperAdmin`, which is already populated correctly for every Super Admin session today,
zero Node changes required, immediately functional. A `FormMapsPermissions.AuditRead = "audit:read"`
constant is still defined (documents intent, used by v1's own guard-decision code path for the 403
body), but is not what actually gates access yet. See Open items for the fast-follow.

### Immutability (built in from day one)

No prior FormMaps table (Node or .NET) has ever done this — legacy's `audit_logs` is plainly mutable.
Structurally modeled after (not copied from — different repo/schema, referenced only as a template
per this codebase's own established convention) the tims-ats/TimsSuite `AuditImmutability` CB-1
pattern: `REVOKE` the mutating verbs, **and** a `BEFORE ... FOR EACH STATEMENT` trigger with
`ENABLE ALWAYS`, because a plain `REVOKE` alone does not close the `session_replication_role =
'replica'` bypass (a logical-replication applier session ignores ordinary triggers and most grants
unless the trigger is explicitly `ALWAYS`):

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM PUBLIC;
CREATE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_events rows are immutable (SOC2 CC7.2 / ISO A.8.15): % is not permitted', TG_OP; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER audit_events_immutable;
```

Explicit limitation, stated rather than implied: this does not protect against a superuser with
direct DB access deliberately disabling the trigger — no in-database control can. It closes the
ordinary bypass vectors: a compromised `formmaps_dotnet_svc` application credential, an accidental
`UPDATE`/`DELETE` from a future code path, and the `session_replication_role='replica'` logical-
replication bypass specifically.

This is cheap to do now (zero existing rows, zero existing consumers) and expensive to retrofit later
once real audit data and real downstream readers exist — doing it at table-creation time, not as a
fast-follow, per this spec's own decision.

### Failure semantics — fail-soft-but-alert (deliberate upgrade over legacy)

Legacy: `try { auditLog(...) } catch (err) { logger.warn(...) }` — fire-and-forget, indistinguishable
from any other warning in the log stream, no way to know if audit coverage silently degraded.

v1's `AuditEventWriter.WriteAsync` keeps the "never blocks the real user action" property (a real
write's own transaction has already committed by the time `WriteAsync` is called at every v1 call
site — see the table above, "post-commit-only" is already the existing discipline) but distinguishes
itself from ordinary warnings: any failure — connection issue, constraint violation, the
`AuditMetadataGuard` rejecting a bad metadata dictionary — is caught, logged at **`Error`** level with
a fixed, greppable prefix (`audit.write_failed`), and swallowed. No alerting channel exists anywhere
in this repo yet (identical, already-stated gap for `BillingReconciliationWorker`'s own mismatch
alerts) — v1 produces the signal an ops dashboard can be wired to later, not a live page today.

### Components & data flow

```
Existing writer (e.g. LiaSessionWriter.CompleteAsync)
  -> [own transaction commits]
  -> logger.LogInformation("audit.assessment.lia.completed ...")   [unchanged, kept]
  -> IAuditEventWriter.WriteAsync(new AuditEvent(...))              [new]
       -> AuditMetadataGuard.Validate(metadata)
       -> OpenWritableAsync(RequestContext.System())
       -> INSERT INTO audit_events (own transaction, own commit)
       -> on any failure: logger.LogError("audit.write_failed ...") and swallow

GET /api/v1/audit/events
  -> RequireIdentity guard (401 if anonymous)
  -> RequestActor.IsSuperAdmin check (403 if not)
  -> IAuditEventReader.QueryAsync(filters, cursor) [OpenReadOnlyAsync(RequestContext.System())]
  -> paginated JSON response
```

## Testing

Same per-slice convention as the rest of the migration (build inline → fresh-reviewer gate → full
suite, per `docs/migration/completion-roadmap.md`). Additionally, because this is compliance-critical:

- A dedicated immutability test suite that attempts direct `UPDATE`/`DELETE` (proving the `REVOKE`+
  trigger) **and** a second test that sets `SET session_replication_role = 'replica'` before
  attempting the mutation (proving the `ENABLE ALWAYS` specifically — a plain `ENABLE` trigger would
  silently no-op under that setting, which is exactly the bypass this pattern exists to close).
- `AuditMetadataGuard` unit tests proving the PII denylist actually rejects the shapes it claims to.
- Per-retrofit-file integration tests proving a real row lands in `audit_events` after the existing
  write path completes — not just that `WriteAsync` was called (a fake-writer test would prove the
  wiring but not the persistence; these use the real `AuditEventWriter` against a real Testcontainers
  Postgres).

## Rollout

No flag needed for the write path — it's purely additive (a new table, a new call from existing
post-commit code; nothing existing changes behavior, and a swallowed write failure can't regress any
existing endpoint's response). The read endpoint (`GET /api/v1/audit/events`) is new surface, gated
by `IsSuperAdmin`, safe to ship live (not flag-gated dark) since it has no legacy-Node counterpart to
diverge from and no write side-effects. Deploy alongside the rest of the current unpushed pile per
standing convention — push/deploy/flag-flip remain separate, explicitly confirmed decisions (per this
project's own push/deploy caution convention), not bundled into "the plan is approved."

## Open items (not blocking this spec's approval, resolve at/after planning)

1. **File the tracking issue.** Audit-events has no dedicated child issue under epic #4 today — named
   in three separate planning docs (`architecture.md`, `dotnet-implementation-plan.md`,
   `completion-roadmap.md`) but never tracked as an issue, unlike Domain 9/10/7b. Should be filed once
   this spec is approved.
2. **`audit:read` permission fast-follow.** v1 gates the read endpoint on `IsSuperAdmin` because
   legacy's `admin:settings` gate is dead code and adding a real granular permission requires a
   cross-repo change (Node's `ROLE_PERMISSIONS` in `api/src/lib/auth.ts` would need to start emitting
   `"audit:read"` for whichever roles should get it — School Admins arguably should, for their own
   school's events, which reopens the "school-scoped vs. cross-tenant read" question this spec
   deliberately avoided by going Super-Admin-only for v1). Needs a decision from Federico on who
   besides Super Admin should read audit events, then a coordinated Node+`.NET` change.
3. **TIMS-interop audit events** (`docs/api/security.md`'s "both systems record audit events"
   requirement) — deferred, no current .NET interop write surface exists to wire it into. Revisit
   when `docs/interop/` work lands actual endpoints.
4. **New admin-mutation wiring** (`SchoolAdminEndpoints`/`SchoolUsersEndpoints` mutations that have
   zero audit today) and **Domain 9a's live billing audit** — both explicitly deferred fast-follows,
   see Scope. Neither blocks this domain's own landing.
5. **Retention/purge policy.** v1 makes no attempt at one (rows accumulate indefinitely, matching
   legacy's implicit policy). If storage or compliance eventually requires a retention window,
   immutability (no `UPDATE`/`DELETE`) means a retention job would need explicit, audited superuser-
   level intervention — worth deciding deliberately before it's ever needed, not silently.
