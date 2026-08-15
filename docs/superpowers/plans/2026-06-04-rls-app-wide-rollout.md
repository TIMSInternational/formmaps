# RLS App-Wide Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Postgres Row-Level Security from the 2-table pilot to every tenant-scoped table, so the database is the backstop for tenant isolation (a forgotten `WHERE schoolId=…` cannot leak another school's data).

**Architecture:** Reuse the existing Phase-1 machinery (AsyncLocalStorage `tenantContext` + Prisma `$extends` micro-transaction that sets `app.current_school_id` / `app.bypass_rls` via `SET LOCAL`). Add FORCE-RLS policies table-by-table in batches, mount `tenantContext` on every scoped router, convert every interactive/array `$transaction` to call `setTenantGuc(tx)`, wrap every non-request DB caller (cron/seeds/pre-auth lookups) in `runAsSystem()`, and gate the fail-open→deny flip behind an env flag (`RLS_STRICT`) so every phase is safe to merge while prod still runs the superuser role (RLS inert until the deploy window swaps in a non-superuser role AND `RLS_STRICT=1`).

**Tech Stack:** Express 5, Prisma, Postgres 16 / Aurora, vitest, AsyncLocalStorage.

---

## Key safety mechanism: `RLS_STRICT` env flag

`resolveGucPlan(undefined)` (no request context) currently returns `bypass` (fail-open). The rollout needs this to become `deny` (fail-closed) — but flipping it globally would break every un-instrumented router and every script the moment a non-superuser role is used. So:

- Introduce `RLS_STRICT` (default `false`). When false, no-context → `bypass` (today's behavior). When true, no-context → `deny`.
- All phases A–C merge with `RLS_STRICT` unset/false. Policies + `tenantContext` + `setTenantGuc` + `runAsSystem` all land and are **correct but inert** under prod's current superuser role and dev's `postgres` superuser.
- Phase D flips the default to `deny` and is activated in prod only together with the non-superuser Aurora role (deploy window). The isolation tests already exercise the `deny` path directly (context present, no schoolId) so they don't depend on the flag.

---

## Phase inventory (each phase = one PR to `develop`)

| Phase | Scope | Tables |
|------|-------|--------|
| **A** | Framework hardening + core school-config tables (non-null schoolId, no pre-auth reads) | ~21 direct-schoolId tables (below) |
| **B** | FK-scoped tables (subquery policies via `users.schoolId` & FK chains) + user-scoped routers | ~45 Category-B tables |
| **C** | Sensitive/ambiguous: `users`, nullable-schoolId invite/alert tables, global-or-override (`framework_courses`, `admission_*`), and product-decision tables (`conversations`/`messages`, `payments`, `ai_cache`) | ~12 tables |
| **D** | Enforcement flip: `RLS_STRICT` default→deny, full integration pass, docs; prod non-superuser role created in deploy window | — |

---

## Phase A — Framework hardening + core school-config tables

**Phase-A table set** (FORCE-RLS, direct `"schoolId"` text column, non-null, no pre-auth read path). Pilot already covers `school_courses` + `student_course_plans`.

```
academic_years
assessment_periods
assessment_schedules
community_service_entries
course_change_requests
course_sequences
curriculum_frameworks
data_mappings
document_requests
gpa_configurations
grade_import_jobs
graduation_rule_sets
holidays
isams_configs
isams_sync_jobs
school_assessment_configs
school_assessment_settings
school_course_import_jobs
school_framework_course_overrides
school_users
student_grades
```

**Deferred out of A (handled later):** `users` (C — login/auth pre-auth), `counselor_invites`/`student_alerts` (C — nullable + onboarding token reads), `framework_courses` (C — nullable global+override), `admission_models`/`admission_outcomes` (C — cross-tenant ML training reads).

### Task A1: `RLS_STRICT` env flag (fail-open→deny gate)

**Files:**
- Modify: `api/src/lib/prismaRls.ts`
- Test: `api/src/__tests__/prismaRls.unit.test.ts`

- [ ] **Step 1 — Failing test:** add cases asserting `resolveGucPlan(undefined)` returns `{mode:"bypass"}` when `RLS_STRICT` unset, and `{mode:"deny"}` when `process.env.RLS_STRICT==="1"`. (Authenticated-no-school still `deny` regardless.)
- [ ] **Step 2 — Run:** `cd api && npx vitest run src/__tests__/prismaRls.unit.test.ts` → FAIL.
- [ ] **Step 3 — Implement:** in `resolveGucPlan`, replace the first line:
  ```ts
  if (!ctx) return process.env.RLS_STRICT === "1" ? { mode: "deny" } : { mode: "bypass" };
  ```
- [ ] **Step 4 — Run:** tests PASS.
- [ ] **Step 5 — Commit.**

### Task A2: cron cleanup job → `runAsSystem`

**Files:** Modify `api/src/index.ts:~360` (the 6-hour `setInterval`).

- [ ] Wrap the cleanup body in `runAsSystem(async () => { … })` (import from `./lib/requestContext.js`). Under `RLS_STRICT` this prevents the deny default from blocking `passwordResetToken`/`aiCache`/`loginAttempt` deletes. (These tables aren't policied, but the job runs with no context, so it must declare system intent.)
- [ ] `cd api && npx tsc --noEmit` clean. Commit.

### Task A3: convert every interactive/array `$transaction` to set the GUC

These run on `basePrisma` (bypass the extension) so they MUST set the GUC manually to be RLS-correct once their tables are policied. Adding `setTenantGuc(tx)` is inert when no policy/superuser, so do all of them now.

**Files (add `await setTenantGuc(tx)` as the FIRST statement; array-form → convert to interactive `basePrisma.$transaction(async (tx)=>{ await setTenantGuc(tx); … })`):**
- `api/src/routes/stripe.ts:~250` (interactive; payment/userSubscription/booking) — webhook: wrap in `runAsSystem` instead (no request ctx) → use `setTenantGuc` which reads system ctx as bypass. **Decision: webhook handler must run inside `runAsSystem`** (it's not an authenticated request). Add `runAsSystem` around the handler body, then `setTenantGuc(tx)` resolves to bypass.
- `api/src/routes/counselor.ts:~388` (interactive; counselorSession)
- `api/src/services/coachBookingsService.ts:~43,~85,~155,~188` (interactive; booking/review/coach)
- `api/src/services/transcriptService.ts:~212` (array; studentGpa)
- `api/src/services/authService.ts:~367` (array; user/passwordResetToken/refreshToken) — auth/password-reset path; wrap caller in `runAsSystem` (pre/just-auth). Use `setTenantGuc` → bypass under system.
- `api/src/services/schoolService.ts:~106` (array; counselorStudentAssignment)
- `api/src/services/schoolGradesService.ts:~486` (array; studentGrade/gradeImportError)
- `api/src/services/authAdminService.ts:~202` (array; coach/user/booking) — admin action
- `api/src/services/evaluationService.ts:~253` (array; evaluationGroup)
- `api/src/services/schoolCoursesService.ts:~259` (array; curriculumFramework)
- `api/src/services/adminService.ts:~160` (array; GDPR cascade across ~15 models) — super-admin; wrap in `runAsSystem` (cross-tenant by design).

> For array-form blocks: prepend `gucOp(basePrisma, resolveGucPlan(getTenantContext()))` as the first element of the array, OR convert to interactive with `setTenantGuc(tx)` first. Prefer the interactive conversion for readability **unless** the block relies on array atomicity semantics (it doesn't — both are atomic). Keep `basePrisma`.

- [ ] After each file: `npx tsc --noEmit`. The guard test `no-extended-transaction.test.ts` must stay green (never use extended `prisma.$transaction`).
- [ ] Commit per logical group.

### Task A4: `apply-rls.ts` applies ALL policy files in order

**Files:** Modify `api/scripts/apply-rls.ts`; Create `api/prisma/rls/002-direct-schoolid.sql`.

- [ ] Rewrite `apply-rls.ts` to glob `prisma/rls/*.sql` sorted lexically and `prisma db execute --file` each. Keep idempotent.
- [ ] Create `002-direct-schoolid.sql`: for each Phase-A table, emit the pilot pattern verbatim (ENABLE + FORCE + DROP POLICY IF EXISTS + CREATE POLICY tenant_isolation USING(...) WITH CHECK(...) on `"schoolId" = current_setting('app.current_school_id', true) OR current_setting('app.bypass_rls', true) = 'on'`). **No `::uuid` cast.**
- [ ] Apply to dev: `cd api && npm run rls:apply`. Verify a sample with `psql formmaps_dev -c '\d+ academic_years'` shows `Row Security: enabled (forced)`.
- [ ] Commit.

### Task A5: mount `tenantContext` on school-scoped routers

**Files:** Modify `api/src/index.ts`. Add `authenticate, tenantContext` at each mount (matching the pilot pattern). Routers (all fully-authenticated, no public routes):
- `schoolRoutes`, `schoolStudentRoutes`, `schoolGradeRoutes`, `schoolAssessmentRoutes` (`/api/v1/school-admin`)
- `alertsRoutes` (`/api/v1/alerts`)
- `academicGapsRoutes` (`/api/v1/school-admin/academic-gaps`)
- `counselorAnalyticsRoutes` (`/api/v1/counselor`)
- `coursePlanRoutes` (`/api/v1/student`) — student course plan (school-scoped)
- `transcriptRoutes`, `collegeRoutes`/`collegeTrackingRoutes`, `videoRoutes` (touch school-scoped tables)

> `counselorRoutes` and `parentRoutes` have PUBLIC onboarding routes → do NOT blanket-mount `tenantContext`. Defer to Phase B where pre-auth reads are wrapped in `runAsSystem` and `tenantContext` is mounted only on the authenticated sub-routes.

- [ ] `npx tsc --noEmit` clean. Manual smoke: `npm run dev`, hit a school-admin endpoint with the test admin token, confirm 200 + correct school data (superuser → RLS inert, behavior unchanged). Commit.

### Task A6: expand isolation tests to Phase-A tables

**Files:** Create `api/src/__tests__/rls/direct-schoolid.integration.test.ts` (gated by `RLS_TEST_DB`, mirror `rls.pilot.integration.test.ts`).

- [ ] Seed schools A,B (via `runAsSystem`) each with one row in 2–3 representative Phase-A tables (e.g. `academic_years`, `student_grades`, `holidays`). Assert: unfiltered `findMany` under school A returns only A; cross-tenant create blocked by `WITH CHECK`; super-admin sees both; authenticated-no-school sees none.
- [ ] Run locally as non-superuser:
  ```bash
  cd api
  npx prisma db push --skip-generate
  npm run rls:apply
  RLS_TEST_DB=1 DATABASE_URL='postgresql://rls_app:rls_app@localhost:5432/formmaps_dev' \
    DIRECT_URL='postgresql://rls_app:rls_app@localhost:5432/formmaps_dev' \
    npx vitest run src/__tests__/rls/direct-schoolid.integration.test.ts
  ```
  Expected: PASS (isolation enforced under `rls_app`).
- [ ] Commit.

### Task A7: CI + full suite + PR

- [ ] Update `.github/workflows/ci.yml` rls job to run the new test file (and any added rls tests) alongside the pilot test.
- [ ] `cd api && npm test` (full suite) green; `npx tsc --noEmit` (api) clean; `cd ../frontend && npx tsc --noEmit` clean (frontend untouched but verify).
- [ ] PR `feat/rls-phase-a` → develop. Verify CI green incl. rls job.

---

## Phase B — FK-scoped tables

For each Category-B table, write a subquery policy reaching a `schoolId`:
- **`userId`/`studentId` → `users.schoolId`:** `EXISTS(SELECT 1 FROM users u WHERE u.id = "<T>"."<fk>" AND u."schoolId" = current_setting('app.current_school_id', true)) OR current_setting('app.bypass_rls', true)='on'`. (Note: `users` column is `schoolId`, not `school_id` — confirmed from schema; no `@map`.)
- **FK → already-policied parent with `schoolId`** (e.g. `grade_import_errors.jobId → grade_import_jobs`, `course_sequence_nodes.sequenceId → course_sequences`, `category_requirements.ruleSetId → graduation_rule_sets`): join the parent.
- **2-hop** (e.g. `application_essays → student_applications → users`): keep the subquery shallow; join minimum tables.

**Performance:** before shipping each, `EXPLAIN (ANALYZE, BUFFERS)` the hot query; add covering index on the FK if the planner seq-scans.

**Category-B tables** (from discovery; group into 2–3 SQL files `003-…`/`004-…`):
`academic_terms`, `audit_logs`(actorId — verify actor always has school; else C), `bookings`, `category_requirements`, `course_enrollments`, `course_progress`, `coursera_click_throughs`, `counselor_availabilities`, `counselor_notes`, `counselor_sessions`, `counselor_student_assignments`, `evaluation_groups`, `evaluation_feedbacks`, `grade_import_errors`, `pca_exam_answers`, `pca_exam_sessions`, `notifications`, `refresh_tokens`(see note), `reviews`, `scholarships`, `special_requirements`, `student_activities`/`user_activities`, `student_applications`, `student_gpas`, `student_parent_links`, `student_portfolio_items`, `student_test_scores`, `school_course_import_errors`, `telemetry_events`, `user_career_profiles`, `user_preferences`, `user_profiles`, `user_settings`, `user_subscriptions`, `application_essays`, `application_checklists`, `college_essays`, `recommendation_requests`, `recommendation_application_links`, `essay_comments`, `course_sequence_nodes`, `course_sequence_edges`, `payments`(→C, coach/parent), `career_favorites`(→C).

> **`refresh_tokens`:** written at login (pre-auth, no school context yet) and read at refresh. MUST stay unpolicied OR all auth-token writes wrapped in `runAsSystem`. **Decision:** leave `refresh_tokens`, `password_reset_tokens`, `login_attempts` UNPOLICIED (auth infrastructure, keyed by user/email, no cross-tenant value-leak risk beyond what auth already controls). Document in the SQL header.

### Phase-B tasks (repeat per SQL batch)
- [ ] Write `003-fk-userid.sql` (the `userId`/`studentId → users` group) + `004-fk-parent.sql` (parent-join + 2-hop group).
- [ ] `npm run rls:apply`; verify `\d+` on samples.
- [ ] Mount `tenantContext` on the remaining authenticated routers serving these tables: `userRoutes`, `studentRoutes`(authenticated sub-routes only — wrap onboarding verify in `runAsSystem`), `reportRoutes`, `recommendationsRoutes`, `messagesRoutes`, `testScoresRoutes`, `careerRoutes`, `universityRoutes`, `telemetryRoutes`, `assessment` routers, `pcaapiRoutes`, `examRouter`, `resumeRoutes`, `aichatRoutes`, `uploadRoutes`, `counselorRoutes`(auth sub-routes), `parentRoutes`(auth sub-routes), `coach` booking routers, `evaluationRoutes`(auth sub-routes; token-validate via `runAsSystem`).
- [ ] Wrap pre-auth/public reads on now-policied tables in `runAsSystem`: onboarding `verify`/`complete` token lookups (student/counselor/parent/coach), evaluation `validate-token`, any unauthenticated read.
- [ ] Add `setTenantGuc` already done in A3 covers Phase-B-touching transactions; re-verify each tx's tables are covered.
- [ ] Isolation tests per group (FK isolation: user in school A vs B). Run as `rls_app`.
- [ ] `npm test` + tsc clean. PR `feat/rls-phase-b` → develop.

---

## Phase C — Sensitive / ambiguous tables (needs product decisions)

### C1 — `users` table (highest risk)
- Policy: `"schoolId" = current_setting('app.current_school_id', true) OR current_setting('app.bypass_rls', true)='on'`. Nullable schoolId → users with NULL school (coaches/parents/platform) are invisible to school-scoped contexts (correct) but visible under bypass.
- **All pre-auth / cross-tenant user reads MUST use `runAsSystem`:** login-by-email (`authService`), refresh, password reset, signup, coach signup, any platform-admin user listing (super-admin already bypasses via context). Audit every `users` read reachable without `tenantContext`.
- Isolation test + careful manual auth smoke (login, refresh, change-password, onboarding) under `rls_app`.

### C2 — nullable-schoolId school tables: `counselor_invites`, `student_alerts`
- Same direct-schoolId policy. Rows with NULL schoolId invisible under school context — verify no legitimate NULL-school rows exist / are needed; if invites can be school-less, wrap their reads in `runAsSystem`.
- Onboarding invite-token verify reads → `runAsSystem`.

### C3 — global-or-override: `framework_courses`, `admission_models`, `admission_outcomes`
- **PRODUCT DECISION (ask):** are these per-school or global-with-optional-override? Likely policy: `"schoolId" IS NULL OR "schoolId" = current_setting(...) OR bypass` (global rows visible to all, school rows isolated). For `admission_outcomes` (ML training): if the engine trains cross-tenant, it must run under `runAsSystem`.

### C4 — cross-tenant by nature: `conversations`, `messages`, `payments`, `ai_cache`
- **PRODUCT DECISION (ask):** 
  - `conversations`/`messages`: can participants be in different schools? If conversations are always intra-school, policy via a participant's school; if cross-school is allowed, RLS can't cleanly isolate → keep app-level checks + leave unpolicied (documented) OR policy on `participantA`'s school.
  - `payments`: payer may be coach/parent (no school) → FK-to-users policy would hide them under school context; coach payouts are platform-level → likely `runAsSystem` in coach/billing flows + unpolicied, OR policy + bypass for billing routers.
  - `ai_cache`: `ownerId` is mixed (userId or schoolId) → not cleanly joinable; leave unpolicied (cache, no PII-leak across the value boundary) — document.

### Phase-C tasks
- [ ] Resolve C3/C4 product decisions with the user (AskUserQuestion at execution time).
- [ ] Write `005-sensitive.sql`; apply; verify.
- [ ] Audit & wrap every pre-auth/cross-tenant read in `runAsSystem`.
- [ ] Mount `tenantContext` on auth/admin routers' authenticated routes as needed.
- [ ] Isolation + full auth/onboarding/billing smoke under `rls_app`. PR `feat/rls-phase-c` → develop.

---

## Phase D — Enforcement flip

- [ ] Set `RLS_STRICT=1` default path is **opt-in via env**; document that prod enables it ONLY after the non-superuser Aurora role is live (deploy window step).
- [ ] Create the prod runbook in `docs/security/`: create non-superuser role `formmaps_app` (CONNECT, USAGE, CRUD on app tables, no DDL), grant, verify `rolsuper='f'`, repoint `nexa/api/DATABASE_URL` + `DIRECT_URL` secrets, set `RLS_STRICT=1` env on App Runner, deploy, verify isolation against prod. (Executed in the deploy window; in-VPC.)
- [ ] Full integration pass: run entire suite with `RLS_STRICT=1` + `rls_app` locally; fix any policy-broken query (missing `tenantContext`/`runAsSystem`).
- [ ] Update `docs/security/RLS-MIGRATION-PLAN.md` status → complete; update memory.
- [ ] PR `feat/rls-phase-d` → develop.

---

## Self-review notes
- Every phase merges safely because `RLS_STRICT` defaults off and prod runs superuser until Phase-D deploy — policies are correct-but-inert until both conditions flip together.
- Auth/login/onboarding/webhook/cron/seed = the no-context callers → all routed through `runAsSystem` (bypass) before any policied table is read without a tenant context.
- `users` column is `schoolId` (no `@map`); `schoolId` stored as text → no `::uuid` cast anywhere.
- Apply order: `apply-rls.ts` runs `prisma/rls/*.sql` lexically (`pilot.sql` then `002…`,`003…`); all idempotent.
