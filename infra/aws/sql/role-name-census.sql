-- ---------------------------------------------------------------------------
-- role-name-census.sql -- READ-ONLY. Does any principal's role spell "admin"?
--
-- WHY THIS EXISTS (formmaps#151-adjacent, and larger than #151):
--
--   FormMapsRoles.Normalize maps the BARE string "admin" to SuperAdmin:
--     services/api/src/FormMaps.Domain/Auth/FormMapsRoles.cs:22
--       "super admin" or "super_admin" or "superadmin" or "admin" => SuperAdmin
--
--   RequestActor derives IsSuperAdmin from it:
--     services/api/src/FormMaps.Application/Auth/RequestActor.cs:11-13
--
--   and FormMapsRoles.RequiresSchoolContext returns FALSE for SuperAdmin, so such
--   a principal ALSO skips school scoping. Consequences include cross-school
--   password and email change (AuthEndpoints.cs:289-299 and :384-392).
--
--   The legacy Node stack is character-identical
--   (formmaps-platform/api/src/lib/auth.ts:22-50, `case "admin"`), so this is a
--   long-standing hole in BOTH stacks rather than a migration regression --
--   which also means fixing .NET alone does not close it.
--
--   The JWT role claim's ONLY source is users.roleName (auth.ts:184), and it is
--   signature-protected. So this is not a forgery bug: it requires a STORED role
--   string that spells "admin". Whether any such row exists is unknowable from
--   the repo and from the AWS API, and it decides two things at once:
--     * severity  -- zero rows = latent bug; any rows = live cross-tenant escalation
--     * fix safety -- mapping "admin" away from SuperAdmin could LOCK OUT a real
--                     administrator, so the fix must not be merged before this runs.
--
-- Catalog/data reads only. No writes, no DDL, no secrets. Safe on production.
-- Output is counts and role names -- paste it back verbatim, none of it is
-- sensitive (no emails, no user ids, no tokens).
-- ---------------------------------------------------------------------------

\echo '=== 1. ROLE NAME CENSUS (the whole question, one query) ===================='
-- NOTE ON THE COLUMN NAME: the roles table column is "name", NOT "roleName".
-- Prisma model Role { name String @unique } with @@map("roles") -- verified in
-- formmaps-platform/api/prisma/schema.prisma. A long-circulated version of this
-- census used roles."roleName" and would have failed outright with
-- `column "roleName" does not exist`. Only users.roleName exists (model User).
SELECT r."name" AS role_name,
       count(*) AS row_count,
       CASE
         WHEN lower(btrim(r."name")) IN ('super admin', 'super_admin', 'superadmin')
           THEN 'normalises to SuperAdmin (expected)'
         WHEN lower(btrim(r."name")) = 'admin'
           THEN '>>> NORMALISES TO SUPERADMIN VIA THE BARE-ADMIN BRANCH <<<'
         ELSE ''
       END AS normalization_note
FROM roles r
GROUP BY 1
ORDER BY 2 DESC;

\echo ''
\echo '=== 2. ARE ANY USERS ACTUALLY ON SUCH A ROLE? =============================='
-- A role row that no user references is inert. This is the question that turns
-- "a bad mapping exists" into "a live principal has it". Counts only.
SELECT r."name" AS role_name,
       count(u.id) AS users_on_this_role,
       count(DISTINCT u."schoolId") AS distinct_schools
FROM roles r
LEFT JOIN users u ON u."roleId" = r.id
WHERE lower(btrim(r."name")) IN ('admin', 'super admin', 'super_admin', 'superadmin')
GROUP BY 1
ORDER BY 2 DESC;

\echo ''
\echo '=== 3. DOES users.roleName AGREE WITH roles.name? =========================='
-- The JWT is minted from users.roleName (auth.ts:184), NOT from the join. If the
-- denormalised column has drifted, the census above could look clean while the
-- token still carries "admin". This checks the column the token actually uses.
SELECT u."roleName" AS user_role_name,
       count(*) AS user_count,
       CASE WHEN lower(btrim(u."roleName")) = 'admin'
            THEN '>>> TOKENS FOR THESE USERS NORMALISE TO SUPERADMIN <<<'
            ELSE '' END AS note
FROM users u
GROUP BY 1
ORDER BY 2 DESC;

\echo ''
\echo '=== 4. DRIFT BETWEEN THE TWO (rows where they disagree) ===================='
-- Counts only -- no identifiers. A nonzero result means the join-based view and
-- the token-based view of a user role disagree, and only the users column matters
-- for authorization.
SELECT count(*) AS users_whose_rolename_differs_from_their_role_row
FROM users u
JOIN roles r ON u."roleId" = r.id
WHERE lower(btrim(u."roleName")) IS DISTINCT FROM lower(btrim(r."name"));

\echo ''
\echo '=== done -- all read-only =================================================='
