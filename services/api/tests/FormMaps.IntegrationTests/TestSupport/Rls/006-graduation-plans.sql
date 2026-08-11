-- RLS Phase F: graduation planning tables. Idempotent.
-- graduation_plans / graduation_plan_items: non-null schoolId -> direct pattern (002).
-- student_graduation_targets: nullable schoolId (individual students may set
-- targets) -> dual-key own-row OR owner-school pattern (003).

ALTER TABLE "graduation_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graduation_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "graduation_plans";
CREATE POLICY tenant_isolation ON "graduation_plans"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "graduation_plan_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graduation_plan_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "graduation_plan_items";
CREATE POLICY tenant_isolation ON "graduation_plan_items"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "student_graduation_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_graduation_targets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_graduation_targets";
CREATE POLICY tenant_isolation ON "student_graduation_targets"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_graduation_targets"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_graduation_targets"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );
