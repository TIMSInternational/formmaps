-- =============================================================================
-- Least-privilege database role for the FormMaps .NET API service
--
-- Related to formmaps#10 ("Dedicated least-privilege DB role for the .NET
-- service", part of #4).
--
-- Context
-- -------
-- The .NET service currently authenticates with the legacy Node app's shared
-- DB credential (Aurora Postgres). That credential predates the .NET service
-- and grants it whatever the Node app has -- almost certainly broader than
-- what the .NET service actually needs. This script creates a dedicated role,
-- `formmaps_dotnet_svc`, scoped to exactly the tables the .NET service reads
-- and/or writes.
--
-- Table scope was originally derived by grepping services/api/src for every
-- raw-SQL FROM / JOIN / INSERT INTO / UPDATE / DELETE FROM target (both plain
-- and C#-escaped-quote string forms), then classifying each table found into a
-- bucket below by which verbs actually appear against it. That first pass
-- found 82 tables; the list has grown since and is no longer that number, so
-- no current count is quoted here -- a hand-maintained figure in a comment
-- goes stale silently (this header said 82, the test harness said 78, and the
-- stub schema said 86, all against the same list). What IS checked by machine
-- is that the granted set and the test harness's stub schema are the same set,
-- in both directions -- see the maintenance note at the bottom.
--
-- Domain 9a (subscription-billing shadow mode) added four of those 82:
-- `subscription_plans` (read-only -- PlanReader), and the `shadow_*` trio
-- (read/write -- written by the Stripe webhook handler, read back by the
-- reconciliation worker). See the note above section 4 for why
-- `shadow_payments` is granted even though no .NET code writes it yet.
--
-- What this role does NOT get, by design
-- ---------------------------------------
--   * SUPERUSER, CREATEDB, CREATEROLE, REPLICATION -- never needed by an app role.
--   * BYPASSRLS -- the app already has its own bypass mechanism: the
--     `app.bypass_rls` session GUC, set per-request by
--     RlsSessionCommandBuilder / NpgsqlFormMapsDatabaseSessionFactory and read
--     by each table's RLS policy predicate (see e.g. the `tenant_isolation`
--     policies in messaging-schema.sql). Postgres-level BYPASSRLS would make
--     that mechanism moot and let a compromised connection silently skip
--     every RLS policy regardless of the GUC. Do not add it to this role.
--   * CREATE on the `public` schema -- this role does not run migrations;
--     schema changes stay with the existing migrator/owner role.
--   * Any grant on tables outside the lists below, or on any schema other
--     than `public` (the service makes no cross-schema references).
--   * Sequence grants -- every table in this schema uses app-generated text
--     primary keys (cuid/uuid via `gen_random_uuid()`), not SERIAL/IDENTITY,
--     so there are no owned sequences to grant USAGE on.
--
-- How to run
-- ----------
-- Run once per environment (local/dev, staging, prod) by a role that owns
-- the tables (or is itself a superuser), connected to the target database:
--
--   psql "<admin-connection-string>" -f infra/aws/sql/dotnet-service-role.sql
--
-- This script is idempotent -- rerunning it is safe and will not error if the
-- role or grants already exist.
--
-- Setting the password (do this out of band -- never in this file)
-- -------------------------------------------------------------------------
-- The role is created WITHOUT a password, so it cannot log in until one is
-- set. After running this script:
--
--   ALTER ROLE formmaps_dotnet_svc WITH PASSWORD '<value from your secrets manager>';
--
-- then point the environment's DATABASE_URL secret (see
-- DatabaseUrlSecretArn in infra/aws/formmaps-api-{staging,prod}-service.yml)
-- at `formmaps_dotnet_svc` instead of the legacy Node credential, and
-- rotate/redeploy. This script does not do that part -- see the session
-- report for what remains a manual ops action against real infrastructure.
-- =============================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Create the role (idempotent) and pin its attributes even if it already
--    existed with something looser.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'formmaps_dotnet_svc') THEN
        CREATE ROLE formmaps_dotnet_svc
            WITH LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS
            CONNECTION LIMIT 20;
    END IF;
END
$$;

ALTER ROLE formmaps_dotnet_svc
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- 2. Connect + schema usage only. No CREATE on the schema (no DDL rights).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO formmaps_dotnet_svc', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO formmaps_dotnet_svc;
REVOKE CREATE ON SCHEMA public FROM formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 3. Read-only tables -- the .NET service only ever SELECTs from these
--    (verified: no INSERT INTO / UPDATE / DELETE FROM hits in services/api/src).
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE
    public."bookings",
    public."category_requirements",
    public."course_enrollments",
    public."courses",
    public."framework_courses",
    public."gpa_configurations",
    public."graduation_plan_items",
    public."graduation_plans",
    public."graduation_rule_sets",
    public."isams_sync_jobs",
    public."lia_questions",
    public."pca_evaluations",
    public."pca_exams",
    public."pca_questions",
    public."pca_results",
    public."reviews",
    public."student_grades",
    public."student_graduation_targets",
    -- Domain 9a: the subscription plan catalog, read by PlanReader to resolve a
    -- plan's Stripe Price id for POST /api/v1/billing/checkout-session.
    public."subscription_plans",
    public."universities",
    -- NOTE: "user_blocks" moved to the SELECT/INSERT/UPDATE tier below (#63/#80) --
    -- Messaging only ever READ blocks, which is why SELECT was right here. Porting
    -- moderation adds POST/DELETE /api/v1/moderation/block/:userId, which upserts
    -- and soft-deletes rows, so read-only would fail every block and unblock.
    public."user_career_profiles",
    public."user_preferences",
    -- NOTE: "user_settings" moved to the SELECT/INSERT/UPDATE tier below (Domain 10) --
    -- AuthAdminRepository.SignupAsync does INSERT INTO "user_settings". Read-only here would
    -- have failed every signup.
    -- NOTE: "user_subscriptions" moved to its own SELECT/UPDATE grant below (formmaps#30) --
    -- POST /api/v1/billing/cancel-subscription now UPDATEs the caller's own row (cancelAtPeriodEnd,
    -- or status/isActive when there is no Stripe subscription to cancel). Read-only here would fail
    -- every cancellation with 42501 the moment FORMMAPS_ROUTE_BILLING_TO_DOTNET is flipped.
    public."vocational_dimensions",
    public."vocational_instruments",
    public."vocational_question_variants",
    public."vocational_questions"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 3b. Read + update, never insert, never delete (formmaps#30).
--     "user_subscriptions" rows are still CREATED exclusively by legacy Node's Stripe webhook; the
--     .NET service only ever flips columns on a row that already exists, on the caller's own row, in
--     LiveSubscriptionWriter. So it gets UPDATE without INSERT rather than being folded into the
--     SELECT/INSERT/UPDATE tier below -- granting INSERT here would hand .NET the ability to mint
--     entitlements it has no code path for. DbRoleGrantsTests pins this exact verb set.
-- ---------------------------------------------------------------------------
GRANT SELECT, UPDATE ON TABLE
    public."user_subscriptions"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 4. Read/write tables where the service creates and updates rows but never
--    deletes them (verified: INSERT and/or UPDATE hits, no DELETE FROM hit).
--
--    Domain 9a note on the `shadow_*` trio: these are .NET-internal shadow
--    tables (infra/aws/sql/billing-shadow-tables.sql), written only by
--    BillingShadowRepository under the Stripe webhook and read back by
--    BillingReconciliationService. `shadow_user_subscriptions` and
--    `shadow_stripe_events` have live INSERT/UPDATE/SELECT hits today.
--    `shadow_payments` does NOT yet -- it is created by the same DDL and
--    reserved for the Domain 9b one-time/booking payment paths. It is granted
--    here so the whole shadow set moves as one unit rather than requiring an
--    ops re-run mid-domain; if 9b is dropped, drop this grant with it.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE
    public."application_checklists",
    public."application_essays",
    public."assessment_schedules",
    public."coaches",
    public."college_essays",
    -- #63/#80: moderation port. `reports` is INSERTed by POST /moderation/report and
    -- SELECTed by GET /moderation/reports; `user_blocks` is upserted by
    -- POST /block/:userId and soft-deleted (UPDATE isActive=false) by DELETE. Both
    -- moved/added here from the read-only tier. Not needed until the port lands, but
    -- granting late means an ops re-run mid-domain -- the exact failure #29 hit.
    public."reports",
    public."user_blocks",
    public."community_service_entries",
    public."conversations",
    public."counselor_availabilities",
    public."counselor_notes",
    public."counselor_sessions",
    public."course_change_requests",
    public."curriculum_frameworks",
    public."essay_comments",
    public."evaluation_feedbacks",
    public."evaluation_groups",
    public."isams_configs",
    public."lia_assessment_sessions",
    public."lia_responses",
    public."messages",
    public."notification_outbox",
    public."notifications",
    -- ---------------------------------------------------------------------
    -- Domain 10 (Auth): session issuance. AuthRepository/AuthAdminRepository
    -- read and write these on every login, refresh, logout, password reset and
    -- signup. "login_attempts" is in the full-CRUD tier below instead -- it is
    -- the only auth table the service DELETEs from.
    -- ---------------------------------------------------------------------
    public."password_reset_tokens",
    public."pca_exam_answers",
    public."pca_exam_sessions",
    public."personality_assessment_sessions",
    public."personality_responses",
    public."questions_360",
    public."refresh_tokens",   -- Domain 10: created on login, rotated on refresh, revoked on logout
    public."resumes",
    public."roles",            -- Domain 10: EnsureSchoolAdminRoleAsync / EnsureRoleAsync find-or-create
    public."school_assessment_settings",
    public."school_course_import_errors",
    public."school_course_import_jobs",
    public."school_courses",
    public."school_framework_course_overrides",
    public."schools",
    public."shadow_payments",
    public."shadow_stripe_events",
    public."shadow_user_subscriptions",
    public."student_alerts",
    public."student_applications",
    public."student_parent_links",
    public."student_portfolio_items",
    public."student_test_scores",
    public."university_favorites",
    public."user_settings",    -- Domain 10: INSERT by AuthAdminRepository.SignupAsync (moved from the read-only tier)
    public."users",
    public."vocational_integrated_results",
    public."vocational_responses",
    public."vocational_results"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 4.5. Audit trail (formmaps#52): append-only. SELECT + INSERT, and
--    deliberately NOT the UPDATE that the read/write bucket above carries.
--
--    `audit_events` is written only by AuditEventWriter (INSERT, one row per
--    event, under RequestContext.System()) and read only by AuditEventReader
--    (SELECT, for GET /api/v1/audit/events). No .NET code path updates or
--    deletes a row, and none ever should: an audit trail whose own service
--    account can rewrite or erase it answers "what happened?" with whatever
--    the last writer preferred.
--
--    This is the second of two independent locks, not the only one. The table
--    itself also REVOKEs the mutating verbs from PUBLIC and carries an
--    ENABLE ALWAYS statement trigger that raises on UPDATE/DELETE/TRUNCATE
--    even for the table owner and even under
--    session_replication_role = 'replica' (infra/aws/sql/audit-events-schema.sql).
--    Keeping both matters: the trigger binds the owner but can be dropped by
--    whoever owns the table, and this grant binds the service account but not
--    the owner. Neither subsumes the other.
--
--    Note the deliberate asymmetry with section 3b: there, withholding INSERT
--    stopped .NET minting entitlements it has no code for. Here it is UPDATE
--    and DELETE being withheld, for a different reason -- not "no code path
--    needs it" but "no code path may ever have it".
--
--    DbRoleGrantsTests.Audit_events_* pins this exact verb set, from the
--    catalog and behaviourally. Widening this GRANT fails those tests
--    (measured, both directions: SELECT,INSERT,UPDATE,DELETE and SELECT-only
--    each turn them red).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON TABLE
    public."audit_events"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 5. Full-CRUD tables -- the service also deletes rows here (verified:
--    DELETE FROM hits in services/api/src, e.g. calendar/holiday and
--    academic-year cleanup, course-plan removal, data-mapping deletion, and
--    Domain 10's login-attempt counter reset).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public."academic_terms",
    public."academic_years",
    public."assessment_periods",
    public."counselor_student_assignments",
    public."data_mappings",
    public."holidays",
    -- Domain 10: AuthRepository.ClearLoginAttemptsAsync does
    -- DELETE FROM "login_attempts" WHERE "email" = @email on every successful
    -- login, so this needs DELETE, not just the upsert/lock UPDATE.
    public."login_attempts",
    public."student_course_plans"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- Maintenance note
-- ---------------------------------------------------------------------------
-- When the .NET service starts touching a new table, add an explicit GRANT
-- for it here (in the appropriate bucket above) rather than widening this
-- role generically or granting ALTER DEFAULT PRIVILEGES for future tables --
-- the point of this role is that its privileges are an auditable, exact
-- reflection of what the service actually does, not a standing grant on
-- "whatever gets created next" in a schema this role does not own.
--
-- To regenerate the table scope from source:
--   grep -rhoE '\b(FROM|JOIN|INTO|UPDATE)\s+\\?"[a-zA-Z_0-9]+\\?"' services/api/src \
--     --include="*.cs" | grep -oE '[a-zA-Z_0-9]+\\?"$|"[a-zA-Z_0-9]+' | tr -d '"\\' | sort -u
-- then diff INSERT INTO / UPDATE / DELETE FROM hits the same way to re-split
-- into the read-only / no-delete / full-CRUD buckets.
--
-- Do NOT apply that re-derivation blindly. It reports which verbs the code
-- uses TODAY, which is the right default but is not the rule for every table:
--   * "user_subscriptions" (3b) and "audit_events" (4.5) are withheld verbs on
--     purpose, not for lack of a call site. Re-deriving mechanically would
--     widen both -- audit_events would land in the section-4 bucket and
--     quietly gain UPDATE, defeating the whole point of the table.
--   * "shadow_payments" (4) is granted despite having no call site yet.
-- The tests are the backstop: DbRoleGrantsTests pins those exact verb sets and
-- also fails if a table in the harness's stub schema has no GRANT here at all
-- (the reverse -- a GRANT for a table missing from the stub schema -- takes the
-- fixture down with 42P01 during init). Keep the two lists in sync when editing.
-- =============================================================================
