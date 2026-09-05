-- RLS pilot: school_courses + student_course_plans (direct schoolId column).
-- GUCs: app.current_school_id (uuid as text), app.bypass_rls ('on' bypasses).
-- Idempotent: safe to re-run (drops policy before recreating).
-- Note: Prisma stores UUID PKs/FKs as TEXT in Postgres; no ::uuid cast needed.

ALTER TABLE "school_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_courses" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_courses";
CREATE POLICY tenant_isolation ON "school_courses"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "student_course_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_course_plans" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_course_plans";
CREATE POLICY tenant_isolation ON "student_course_plans"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );
