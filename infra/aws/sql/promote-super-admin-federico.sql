-- =====================================================================================
-- PROMOTE federico@nexadev.ai TO SUPER ADMIN — one account, one time.
--
-- WHY THIS IS SQL AND NOT THE ADMIN PANEL
--   Production has exactly one Super Admin, a shared test fixture whose production
--   password nobody holds (flagged unrotated since 2026-07-10; the rotation script
--   postdates the migrate task's image). "Agregar usuario" with role "admin" would be the
--   normal path, but it needs a Super Admin session to reach. This file is that one
--   missing step; everything after it goes back through the app.
--
-- PRECONDITION — the owner signs up FIRST, at app.formmaps.com, with this email and a
-- password only he knows. This file never sees, sets or hashes a password; it changes
-- the role of an account that already authenticates. That is also why it refuses an
-- account with no password: that would be a pending invite, and promoting a pending
-- invite hands Super Admin to whoever holds its onboarding link.
--
-- HOW TO RUN — via .github/workflows/formmaps-sql-apply.yml, which applies this under
-- `psql --single-transaction -v ON_ERROR_STOP=1`: any RAISE below rolls back everything,
-- including the audit row. No BEGIN/COMMIT here, by design.
--
-- AFTER — permissions are baked into the access token, so the owner must SIGN OUT and
-- back in before the admin panel appears.
-- =====================================================================================

DO $$
DECLARE
  target_email constant text := 'federico@nexadev.ai';
  n_users      int;
  u            record;
  super_role   record;
  n_updated    int;
BEGIN
  SELECT count(*) INTO n_users FROM users WHERE lower(email) = target_email;
  IF n_users <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 user with email %, found % — sign up first (or dedupe) and re-run', target_email, n_users;
  END IF;

  SELECT id, email, "roleName", "schoolId", "isActive", (password IS NOT NULL) AS has_password
    INTO u FROM users WHERE lower(email) = target_email;

  IF NOT u.has_password THEN
    RAISE EXCEPTION 'user % has no password (a pending invite?) — refusing to promote an account nobody has claimed', u.id;
  END IF;
  IF NOT u."isActive" THEN
    RAISE EXCEPTION 'user % is inactive — refusing', u.id;
  END IF;
  IF u."roleName" = 'Super Admin' THEN
    RAISE EXCEPTION 'user % is already Super Admin — nothing to do', u.id;
  END IF;

  SELECT id, name INTO super_role FROM roles WHERE name = 'Super Admin' AND "isActive";
  IF super_role.id IS NULL THEN
    RAISE EXCEPTION 'no active roles row named ''Super Admin'' — refusing';
  END IF;

  UPDATE users
     SET "roleId"    = super_role.id,
         "roleName"  = super_role.name,
         "schoolId"  = NULL,               -- platform admins carry no tenant
         "updatedBy" = 'sql-apply:promote-super-admin-federico',
         "updatedAt" = now()
   WHERE id = u.id;
  GET DIAGNOSTICS n_updated = ROW_COUNT;
  IF n_updated <> 1 THEN
    RAISE EXCEPTION 'updated % rows, expected 1 — rolling back', n_updated;
  END IF;

  -- Same action name and details shape as the app's own role change (legacy
  -- api/src/routes/school.ts:99), so it reads alongside every other one in the audit view.
  INSERT INTO audit_logs (id, "actorId", "actorEmail", action, "resourceType", "resourceId", details, "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    'sql-apply',
    'sql-apply:promote-super-admin-federico.sql',
    'USER_ROLE_CHANGE',
    'User',
    u.id,
    jsonb_build_object('from', u."roleName", 'to', super_role.name,
                       'fromSchoolId', u."schoolId", 'via', 'formmaps-sql-apply workflow'),
    now()
  );

  RAISE NOTICE 'promoted % (%) from % to %', u.email, u.id, u."roleName", super_role.name;
END
$$;

-- Printed back through the workflow log so the run shows its own result.
SELECT id, email, "roleName", "schoolId", "updatedBy", "updatedAt"
  FROM users WHERE lower(email) = 'federico@nexadev.ai';
