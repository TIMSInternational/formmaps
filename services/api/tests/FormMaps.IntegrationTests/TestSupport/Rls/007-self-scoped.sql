-- RLS Phase E: self-scoped tables (formmaps#77, group 1).
--
-- These are the tables that carry a user/tenant scoping column and needed NO
-- product decision from a human — only a read-path audit. They were split off
-- from #77's group 2 (audit_logs, user_blocks, notification_outbox, schools,
-- roles, course_recommendation_caches), which still needs an owner decision and
-- is deliberately NOT in this file.
--
-- Every policy below is ENABLE + FORCE + a single `tenant_isolation` policy, the
-- same shape as 002/003/004/005, and every statement is idempotent.
--
-- ============================================================================
-- ***  RETRACTED PREREQUISITE — this file's old header was WRONG (#117)  ***
-- ============================================================================
-- From 2026-08-05 to 2026-08-09 this file opened with a blocking prerequisite
-- claiming that four routers — /api/resume, /api/stripe, /api/v1/admin and
-- /api/v1/coach (+coach-bookings) — mount NO tenantContext middleware, so
-- getTenantContext() would be undefined, resolveGucPlan() would return
-- { mode: "deny" } under RLS_STRICT=1, every branch of every policy here would
-- evaluate false, and applying this file would fail those routes CLOSED. It went
-- further and claimed the gap was already a LIVE defect, with
-- canAccessUser -> prisma.user.findUnique "returning null today".
--
-- All of that is FALSE, and it deferred this apply for four days.
--
-- middleware/authenticate.ts:38-46 calls runWithTenantContext() ITSELF, for every
-- authenticated request, and has since commit a054f1cf ("feat(rls): establish
-- tenant context in authenticate + systemContext for pre-auth routes",
-- 2026-06-05) — two months BEFORE that header was written. Its own comment says
-- so: "This covers ALL authenticated routes without per-router tenantContext
-- mounts (those remain as harmless, explicit redundancy)." An explicit
-- tenantContext mount is redundancy, never the mechanism.
--
-- Re-verified 2026-08-09 against the artifact actually running in production
-- (ECR nexa-api@sha256:3b973f9c…, the digest App Runner deployed at 23:04 on
-- 08-08; its /app/src is byte-identical to main @ 9798bd41). Every route that
-- touches a table below reaches the database under a context:
--
--   * /api/resume        routes/resume.ts:25       router.use(authenticate)
--   * /api/v1/admin      routes/admin.ts:23        router.use(authenticate)
--   * /api/stripe        per-route `authenticate`; /webhook is systemContext;
--                        /config touches no table
--   * /api/v1/coach      per-route `authenticate` in coach.ts + coach-bookings.ts;
--                        the two public onboarding routes are systemContext
--
-- The lesson, since it cost four days: grepping for the tenantContext SYMBOL is
-- not the same as establishing whether a context EXISTS. Trace to
-- getTenantContext()'s writers — runWithTenantContext and runAsSystem — not to
-- the middleware that is one of several callers of them.
--
-- Nothing here can ship by accident — rls:apply is manual and the service has no
-- DIRECT_URL (#105) — keep it that way.
-- ============================================================================
--
-- NOT IN THIS FILE, deliberately (escalated, see check-rls-coverage.mjs
-- ESCALATED): coaches, coach_availabilities, reviews, bookings. All four are
-- read on a CROSS-USER path by design — the marketplace browse listing and the
-- double-booking conflict check — so a self-scoped policy would silently break a
-- working feature rather than secure it. Details in the script.

-- ============================================================================
-- 1. Owner-only. Row belongs to exactly one user and NO other user, ever.
--    Deliberately NOT the 003-fk-users school-inherit shape: no app path asks
--    for a school branch, so granting one would give the database more than the
--    application ever uses (the form_drafts rationale in 005-sensitive).
-- ============================================================================

-- refresh_tokens (#46 puts .NET on this write path). Every cross-user path is
-- pre-auth and already runs under systemContext -> bypass: /authapi/login,
-- /refresh, /refresh-token, /reset-password (routes/auth.ts:31,68,71,211), and
-- every onboarding/complete that mints a session (routes/{student,teacher,
-- counselor,parent}.ts, auth-admin.ts:36,78, coach.ts:36). The only
-- tenant-context caller is logout/change-password -> revokeAllUserTokens(userId)
-- with userId === the caller, which the owner branch covers. GDPR erasure runs
-- runAsSystem + tenantGucOp (adminService.ts:415) -> bypass.
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "refresh_tokens";
CREATE POLICY tenant_isolation ON "refresh_tokens"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

-- password_reset_tokens (#46 puts .NET on this write path). Same argument:
-- forgot-password and reset-password are systemContext (routes/auth.ts:191,211),
-- the redeem write is runAsSystem (authService.ts:417), and the expired-token
-- sweep is runAsSystem (index.ts:471-475). Nothing reads these under a tenant
-- context, so owner-only is the tightest shape that keeps every path working.
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "password_reset_tokens";
CREATE POLICY tenant_isolation ON "password_reset_tokens"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

-- payments: every read in routes/user.ts (404,447,452,463,473,489) and
-- services/stripeService.ts is keyed to the paying user. The two cross-user
-- readers are super-admin only (adminService.ts:104 platform revenue,
-- routes/admin.ts:221 payment list) -> isSuperAdmin resolves to bypass; and the
-- Stripe webhook, which is systemContext (routes/stripe.ts:427) -> bypass.
-- No school branch: a payment is a person's receipt, not school-tenant data, and
-- no school-staff path reads another user's payments.
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payments";
CREATE POLICY tenant_isolation ON "payments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

-- career_favorites: routes/career.ts is the ONLY caller and every one of its 5
-- access points filters on `userId: req.userId!` (39,56,61,75,78). No counselor
-- or admin path reads another user's career favorites, unlike
-- university_favorites below — hence owner-only here and school-inherit there.
-- (This table was previously EXEMPT as a "global catalog join". It is not: the
-- join row is owned by a user and names what that user is interested in.)
ALTER TABLE "career_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "career_favorites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "career_favorites";
CREATE POLICY tenant_isolation ON "career_favorites"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

-- ============================================================================
-- 2. School-inherit (the 003-fk-users shape): owner OR the owner is in the
--    caller's school. Each of these HAS a real, authorized cross-user reader —
--    a counselor or school admin acting on their own school's student — so
--    owner-only would break a working feature. Per-user authz (canAccessUser /
--    resolveSecureUserId) stays in app code; RLS is the tenant floor.
-- ============================================================================

-- resumes: LIVE in .NET today, so this is the highest-risk entry in the file.
-- Owner-only is WRONG here. GET /api/resume/:id (routes/resume.ts:59) and
-- GET /api/resume/:id/original (:193) both fetch the resume FIRST and then gate
-- on canAccessUser(), which authorizes an assigned counselor and a same-school
-- school_admin (lib/access.ts:55-69); the legacy user-id fallback (:73) does the
-- same via resolveSecureUserId. Every one of those authorized readers is in the
-- resume owner's school, so the school branch is exactly as wide as the app's
-- own authorization and no wider. Super Admin resolves to bypass.
-- The .NET twin IS verified (2026-08-09, #117 — the old CAVEAT here said it could
-- not be, because the monorepo was not checked out then; it is now, at
-- clients/tims-international/github/formmaps). ResumeRepository and
-- ResumeSectionsRepository take every connection from
-- IFormMapsDatabaseSessionFactory, whose only implementation
-- (NpgsqlFormMapsDatabaseSessionFactory) runs RlsSessionContextApplier on the
-- session's transaction before any statement. RlsSessionCommandBuilder.cs:20-32
-- emits the SAME GUC names and semantics as lib/prismaRls.ts gucOp — bypass =>
-- set_config('app.bypass_rls','on',true), identity => set_config of
-- app.current_school_id + app.current_user_id — and TenantGucPlanResolver.Resolve
-- mirrors resolveGucPlan branch for branch (null context => Deny, IsSystem or
-- IsSuperAdmin => Bypass, UserId present => Identity, else Deny). The two
-- cross-user reads (ResumeRepository.cs:103,116) pass RequestContext.System()
-- explicitly, which resolves to Bypass. No bare connections on this path.
ALTER TABLE "resumes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resumes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "resumes";
CREATE POLICY tenant_isolation ON "resumes"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "resumes"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "resumes"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

-- pca_results: one row per user (userId is @unique). Read in
-- lib/assessmentProfile.ts:169 with a userId that is the caller's own on the
-- student path and a viewed student's on the counselor/report path; written by
-- services/pcaResultService.ts:51 from a background closure launched inside the
-- pcaapi request (routes/pcaapi.ts:415), which inherits that request's
-- AsyncLocalStorage context — so the writer runs under the CALLER's GUCs, not
-- the subject's. The school branch is what makes that write legal when a
-- counselor triggers get-result for their student. GDPR erasure is
-- runAsSystem + tenantGucOp (adminService.ts:458) -> bypass.
ALTER TABLE "pca_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pca_results" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pca_results";
CREATE POLICY tenant_isolation ON "pca_results"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_results"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_results"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

-- pca_evaluations: the 37-access-point table the old PENDING note flagged. The
-- audit says its own prediction was right — the cross-user reads are all
-- `userId: { in: studentIds }` over the CALLER'S OWN school's students
-- (schoolAssessmentsService.ts:65,105,299,675; schoolService.ts:37,863,980;
-- counselorAnalyticsService.ts:58; alertGenerationService.ts:40; report.ts:318),
-- so the school branch keeps every one of them working. Two paths deserve a
-- note. (a) routes/pcaapi.ts:183 resolves a pcaCod's OWNER globally before
-- authorizing; under this policy that lookup is scoped, so a cross-school pcaCod
-- returns null and 404s — the same answer the authz check gives one line later,
-- just reached earlier. (b) routes/pcaapi.ts:412,600 do
-- `updateMany({ pcaCod, isCompleted: false })` with no userId; the pcaCod is
-- already authorized by resolveAuthorizedPcaCod, and the row is either the
-- caller's own or their school's, so both branches hold.
-- services/backfillService.ts:14 reads platform-wide with no scoping and would
-- see nothing here — it has NO callers in src/ outside its own test and is dead
-- code today; if it is ever wired up it must use runAsSystem().
ALTER TABLE "pca_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pca_evaluations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pca_evaluations";
CREATE POLICY tenant_isolation ON "pca_evaluations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_evaluations"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_evaluations"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

-- informe_deliveries: the queue row for auto-emailing a student's career
-- informe. The worker (informeDeliveryRunner.ts:24) already wraps every sweep
-- and drain in runAsSystem() -> bypass, which is the old PENDING note's blocker
-- and it is cleared. The remaining caller is enqueueInformeDelivery(userId) from
-- routes/pcaapi.ts, which runs under the REQUEST's context and is reached with a
-- viewed student's userId on the counselor path — so owner-only would make its
-- dedupe findFirst (informeDeliveryService.ts:57) miss and then blow up the
-- create (:68) on WITH CHECK, 500ing the whole get-result request. School-inherit
-- keeps that path legal.
ALTER TABLE "informe_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "informe_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "informe_deliveries";
CREATE POLICY tenant_isolation ON "informe_deliveries"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "informe_deliveries"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "informe_deliveries"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

-- university_favorites: NOT the "global catalog join" its old exemption claimed.
-- The row is a student's shortlist entry with private notes and a fit
-- classification, and counselors write it FOR a student:
-- routes/college.ts:203,236 and college-tracking.ts:187 key on
-- `qs(req.params.studentId)`, not req.userId. Hence school-inherit, matching the
-- rest of the college-tracking tables already policied in 003-fk-users.
-- (`universities` itself stays unpolicied — that one really is a global catalog.)
ALTER TABLE "university_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "university_favorites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "university_favorites";
CREATE POLICY tenant_isolation ON "university_favorites"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "university_favorites"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "university_favorites"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

-- ============================================================================
-- 3. Coach-owned. coachId is Coach.id, NOT a User id — comparing it to
--    app.current_user_id can never match (the same PK confusion that made every
--    coach cancel/reschedule 403; see isBookingParty in coachBookingsService.ts).
--    So the predicate has to hop through coaches.userId. `coaches` is
--    deliberately unpolicied, so this subquery is a plain lookup and does not
--    depend on nested RLS; the explicit userId equality is what isolates.
--    A coach has no schoolId, so there is NO school branch here by design —
--    adding one would let any school admin read another company's payout data.
-- ============================================================================

-- payouts. Coach reads their own (coachBookingsService.ts:539); the approve/
-- reject and platform-wide lists are super-admin (routes/admin.ts:232-256,
-- adminService.ts:195) -> bypass. GDPR erasure is runAsSystem (adminService:469).
ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payouts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payouts";
CREATE POLICY tenant_isolation ON "payouts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "payouts"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "payouts"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  );

-- bank_accounts. Only reader/writer is the coach themselves
-- (coachBookingsService.ts:559-560, routes/coach-bookings.ts:192,200).
-- Holds last4 + a Stripe Connect account id, so a leak here is a money leak.
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "bank_accounts";
CREATE POLICY tenant_isolation ON "bank_accounts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "bank_accounts"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "bank_accounts"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  );

-- payout_settings. Same owner shape; holds a raw bank account + routing number.
ALTER TABLE "payout_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payout_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "payout_settings";
CREATE POLICY tenant_isolation ON "payout_settings"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "payout_settings"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM coaches c
      WHERE c.id = "payout_settings"."coachId"
        AND c."userId" = current_setting('app.current_user_id', true)
        AND current_setting('app.current_user_id', true) <> ''
    )
  );

-- ============================================================================
-- 4. Direct schoolId (the 002-direct-schoolid shape).
-- ============================================================================

-- teacher_invites. Its old exemption ("GET /api/v1/teacher/onboarding/verify is
-- UNAUTHENTICATED and looks the row up by token before an account exists") is
-- STALE: that route and onboarding/complete both mount systemContext
-- (routes/teacher.ts:18,33), so they take the bypass branch — exactly like
-- counselor_invites, which has been policied in 005-sensitive all along. The
-- only tenant-context writer is schoolService.ts:278, under the inviting school
-- admin's own schoolId.
-- NOTE: schoolId is NULLABLE on this model. A NULL-schoolId invite matches
-- neither branch and is therefore system-only. That is intentional — a
-- school-less teacher invite belongs to no tenant, so no tenant should read it —
-- but it means such a row can only ever be redeemed through the systemContext
-- onboarding routes. schoolService.ts:278 always supplies a schoolId, so no such
-- row is created by the current code.
ALTER TABLE "teacher_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_invites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "teacher_invites";
CREATE POLICY tenant_isolation ON "teacher_invites"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );
