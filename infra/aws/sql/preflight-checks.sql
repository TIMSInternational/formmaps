-- ---------------------------------------------------------------------------
-- preflight-checks.sql -- READ-ONLY diagnostics for the Node -> .NET cutover.
--
-- Answers the questions that cannot be resolved from the repo or the AWS API,
-- because nexa-aurora-enc is private (no public endpoint) and the RDS Data API
-- is disabled. Everything here reads catalog views only: no table data, no
-- secrets, no writes, no DDL. Safe to run against production.
--
--   psql "$DATABASE_URL" -f infra/aws/sql/preflight-checks.sql
--
-- Paste the output back verbatim -- none of it is sensitive.
-- ---------------------------------------------------------------------------

\echo '=== 1. WHO AM I CONNECTED AS ==============================================='
-- Confirms which role the connection string actually uses. Expected today: the
-- prod Node app role shared with nexa-api (see formmaps#34).
SELECT current_user AS connected_as,
       current_database() AS database,
       version() AS server_version;

\echo ''
\echo '=== 2. DO THE CANDIDATE SERVICE ROLES ALREADY EXIST? ======================='
-- formmaps#34: three names exist in the docs. Establish which are real.
--   formmaps_dotnet_svc    -- infra/aws/sql/dotnet-service-role.sql (78 tables)
--   formmaps_dotnet_writer -- personality-prod-cutover-runbook.md, "do later"
-- rolbypassrls MUST be false for any role the .NET service uses.
SELECT rolname,
       rolcanlogin  AS can_login,
       rolsuper     AS is_superuser,
       rolbypassrls AS bypasses_rls
FROM pg_roles
WHERE rolname IN ('formmaps_dotnet_svc', 'formmaps_dotnet_writer')
   OR rolname = current_user
ORDER BY rolname;

\echo ''
\echo '=== 3. RLS POSTURE -- ENABLED vs FORCED ===================================='
-- formmaps#10/#34 flagged this as unknown and it has stayed unknown.
-- relrowsecurity  = RLS enabled
-- relforcerowsecurity = enforced even for the TABLE OWNER (the important one:
--   without FORCE, a table owner silently bypasses every policy).
SELECT
  count(*)                                             AS total_tables,
  count(*) FILTER (WHERE c.relrowsecurity)             AS rls_enabled,
  count(*) FILTER (WHERE c.relforcerowsecurity)        AS rls_forced,
  count(*) FILTER (WHERE NOT c.relrowsecurity)         AS rls_missing
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

\echo ''
\echo '--- tables with RLS enabled but NOT forced (owner bypasses policies) ---'
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relrowsecurity AND NOT c.relforcerowsecurity
ORDER BY 1
LIMIT 40;

\echo ''
\echo '--- tables with NO RLS at all ---'
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
ORDER BY 1
LIMIT 40;

\echo ''
\echo '=== 4. DO THE DOMAIN 9a SHADOW TABLES ALREADY EXIST? ======================='
-- formmaps#33. Expected: 0 rows (never applied anywhere).
SELECT c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('shadow_user_subscriptions', 'shadow_payments', 'shadow_stripe_events')
ORDER BY 1;

\echo ''
\echo '=== 5. DO THE DOMAIN 10 AUTH TABLES EXIST, AND WHAT SHAPE? ================='
-- formmaps#29 granted these. Confirm they exist in prod with the columns the
-- .NET repository binds -- especially the NOT NULL "updatedAt" with no default,
-- which the whole domain's SQL is written around.
SELECT c.relname AS table_name,
       (SELECT count(*) FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
       c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('refresh_tokens','password_reset_tokens','login_attempts',
                    'roles','user_settings','users','schools','user_subscriptions')
ORDER BY 1;

\echo ''
\echo '--- "updatedAt" columns: NOT NULL with no default is the expected shape ---'
SELECT c.relname AS table_name,
       a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updatedAt'
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relname IN ('refresh_tokens','password_reset_tokens','login_attempts','roles','user_settings','users','schools')
ORDER BY 1;

\echo ''
\echo '=== 6. BILLING ROWS THAT WOULD 404 ON CUTOVER (formmaps#30) ================'
-- The empirical question that may dissolve #30 entirely: does any ACTIVE
-- subscription exist with no stripeSubscriptionId? Counts only -- no user data.
SELECT count(*) AS active_subs_total,
       count(*) FILTER (WHERE "stripeSubscriptionId" IS NULL) AS active_without_stripe_id
FROM "user_subscriptions"
WHERE "isActive" = true;

\echo ''
\echo '=== done -- all read-only ==================================================='
