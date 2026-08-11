-- RLS: form_drafts (formmaps#77 / #117). SPLIT OUT OF 005-sensitive.sql.
--
-- WHY THIS IS ITS OWN FILE, and why it must stay that way:
--
-- `npm run rls:apply` (scripts/apply-rls.ts) runs WHOLE FILES — it shells out to
-- `prisma db execute --file <f>` once per file, with no statement selection. In CI
-- that is irrelevant: the database is empty and every file runs. In PRODUCTION it
-- is the whole problem. form_drafts was appended to 005-sensitive.sql on 08-03,
-- AFTER 005 had already been applied to prod, so form_drafts is one of the 14
-- tables measured `rls=f, forced=f` in prod on 08-08 while the other ~10 tables in
-- 005 are live and policied.
--
-- Re-running 005-sensitive.sql to pick up this one table would therefore
-- `DROP POLICY IF EXISTS tenant_isolation` and re-`CREATE POLICY` on ~10 LIVE
-- tables, `users` among them. `users` is not just another row in that list: every
-- school-branch `EXISTS (SELECT 1 FROM users u WHERE …)` subquery in 002/003/007
-- resolves through it, so a failure between the DROP and the CREATE leaves those
-- tables ENABLE + FORCE with no policy — which denies everything, silently, to
-- every caller. Splitting the one genuinely-missing table into its own file makes
-- the prod apply touch exactly the table it is supposed to touch.
--
-- The rule this encodes: any policy added to an ALREADY-APPLIED file goes in a NEW
-- file. Editing an applied file makes the prod apply strictly wider than the change.
--
-- Content below is byte-identical to the block removed from 005-sensitive.sql;
-- the policy shape is pinned by src/__tests__/rls/form-drafts-owner.integration.test.ts.

-- form_drafts (formmaps#77): a half-finished form the user has not submitted yet.
-- OWNER-ONLY, deliberately NOT the 003-fk-users school-inherit shape. Every app
-- path is already strictly owner-scoped -- POST upserts on (req.userId, formId),
-- GET filters `userId: req.userId`, DELETE 404s unless `draft.userId ===
-- req.userId` (routes/user.ts) -- so a school branch would grant the DATABASE more
-- than the application ever asks for. Verified against a real non-superuser
-- Postgres: under the fk-users shape a same-school PEER reads another student's
-- drafts; under this one they read none.
--
-- An earlier attempt here was drafted and then REVERTED because owner access could
-- not be demonstrated. That was a harness artifact, not a policy defect -- re-run
-- against real Postgres as the non-superuser role, the owner reads, inserts and
-- updates their own rows, both as a school user (school branch never needed) and
-- as a school-less user where app.current_school_id is ''. Pinned by
-- src/__tests__/rls/form-drafts-owner.integration.test.ts, which asserts owner
-- ACCESS and not only isolation -- the missing half of that first attempt.
--
-- GDPR erasure is unaffected: adminService deletes under runAsSystem with
-- tenantGucOp prepended, so it takes the bypass branch.
ALTER TABLE "form_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_drafts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "form_drafts";
CREATE POLICY tenant_isolation ON "form_drafts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
  );
