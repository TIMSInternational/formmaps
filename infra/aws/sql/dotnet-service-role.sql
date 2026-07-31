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
-- Table scope was derived by grepping services/api/src for every raw-SQL
-- FROM / JOIN / INSERT INTO / UPDATE / DELETE FROM target (both plain and
-- C#-escaped-quote string forms), then classifying each of the 78 tables
-- found into one of three buckets below by which verbs actually appear
-- against it in the current codebase (as of 2026-07-31). See the maintenance
-- note at the bottom for how to re-derive this list as the service grows.
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
    public."universities",
    public."user_blocks",
    public."user_career_profiles",
    public."user_preferences",
    public."user_settings",
    public."user_subscriptions",
    public."vocational_dimensions",
    public."vocational_instruments",
    public."vocational_question_variants",
    public."vocational_questions"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 4. Read/write tables where the service creates and updates rows but never
--    deletes them (verified: INSERT and/or UPDATE hits, no DELETE FROM hit).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE
    public."application_checklists",
    public."application_essays",
    public."assessment_schedules",
    public."coaches",
    public."college_essays",
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
    public."pca_exam_answers",
    public."pca_exam_sessions",
    public."personality_assessment_sessions",
    public."personality_responses",
    public."questions_360",
    public."resumes",
    public."school_assessment_settings",
    public."school_course_import_errors",
    public."school_course_import_jobs",
    public."school_courses",
    public."school_framework_course_overrides",
    public."schools",
    public."student_alerts",
    public."student_applications",
    public."student_parent_links",
    public."student_portfolio_items",
    public."student_test_scores",
    public."university_favorites",
    public."users",
    public."vocational_integrated_results",
    public."vocational_responses",
    public."vocational_results"
    TO formmaps_dotnet_svc;

-- ---------------------------------------------------------------------------
-- 5. Full-CRUD tables -- the service also deletes rows here (verified:
--    DELETE FROM hits in services/api/src, e.g. calendar/holiday and
--    academic-year cleanup, course-plan removal, data-mapping deletion).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public."academic_terms",
    public."academic_years",
    public."assessment_periods",
    public."counselor_student_assignments",
    public."data_mappings",
    public."holidays",
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
-- =============================================================================
