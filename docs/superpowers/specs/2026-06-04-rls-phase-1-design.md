# RLS Phase 1 — Design Spec

> **Date:** 2026-06-04 · **Status:** Approved (brainstorming) · **Branch:** `feat/rls-phase-1`
> **Parent plan:** `docs/security/RLS-MIGRATION-PLAN.md` (this supersedes that plan's Phase 1 *approach* — see "Architecture decision" below)

## Goal

Make Postgres the backstop for tenant isolation so a forgotten `WHERE schoolId = …`
in application code cannot leak another school's data. Phase 1 builds the RLS
infrastructure and proves it end-to-end on **one vertical slice**, producing a
repeatable template for the later bulk rollout.

## Non-goals (deferred to later phases)

- Policies on the other ~28 direct-`schoolId` tables.
- FK-scoped (subquery) policies for the ~15 indirectly-scoped tables
  (`Conversation`/`Message`/`Resume`/`EvaluationGroup` → `users.school_id`, etc.).
- Per-query performance tuning beyond measuring the pilot.
- Removing the app-level guards (`lib/access.ts`) — they stay as defense-in-depth.

## Architecture decision: ALS + Prisma `$extends`, NOT explicit `tx`-threading

The original `RLS-MIGRATION-PLAN.md` Phase 1 assumed threading a `tx` client
(`RequestContext`) through every service signature. The codebase has **~1,239
Prisma query calls across 18 services + 41 routes** — explicit threading is ~2–3
weeks of high-churn, error-prone edits. Rejected.

Chosen approach:

1. **Request context via `AsyncLocalStorage`** (`api/src/lib/requestContext.ts`):
   an Express middleware stores `{ schoolId, userId, isSuperAdmin }` (derived from
   the authenticated JWT) in an ALS store for the request's lifetime. **No service
   signature changes.**

2. **Prisma client extension** (`api/src/lib/prismaRls.ts`): a `$allOperations`
   query extension wraps each operation in a **micro-transaction**:

   ```
   BEGIN;
   SELECT set_config('app.current_school_id', $schoolId, true);   -- true = LOCAL (tx-scoped)
   <the actual query>;
   COMMIT;
   ```

   `schoolId` is read from ALS. For Super-Admin, it instead sets
   `set_config('app.bypass_rls', 'on', true)`. Service code keeps calling
   `prisma.x.findMany(...)` unchanged.

### Why micro-transaction per query

- `SET LOCAL` / `set_config(..., true)` only persists **inside a transaction**.
- A transaction-mode connection pooler routes each query to a different backend
  connection, so the GUC must travel in the **same transaction** as the query.
  `SET SESSION` would leak across pooled requests → wrong-tenant data. Forbidden.
- **Solves the external-I/O hazard:** Bedrock / SES / Stripe / TIMS calls happen
  *between* queries, never inside a DB transaction. The naive "one big transaction
  per request" alternative would hold a DB connection across a multi-second
  external call and hit the interactive-transaction timeout / exhaust the pool.

### Existing interactive `$transaction` blocks (11 files)

`stripe.ts`, `counselor.ts`, `schoolCoursesService.ts`, `adminService.ts`,
`schoolGradesService.ts`, `coachBookingsService.ts`, `authService.ts`,
`evaluationService.ts`, `schoolService.ts`, `transcriptService.ts`,
`authAdminService.ts`.

Inside an interactive transaction the extension's per-op wrapping does not apply
to the `tx` client, so each block sets the GUC as its **first statement** via a
shared helper `setTenantGuc(tx)`. (Array-form `prisma.$transaction([...])` blocks
get the `set_config` op prepended.)

### Escape hatch (no ALS context)

Seeds, scripts, and cron tasks run outside a request → no ALS store. In that case
the extension runs in **system/bypass mode** (`app.bypass_rls = 'on'`) so
`prisma db seed`, importers, and maintenance jobs keep working. This is logged.

## Components

| File | Purpose |
|---|---|
| `api/src/lib/requestContext.ts` | ALS store + `getTenantContext()` / `runWithTenantContext()` helpers |
| `api/src/middleware/tenantContext.ts` | Express middleware: populate ALS from `req.userId`/`req.schoolId`/role after `authenticate` |
| `api/src/lib/prismaRls.ts` | `$extends` query extension (micro-tx + GUC) + `setTenantGuc(tx)` helper; exports the extended client |
| `api/src/lib/prisma.ts` | unchanged base client; `prismaRls.ts` wraps it |
| `api/prisma/migrations/<ts>_rls_pilot/` | enable + force RLS and add policy on `SchoolCourse` + `StudentCoursePlan` |
| `api/prisma/schema.prisma` | add `directUrl = env("DIRECT_URL")` to datasource |
| `api/src/__tests__/rls.pilot.test.ts` | cross-tenant isolation tests |

## Data flow

```
request → authenticate (sets req.userId, req.schoolId, role)
        → tenantContext middleware → runWithTenantContext({schoolId,userId,isSuperAdmin}, next)
        → route → service → prisma.x.op(...)
            → prismaRls extension: $transaction([ set_config(app.current_school_id, schoolId, true), op ])
            → Postgres evaluates RLS policy: school_id = current_setting('app.current_school_id')::uuid
                                              OR current_setting('app.bypass_rls', true) = 'on'
```

## Pilot policy (migration, applied via `DIRECT_URL`)

For each pilot table (`school_courses`, `student_course_plans`):

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;   -- applies to table owner too
CREATE POLICY tenant_isolation ON <t>
  USING (school_id = current_setting('app.current_school_id', true)::uuid
         OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (school_id = current_setting('app.current_school_id', true)::uuid
         OR current_setting('app.bypass_rls', true) = 'on');
```

Both pilot models carry a **direct `schoolId`** (verified): `SchoolCourse`
(`school_courses`, `@@index([schoolId])`, `@@unique([schoolId, code])`) and
`StudentCoursePlan` (`student_course_plans`, `@@index([schoolId])`). Both get the
direct-`schoolId` policy above.

## Testing / success criteria

1. Seed two schools (A, B) each with `SchoolCourse` rows.
2. Under school A's ALS context, `prisma.schoolCourse.findMany({})` **with no
   `where`** returns only A's rows (DB backstop proven).
3. Cross-tenant write (`create`/`update` targeting B's row under A's context) is
   rejected by `WITH CHECK`.
4. Super-Admin context sees both schools.
5. No-context (script) mode can read both (bypass) — and is the only way to.
6. Existing `school-courses` route + service tests still pass.
7. Latency delta of the micro-tx wrapping is measured and recorded (go/no-go for
   repo-wide rollout).

## Rollout template (output of Phase 1)

A short `docs/security/RLS-ROLLOUT-TEMPLATE.md`: "to bring a table under RLS — add
policy migration, confirm queries set the GUC (automatic via extension), add an
isolation test." Consumed by later phases.

## Risks

- **Behavioral/perf change of global micro-tx wrapping** — the main risk;
  measured in the pilot before relying on it widely.
- **Nested transaction edge cases** — covered by `setTenantGuc(tx)` in the 11
  interactive blocks; verified by their existing tests.
- **Connection count** — micro-tx adds BEGIN/COMMIT round trips; validated against
  the `connection_limit=20` pool in the pilot.
