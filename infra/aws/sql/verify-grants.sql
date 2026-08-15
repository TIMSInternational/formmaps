-- =============================================================================
-- infra/aws/sql/verify-grants.sql — the proof queries formmaps#137 and
-- formmaps#128 name. Run after every apply (the workflow's verification step
-- runs this file unconditionally, even when an apply fails).
--
-- IDENTITY RULES — read these before trusting any output:
--
--   * Sections 1–3 are CATALOG checks. They pass the role name
--     ('formmaps_dotnet_svc') as an explicit ARGUMENT to
--     has_table_privilege / has_schema_privilege and read pg_roles /
--     information_schema, so ANY identity gets true answers about grant
--     EXISTENCE. They prove nothing about runtime RLS behaviour.
--
--   * Section 4 is the BEHAVIOURAL check and must run connected AS
--     formmaps_dotnet_svc. It self-skips under any other identity.
--
--   * NEVER judge RLS behaviour from a nexaadmin session. nexaadmin is in
--     rds_superuser, and RLS does not apply to it: through nexaadmin the
--     bypass-only policy on audit_events looks like no policy at all. A
--     "verification" of row visibility done as nexaadmin proves NOTHING about
--     what the app role can see or write (formmaps#137, apply-order caveat 2).
--
-- Verdict vocabulary in the grant matrix (section 2):
--   PASS        privilege state matches expectation
--   FAIL        mismatch on an existing object -> this script raises and
--               exits non-zero, so the workflow verification step goes red
--   KNOWN-GAP   expected-but-missing grant already on record (see the
--               audit_logs row); reported loudly, does not fail the run
--   ABSENT      the table does not exist yet. Expected mid-sequence (e.g.
--               audit_events before formmaps#52 merges). NOT a pass: a green
--               run whose matrix shows ABSENT rows proves nothing about those
--               rows — the billing flip / #52 deploy needs the PASS lines.
--
-- How to run manually (the workflow does all of this for you):
--   catalog only:        psql "<admin-conn>" -f infra/aws/sql/verify-grants.sql
--   full incl. section 4: psql "<formmaps_dotnet_svc-conn>" -f infra/aws/sql/verify-grants.sql
-- =============================================================================

\set ON_ERROR_STOP on

\echo '=== 0. WHO IS RUNNING THIS ================================================='
SELECT current_user AS connected_as,
       current_database() AS database,
       now() AS at;

SELECT (current_user = 'formmaps_dotnet_svc') AS is_dotnet_svc,
       (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
       OR CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_superuser')
               THEN pg_has_role(current_user, 'rds_superuser', 'MEMBER')
               ELSE false
          END AS is_superuserish
\gset

\if :is_superuserish
\echo ''
\echo 'WARNING: this session is a superuser / rds_superuser member (e.g. nexaadmin).'
\echo 'RLS does not apply to it. Row-visibility observations from this session are'
\echo 'MEANINGLESS for app-role behaviour. Catalog sections below remain valid'
\echo '(they name the role explicitly); the behavioural section will be skipped.'
\endif

\echo ''
\echo '=== 1. ROLE POSTURE (any identity) ========================================='
-- formmaps_dotnet_svc: expect can_login=t and f everywhere else.
-- bypasses_rls=t or superuser=t on the service role is a HARD FAILURE — it
-- would moot the app.bypass_rls GUC mechanism (dotnet-service-role.sql, "What
-- this role does NOT get").
-- formmaps_app is the legacy/Node app role name as used in formmaps#137; if
-- preflight-checks.sql section 1 shows the shared credential logs in as a
-- different rolname, read that row under its real name instead.
SELECT rolname,
       rolcanlogin  AS can_login,
       rolsuper     AS superuser,
       rolbypassrls AS bypasses_rls,
       rolcreaterole AS create_role,
       rolcreatedb  AS create_db
FROM pg_roles
WHERE rolname IN ('formmaps_dotnet_svc', 'formmaps_app')
ORDER BY rolname;

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'formmaps_dotnet_svc') AS svc_role_exists
\gset

\if :svc_role_exists

SELECT (rolsuper OR rolbypassrls) AS svc_role_compromised
FROM pg_roles WHERE rolname = 'formmaps_dotnet_svc'
\gset
\if :svc_role_compromised
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: formmaps_dotnet_svc holds SUPERUSER or BYPASSRLS. See dotnet-service-role.sql section 1 — re-apply it and investigate who widened the role.'; END $$;
\endif

SELECT has_schema_privilege('formmaps_dotnet_svc', 'public', 'CREATE') AS svc_can_create
\gset
\if :svc_can_create
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: formmaps_dotnet_svc holds CREATE on schema public — it must never run DDL (dotnet-service-role.sql section 2).'; END $$;
\endif

\echo ''
\echo '--- schema access (expect usage=t) ---'
SELECT has_schema_privilege('formmaps_dotnet_svc', 'public', 'USAGE') AS usage_on_public;

\echo ''
\echo '=== 2. GRANT MATRIX for formmaps_dotnet_svc (any identity) ================='
-- has_table_privilege() takes the role as an argument: these rows are about
-- formmaps_dotnet_svc no matter who executes them. Existence only — see the
-- identity rules in the header.
CREATE TEMP TABLE _verify_grants AS
WITH checks(tbl, priv, expected, hard, why) AS (
    VALUES
    -- formmaps#52 / #137: append-only audit trail. SELECT+INSERT and NOTHING
    -- else — UPDATE/DELETE granted here would make the trail rewritable by
    -- its own writer, the exact property #52 exists to eliminate.
    ('public.audit_events', 'SELECT', true,  true,  'formmaps#52: AuditEventReader (GET /api/v1/audit/events)'),
    ('public.audit_events', 'INSERT', true,  true,  'formmaps#52: AuditEventWriter'),
    ('public.audit_events', 'UPDATE', false, true,  'immutable trail: must NEVER be granted'),
    ('public.audit_events', 'DELETE', false, true,  'immutable trail: must NEVER be granted'),
    -- formmaps#30 / #137: the billing flip is illegal until SELECT+UPDATE
    -- here read PASS. INSERT stays withheld — .NET has no code path that
    -- creates subscription rows and must not be able to mint entitlements.
    ('public.user_subscriptions', 'SELECT', true,  true, 'formmaps#30: billing reads own row'),
    ('public.user_subscriptions', 'UPDATE', true,  true, 'formmaps#30: cancel-subscription flips columns'),
    ('public.user_subscriptions', 'INSERT', false, true, 'withheld: .NET must not mint entitlements'),
    ('public.user_subscriptions', 'DELETE', false, true, 'withheld: no delete path exists'),
    -- formmaps#44: the billing soak cannot start until the trio exists AND
    -- these read PASS (webhook writes, reconciliation worker reads).
    ('public.shadow_user_subscriptions', 'SELECT', true, true, 'formmaps#44 soak: reconciliation reads'),
    ('public.shadow_user_subscriptions', 'INSERT', true, true, 'formmaps#44 soak: webhook writes'),
    ('public.shadow_user_subscriptions', 'UPDATE', true, true, 'formmaps#44 soak: webhook updates'),
    ('public.shadow_stripe_events', 'SELECT', true, true, 'formmaps#44 soak: dedupe reads'),
    ('public.shadow_stripe_events', 'INSERT', true, true, 'formmaps#44 soak: event marker writes'),
    ('public.shadow_stripe_events', 'UPDATE', true, true, 'formmaps#44 soak: granted with the trio'),
    ('public.shadow_payments', 'SELECT', true, true, 'granted with the trio (dotnet-service-role.sql sec 4 note)'),
    ('public.shadow_payments', 'INSERT', true, true, 'granted with the trio'),
    ('public.shadow_payments', 'UPDATE', true, true, 'granted with the trio'),
    -- formmaps#128 / cutover: SchoolUsersWriter.cs does INSERT INTO
    -- "audit_logs" (role-change audit rows), but as of 2026-08-14
    -- dotnet-service-role.sql grants NOTHING on audit_logs. Today this works
    -- only because the .NET service still runs on the legacy shared
    -- credential; the moment DATABASE_URL flips to formmaps_dotnet_svc, every
    -- role change 42501s. hard=false: reported as KNOWN-GAP, does not fail
    -- the run — fixing it means adding the grant to dotnet-service-role.sql.
    ('public.audit_logs', 'INSERT', true, false, 'KNOWN-GAP: SchoolUsersWriter INSERTs audit_logs; no grant in dotnet-service-role.sql — breaks at credential cutover')
)
SELECT tbl,
       priv,
       expected,
       CASE WHEN to_regclass(tbl) IS NULL THEN NULL
            ELSE has_table_privilege('formmaps_dotnet_svc', tbl, priv)
       END AS actual,
       CASE WHEN to_regclass(tbl) IS NULL THEN 'ABSENT'
            WHEN has_table_privilege('formmaps_dotnet_svc', tbl, priv) = expected THEN 'PASS'
            WHEN NOT hard THEN 'KNOWN-GAP'
            ELSE 'FAIL'
       END AS verdict,
       hard,
       why
FROM checks;

SELECT tbl AS "table", priv, expected, actual, verdict, why
FROM _verify_grants
ORDER BY tbl, priv;

SELECT count(*) > 0 AS has_hard_failures
FROM _verify_grants WHERE verdict = 'FAIL'
\gset
\if :has_hard_failures
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: grant matrix mismatches on existing objects — see the FAIL rows above. Re-apply dotnet-service-role.sql (after the table-creating files) and re-verify.'; END $$;
\endif

\else
\echo ''
\echo 'formmaps_dotnet_svc does not exist — grant matrix skipped.'
\echo 'Expected before dotnet-service-role.sql has ever been applied. It also means'
\echo 'NO deploy that relies on the role is legal yet (formmaps#137): the audit'
\echo 'writer would 42501 into its fail-soft catch and the billing flip is unproven.'
\endif

\echo ''
\echo '=== 3a. audit_events RLS + immutability posture (any identity) ============='
SELECT to_regclass('public.audit_events') IS NOT NULL AS audit_events_exists
\gset
\if :audit_events_exists
-- Expect rls_enabled=t AND rls_forced=t. Enabled-but-not-forced means the
-- table OWNER silently bypasses every policy — hard failure.
SELECT c.relname,
       c.relrowsecurity     AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'audit_events';

SELECT NOT (c.relrowsecurity AND c.relforcerowsecurity) AS audit_rls_broken
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'audit_events'
\gset
\if :audit_rls_broken
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: audit_events exists without ENABLE+FORCE ROW LEVEL SECURITY — re-apply audit-events-schema.sql.'; END $$;
\endif

\echo ''
\echo '--- policy (expect exactly audit_events_bypass_only) ---'
SELECT p.polname, p.polcmd
FROM pg_policy p
WHERE p.polrelid = to_regclass('public.audit_events');

\echo ''
\echo '--- immutability trigger (expect audit_events_immutable, enabled = A) ---'
-- tgenabled MUST be 'A' (ENABLE ALWAYS). 'O' silently no-ops under
-- session_replication_role = replica — see audit-events-schema.sql.
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = to_regclass('public.audit_events') AND NOT tgisinternal;

SELECT NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.audit_events')
      AND tgname = 'audit_events_immutable'
      AND tgenabled = 'A'
) AS audit_trigger_missing
\gset
\if :audit_trigger_missing
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: audit_events exists but the ENABLE ALWAYS immutability trigger audit_events_immutable is missing or not ALWAYS — re-apply audit-events-schema.sql.'; END $$;
\endif
\else
\echo 'audit_events does not exist yet (expected until formmaps#52 merges and'
\echo 'audit-events-schema.sql is applied). The #52 deploy stays blocked.'
\endif

\echo ''
\echo '=== 3b. Who can do what to audit_logs (run as nexaadmin for full picture) =='
-- formmaps#128: the legacy app role currently holds INSERT/UPDATE/DELETE on
-- audit_logs; the acceptance criterion is INSERT-only. This block is a REPORT,
-- not a pass/fail — the revoke has not happened yet and must be a deliberate,
-- separate action ("confirm nothing legitimately updates it first").
-- IDENTITY: information_schema.table_privileges only shows rows the current
-- role is entitled to see, so run this block as nexaadmin for the complete
-- inventory; as any other role it may be partial.
SELECT grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'audit_logs'
GROUP BY grantee
ORDER BY grantee;

\echo ''
\echo '=== 4. BEHAVIOURAL (requires connecting AS formmaps_dotnet_svc) ==========='
\if :is_dotnet_svc
\if :audit_events_exists
-- 4a. Without the bypass GUC, the bypass-only policy must yield ZERO rows,
--     whatever the table actually holds. Enforced, not just printed: a
--     non-zero count means the policy is not doing its job, so this script
--     raises and exits non-zero and the workflow verification step goes red.
SELECT count(*) AS rows_visible_without_bypass_guc FROM public.audit_events;

SELECT count(*) > 0 AS rows_leak_without_bypass_guc FROM public.audit_events
\gset
\if :rows_leak_without_bypass_guc
DO $$ BEGIN RAISE EXCEPTION 'HARD FAIL: formmaps_dotnet_svc can see audit_events rows WITHOUT app.bypass_rls=on — the bypass-only policy is not enforcing. Check ENABLE+FORCE ROW LEVEL SECURITY and the audit_events_bypass_only policy (re-apply audit-events-schema.sql) and investigate how the rows became visible.'; END $$;
\endif

-- 4b. With the bypass GUC, INSERT and SELECT must both work — this is the
--     write path the fail-soft writer needs (formmaps#137: "confirm a real
--     write lands"). The probe is ROLLED BACK: nothing persists, the trail is
--     not polluted, and the immutability trigger is never provoked.
BEGIN;
SET LOCAL app.bypass_rls = 'on';
INSERT INTO public.audit_events ("id", "eventType", "subjectType", "outcome", "metadata")
VALUES ('verify-grants-probe-' || md5(random()::text || clock_timestamp()::text),
        'verify.grants.probe', 'verification', 'success',
        jsonb_build_object('source', 'infra/aws/sql/verify-grants.sql'));
SELECT count(*) AS rows_visible_with_bypass_guc FROM public.audit_events;
ROLLBACK;
\echo 'behavioural probe OK: INSERT + SELECT succeeded under app.bypass_rls=on (rolled back).'
\echo 'NOTE: the rolled-back probe proves grant + policy; formmaps#137 additionally'
\echo 'wants one REAL audited action performed and counted after the #52 deploy.'

-- Manual negative probes (run by hand, expected to ERROR — they are not
-- automated because an expected error would abort this script under
-- ON_ERROR_STOP):
--   BEGIN; SET LOCAL app.bypass_rls='on';
--   UPDATE public.audit_events SET "outcome"='x' WHERE false;   -- expect 42501 (no UPDATE grant)
--   ROLLBACK;
-- and as a role that DOES hold UPDATE (e.g. the owner), the same UPDATE must
-- be stopped by the immutability trigger instead.
\else
\echo 'audit_events absent — behavioural probes skipped.'
\endif
\else
\echo 'SKIPPED: this session is not formmaps_dotnet_svc.'
\echo 'Catalog sections above remain authoritative for grant EXISTENCE, but'
\echo 'formmaps#137 requires this behavioural block to have run as the app role'
\echo 'before the #52 deploy. Configure FORMMAPS_SQL_APP_DB_SECRET_ID (see the'
\echo 'runbook) or connect manually as formmaps_dotnet_svc and rerun this file.'
\endif

\echo ''
\echo '=== verify-grants.sql done ================================================='
