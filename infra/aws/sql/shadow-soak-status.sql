-- ---------------------------------------------------------------------------
-- shadow-soak-status.sql -- READ-ONLY. Has the #44 billing shadow soak started?
--
-- WHY THIS EXISTS:
--
--   The migration plan's schedule rests on "#44's soak has NEVER started (shadow
--   tables applied nowhere), so M2's elapsed floor is ~1 billing cycle from the
--   first apply." preflight-checks.sql (run 2026-08-16) disproved the premise:
--   all three shadow tables ALREADY EXIST in production.
--
--   That makes billing-shadow-tables.sql a no-op (it is CREATE TABLE IF NOT
--   EXISTS x3), so applying it would start nothing while looking like progress.
--
--   But EXISTENCE IS NOT A SOAK. A soak requires the shadow WRITE PATH to be
--   deployed and writing. This file measures that, because the answer changes
--   which critical path M2 is actually on:
--
--     rows > 0 and recent  -> the soak is already running; the clock started at
--                             the oldest row, not at some future apply
--     rows > 0 but stale   -> it ran and STOPPED; find out when and why
--     rows = 0             -> the blocker was never SQL. It is the shadow-write
--                             code path, and no amount of applying DDL starts it
--
-- Catalog and count reads only. No writes, no DDL, no secrets, no user data --
-- counts and timestamps only, so the output can be pasted back verbatim.
-- ---------------------------------------------------------------------------

\echo '=== 1. SHAPE: do the live tables still match billing-shadow-tables.sql? ==='
-- Drift matters: if the deployed writer targets a column that was renamed or
-- never created, it fails at runtime and the soak silently never fills.
-- Expected column counts from the DDL: subs 10, payments 8, events 3.
SELECT c.relname                                  AS table_name,
       count(a.attnum)                            AS live_columns,
       CASE c.relname
         WHEN 'shadow_user_subscriptions' THEN 10
         WHEN 'shadow_payments'           THEN 8
         WHEN 'shadow_stripe_events'      THEN 3
       END                                        AS expected_columns,
       CASE WHEN count(a.attnum) = CASE c.relname
              WHEN 'shadow_user_subscriptions' THEN 10
              WHEN 'shadow_payments'           THEN 8
              WHEN 'shadow_stripe_events'      THEN 3 END
            THEN 'match' ELSE '>>> DRIFT <<<' END AS shape
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE c.relname IN ('shadow_user_subscriptions', 'shadow_payments', 'shadow_stripe_events')
GROUP BY c.relname
ORDER BY c.relname;

\echo ''
\echo '=== 2. OCCUPANCY: has ANYTHING ever been written? (the whole question) ==='
-- oldest_row is the real soak start date. If rows exist, the clock started then
-- -- not on any future apply -- and M2 elapsed floor must be recomputed from it.
-- newest_row says whether writing is ONGOING or stopped.
SELECT 'shadow_user_subscriptions' AS table_name,
       count(*)                    AS rows,
       min("createdDate")          AS oldest_row,
       max("updatedAt")            AS newest_write
FROM shadow_user_subscriptions
UNION ALL
SELECT 'shadow_payments', count(*), min("createdDate"), max("updatedAt")
FROM shadow_payments
UNION ALL
SELECT 'shadow_stripe_events', count(*), min("processedAt"), max("processedAt")
FROM shadow_stripe_events
ORDER BY 1;

\echo ''
\echo '=== 3. LIVE COUNTERPARTS: is the shadow keeping up with reality? ========='
-- count(*) only -- deliberately no column assumptions about the live tables.
-- preflight measured 5 active subscriptions, 0 without a Stripe id. A shadow
-- table sitting at 0 against a non-zero live count means the writer is not
-- running, regardless of what the deployment history suggests.
SELECT 'user_subscriptions' AS live_table, count(*) AS live_rows FROM user_subscriptions
UNION ALL
SELECT 'stripe_events', count(*) FROM stripe_events
ORDER BY 1;

\echo ''
\echo '=== 4. RECENCY BUCKETS (only meaningful if section 2 is non-zero) ========'
-- Distinguishes "wrote once during a test" from "writing continuously".
SELECT 'shadow_stripe_events' AS table_name,
       count(*) FILTER (WHERE "processedAt" > now() - interval '24 hours') AS last_24h,
       count(*) FILTER (WHERE "processedAt" > now() - interval '7 days')   AS last_7d,
       count(*) FILTER (WHERE "processedAt" > now() - interval '30 days')  AS last_30d
FROM shadow_stripe_events
UNION ALL
SELECT 'shadow_payments',
       count(*) FILTER (WHERE "updatedAt" > now() - interval '24 hours'),
       count(*) FILTER (WHERE "updatedAt" > now() - interval '7 days'),
       count(*) FILTER (WHERE "updatedAt" > now() - interval '30 days')
FROM shadow_payments
UNION ALL
SELECT 'shadow_user_subscriptions',
       count(*) FILTER (WHERE "updatedAt" > now() - interval '24 hours'),
       count(*) FILTER (WHERE "updatedAt" > now() - interval '7 days'),
       count(*) FILTER (WHERE "updatedAt" > now() - interval '30 days')
FROM shadow_user_subscriptions
ORDER BY 1;

\echo ''
\echo '=== done -- all read-only ================================================'
