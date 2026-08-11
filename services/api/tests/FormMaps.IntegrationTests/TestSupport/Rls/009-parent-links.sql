-- RLS Phase E: admit PARENTS to their own student_parent_links rows (formmaps#121).
--
-- THE BUG. `student_parent_links` carries a `parentUserId` column that its
-- `tenant_isolation` policy (003-fk-users.sql:586) never mentions. That policy has
-- exactly two non-bypass branches:
--
--     "studentId" = app.current_user_id                      -- the child themselves
--     EXISTS (users u WHERE u.id = spl."studentId"
--             AND u."schoolId" = app.current_school_id
--             AND app.current_school_id <> '')                -- the child's school staff
--
-- A parent is neither. Parents are created with NO schoolId (routes/parent.ts:69)
-- and their token is minted `schoolId: null` (routes/parent.ts:76), so
-- resolveGucPlan yields identity with app.current_school_id = '' and the school
-- branch's own `<> ''` guard closes it. **No branch admits a parent.** Since every
-- parent authorization gate in the app IS a read of this table
-- (routes/parent.ts:102/:164/:228, routes/messages.ts:262, routes/test-scores.ts:351,
-- services/transcriptService.ts:99), every one of them failed closed and the whole
-- parent portal was dead. Measured in prod 2026-08-10: 2 parent accounts, both with
-- NULL schoolId, 1 onboarded and locked out.
--
-- PRE-EXISTING, not caused by the 2026-08-09 apply — 003-fk-users is one of the
-- original 72. That apply is only how it came to be looked at.
--
-- WHY A SEPARATE POLICY RATHER THAN EDITING tenant_isolation. 003-fk-users.sql is
-- already applied to production, and the rule is that a policy change to an applied
-- file goes in a NEW file. But we can do better than a new file that DROP/CREATEs
-- the live policy: PostgreSQL combines PERMISSIVE policies with OR, so adding a
-- second policy is purely ADDITIVE. `tenant_isolation` is never dropped, there is no
-- window in which the table is unprotected, and the rollback is one DROP POLICY.
--
-- WHY THIS DOES NOT ALSO FIX THE CHILD'S DATA TABLES. The obvious companion change —
-- a link-table branch on `users` so a parent can read their child's row — is
-- IMPOSSIBLE, not merely risky. `student_parent_links`' own policy sub-selects from
-- `users`, so a `users` policy that sub-selects from `student_parent_links` is
-- mutually recursive and PostgreSQL rejects it at execution time:
--
--     ERROR:  infinite recursion detected in policy for relation "users"
--
-- (verified against postgres:16 with these exact policies before this file was
-- written — it is not a theoretical concern, and it would have taken down every
-- query in the system, not just the parent's.) So the child-data reads are
-- authorized in CODE instead: each parent route first reads the link row through
-- THIS policy — self-scoped to `parentUserId = me`, which is the actual
-- authorization decision — and only then reads the child's data under runAsSystem.
-- That is the pattern routes/parent.ts:236 already used and documented for the
-- course-plan route; #121 is the rest of the surface catching up to it.
--
-- WHY NOT JUST GIVE PARENTS THE CHILD'S schoolId. Because app.current_school_id is
-- the whole-tenant key: it would hand every parent read access to every student in
-- the school. The link table is the correct, minimal grant.
--
-- SCOPE OF THE GRANT. SELECT and UPDATE only, deliberately:
--   * SELECT — every authorization gate above, plus /profile's child list.
--   * UPDATE — a parent may unlink themselves (routes/parent.ts:358, a soft delete
--     setting isActive=false) and re-send their own invitation (routes/parent.ts:381).
--   * no INSERT — no route lets a parent mint a link, and a permissive INSERT branch
--     would let one claim an arbitrary child by writing parentUserId = self.
--   * no DELETE — links are retired by soft delete; nothing issues a SQL DELETE for
--     a parent (adminService.ts:432's erasure runs outside this identity).
-- Omitted commands fall through to `tenant_isolation` alone, which still denies a
-- school-less parent. Least privilege is enforced by what is NOT here.
--
-- Idempotent, like every file in this directory.

ALTER TABLE "student_parent_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_parent_links" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parent_own_links_select ON "student_parent_links";
CREATE POLICY parent_own_links_select ON "student_parent_links"
  FOR SELECT
  USING (
    "parentUserId" = current_setting('app.current_user_id', true)
    AND current_setting('app.current_user_id', true) <> ''
  );

-- USING selects which rows the parent may update; the WITH CHECK re-asserts the
-- same predicate on the resulting row so an update cannot re-home the link onto
-- another parent. (Spelled out rather than left to default so the intent survives
-- an edit to the USING clause.)
DROP POLICY IF EXISTS parent_own_links_update ON "student_parent_links";
CREATE POLICY parent_own_links_update ON "student_parent_links"
  FOR UPDATE
  USING (
    "parentUserId" = current_setting('app.current_user_id', true)
    AND current_setting('app.current_user_id', true) <> ''
  )
  WITH CHECK (
    "parentUserId" = current_setting('app.current_user_id', true)
    AND current_setting('app.current_user_id', true) <> ''
  );
