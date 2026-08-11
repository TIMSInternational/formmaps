-- RLS Phase C: sensitive / product-decision tables (decisions 2026-06-05).
--
-- NOTE (formmaps#77): the list below is now ENFORCED, not merely documented.
-- `npm run rls:check` (scripts/check-rls-coverage.mjs, run in CI) fails when a
-- tenant-scoped table has neither a policy nor a recorded decision. That script
-- holds the authoritative copy of these exemptions and their reasons — update
-- BOTH when this list changes. This comment was the only record for months, and
-- in that time 8 scoped tables drifted out of coverage unnoticed, including
-- tables in domains already live in .NET. Three of them were missed even by the
-- manual audit and were found by the check on its first run.
--
-- INTENTIONALLY UNPOLICIED (documented, app-level authz only):
--   coach marketplace: bookings, reviews, payments, coaches, coach_availabilities,
--     payout_settings, bank_accounts, payouts (orthogonal to school-tenancy);
--   ai_cache (owner-scoped in app code, derived output);
--   auth infra: password_reset_tokens, login_attempts;
--     ^ STALE UNTIL 2026-08-10: this line used to list `refresh_tokens` too. It is WRONG
--     and dangerously so. refresh_tokens IS policied, owner-only, by 007-self-scoped.sql:76
--     — a later file, applied 2026-08-09 and live in production (86/86/86). Believing this
--     line is what makes the #117 revocation bug look impossible: a cross-user
--     revokeAllUserTokens matches no rows under the caller's GUCs, updateMany returns
--     {count:0} and never throws, and the user is silently never signed out. Anyone
--     reasoning from this list would conclude that cannot happen. Removed from the list;
--     kept as a note because the wrong version survived two audits.
--   global catalog/reference: universities, university_programs, university_favorites,
--     courses, course_imports, roles, subscription_plans, platform_settings,
--     pca_exams, pca_questions, questions_360, stripe_events, career_favorites, audit_logs.
-- PRE-AUTH reads on policied tables here (login/signup/refresh/reset, onboarding
-- verify-by-token) MUST run under runAsSystem (handled in routes/services; the
-- Phase-D RLS_STRICT=1 audit verifies none were missed).

-- users: a user sees themselves + everyone in their school. Login/signup/refresh
-- /reset read users pre-auth -> those paths run under runAsSystem.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "users";
CREATE POLICY tenant_isolation ON "users"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("id" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("id" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

-- student_alerts: dual-key via studentId (school staff see their school's alerts).
ALTER TABLE "student_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_alerts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_alerts";
CREATE POLICY tenant_isolation ON "student_alerts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = "student_alerts"."studentId"
      AND u."schoolId" = current_setting('app.current_school_id', true)
      AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = "student_alerts"."studentId"
      AND u."schoolId" = current_setting('app.current_school_id', true)
      AND current_setting('app.current_school_id', true) <> '')
  );

-- counselor_invites: direct schoolId. Onboarding verify-by-token reads pre-auth -> runAsSystem.
ALTER TABLE "counselor_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselor_invites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselor_invites";
CREATE POLICY tenant_isolation ON "counselor_invites"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

-- conversations: visible to its participants. Cross-school is impossible (decision),
-- so participant match is the complete + tightest isolation.
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "conversations";
CREATE POLICY tenant_isolation ON "conversations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("participantAId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("participantBId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );

-- messages: inherit isolation from the parent conversation's own policy (nested RLS).
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "messages";
CREATE POLICY tenant_isolation ON "messages"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM conversations c WHERE c.id = "messages"."conversationId")
  );

-- framework_courses: global templates (schoolId NULL) shared with all; school overrides isolated.
ALTER TABLE "framework_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "framework_courses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "framework_courses";
CREATE POLICY tenant_isolation ON "framework_courses"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "schoolId" IS NULL
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "schoolId" IS NULL
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

-- admission_models: global model (schoolId NULL) shared; per-school models isolated.
ALTER TABLE "admission_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_models" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_models";
CREATE POLICY tenant_isolation ON "admission_models"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "schoolId" IS NULL
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "schoolId" IS NULL
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

-- admission_outcomes: school-scoped training data. The admission engine reads across
-- schools to train -> those reads run under runAsSystem.
ALTER TABLE "admission_outcomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admission_outcomes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "admission_outcomes";
CREATE POLICY tenant_isolation ON "admission_outcomes"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

-- form_drafts MOVED OUT to prisma/rls/008-form-drafts.sql (formmaps#117).
--
-- It was appended here on 08-03, AFTER this file had already been applied to
-- production, so form_drafts is unpolicied in prod while every other table in this
-- file is live. `rls:apply` runs whole files, so picking it up from here would mean
-- re-running the DROP POLICY / CREATE POLICY pair against ~10 LIVE tables — `users`
-- among them, which every school-branch EXISTS subquery in 002/003/007 resolves
-- through. 008 exists so the prod apply touches only the table that is missing.
--
-- THE RULE: a policy added to an already-applied file goes in a NEW file. Do not
-- append to this one.

