-- =====================================================================================
-- MAKE fedetafur@vt.edu SCHOOL ADMIN of the school federico@nexadev.ai used to run.
--
-- Follows promote-super-admin-federico.sql, which moved federico@nexadev.ai from
-- school_admin to Super Admin and so left that school without its admin. This hands the
-- school to fedetafur@vt.edu. The school is NOT typed in here: it is read from the audit
-- row that promotion wrote (details->>'fromSchoolId'), so it is exactly the school that
-- lost its admin and cannot be a typo.
--
-- Mirrors the app's own role change (legacy api/src/services/schoolService.ts:253-255):
-- roleId + roleName in one statement, plus schoolId here because the account may be in
-- another school or none. No other table holds school-admin membership.
--
-- PRECONDITION — fedetafur@vt.edu already has a FormMaps account with a password. If it
-- has none, this refuses: the right path then is Admin -> Users -> Invitar (School Admin,
-- that school), which sets the password through the invite link.
--
-- Applied by formmaps-sql-apply under --single-transaction + ON_ERROR_STOP: any RAISE
-- rolls back everything, including the audit row.
--
-- AFTER — sign out and back in on fedetafur@vt.edu; the role is baked into the token.
-- =====================================================================================

DO $$
DECLARE
  target_email constant text := 'fedetafur@vt.edu';
  prior_admin  constant text := 'federico@nexadev.ai';
  n_users      int;
  u            record;
  school_id    text;
  school_name  text;
  admin_role   record;
  n_updated    int;
BEGIN
  -- The school federico@nexadev.ai left, as recorded by the promotion.
  SELECT a.details->>'fromSchoolId' INTO school_id
    FROM audit_logs a
    JOIN users p ON p.id = a."resourceId"
   WHERE lower(p.email) = prior_admin
     AND a.action = 'USER_ROLE_CHANGE'
     AND a."actorId" = 'sql-apply'
     AND a.details->>'from' = 'school_admin'
   ORDER BY a."createdDate" DESC
   LIMIT 1;
  IF school_id IS NULL THEN
    RAISE EXCEPTION 'no promotion audit row with a fromSchoolId for % — refusing to guess the school', prior_admin;
  END IF;

  SELECT name INTO school_name FROM schools WHERE id = school_id;
  IF school_name IS NULL THEN
    RAISE EXCEPTION 'school % (from the audit row) no longer exists — refusing', school_id;
  END IF;

  SELECT count(*) INTO n_users FROM users WHERE lower(email) = target_email;
  IF n_users <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 user with email %, found % — if 0, invite them via Admin -> Users -> Invitar (School Admin, %)',
      target_email, n_users, school_name;
  END IF;

  SELECT id, email, "roleName", "schoolId", "isActive", (password IS NOT NULL) AS has_password
    INTO u FROM users WHERE lower(email) = target_email;

  IF NOT u.has_password THEN
    RAISE EXCEPTION 'user % has no password (a pending invite) — use Admin -> Users -> Invitar (School Admin, %) instead', u.id, school_name;
  END IF;
  IF NOT u."isActive" THEN
    RAISE EXCEPTION 'user % is inactive — refusing', u.id;
  END IF;
  IF u."roleName" IN ('Super Admin', 'Admin') THEN
    RAISE EXCEPTION 'user % is a platform admin — refusing to demote it to school admin', u.id;
  END IF;
  IF u."roleName" = 'school_admin' AND u."schoolId" = school_id THEN
    RAISE EXCEPTION 'user % is already school_admin of % — nothing to do', u.id, school_name;
  END IF;

  SELECT id, name INTO admin_role FROM roles WHERE name = 'school_admin' AND "isActive";
  IF admin_role.id IS NULL THEN
    RAISE EXCEPTION 'no active roles row named ''school_admin'' — refusing';
  END IF;

  UPDATE users
     SET "roleId"    = admin_role.id,
         "roleName"  = admin_role.name,
         "schoolId"  = school_id,
         "updatedBy" = 'sql-apply:promote-school-admin-fedetafur',
         "updatedAt" = now()
   WHERE id = u.id;
  GET DIAGNOSTICS n_updated = ROW_COUNT;
  IF n_updated <> 1 THEN
    RAISE EXCEPTION 'updated % rows, expected 1 — rolling back', n_updated;
  END IF;

  INSERT INTO audit_logs (id, "actorId", "actorEmail", action, "resourceType", "resourceId", details, "updatedAt")
  VALUES (
    gen_random_uuid()::text,
    'sql-apply',
    'sql-apply:promote-school-admin-fedetafur.sql',
    'USER_ROLE_CHANGE',
    'User',
    u.id,
    jsonb_build_object('from', u."roleName", 'to', admin_role.name,
                       'fromSchoolId', u."schoolId", 'toSchoolId', school_id,
                       'via', 'formmaps-sql-apply workflow'),
    now()
  );

  RAISE NOTICE 'made % (%) school_admin of "%" (%), was % in %', u.email, u.id, school_name, school_id, u."roleName", coalesce(u."schoolId", 'no school');
END
$$;

SELECT u.id, u.email, u."roleName", s.name AS school, s."adminEmail" AS school_contact_email
  FROM users u LEFT JOIN schools s ON s.id = u."schoolId"
 WHERE lower(u.email) = 'fedetafur@vt.edu';
