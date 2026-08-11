-- RLS Phase A: direct schoolId tenant tables (non-null schoolId, no pre-auth read path).
-- Same pattern as pilot.sql. Idempotent. schoolId stored as TEXT -> no ::uuid cast.
-- Deferred to later phases: users, counselor_invites, student_alerts (nullable/pre-auth),
-- framework_courses, admission_models, admission_outcomes (global-or-override).

ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_years" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "academic_years";
CREATE POLICY tenant_isolation ON "academic_years"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "assessment_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_periods" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assessment_periods";
CREATE POLICY tenant_isolation ON "assessment_periods"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "assessment_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "assessment_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "assessment_schedules";
CREATE POLICY tenant_isolation ON "assessment_schedules"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "community_service_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "community_service_entries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "community_service_entries";
CREATE POLICY tenant_isolation ON "community_service_entries"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "course_change_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_change_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_change_requests";
CREATE POLICY tenant_isolation ON "course_change_requests"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "course_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_sequences" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_sequences";
CREATE POLICY tenant_isolation ON "course_sequences"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "curriculum_frameworks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_frameworks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "curriculum_frameworks";
CREATE POLICY tenant_isolation ON "curriculum_frameworks"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "data_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_mappings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "data_mappings";
CREATE POLICY tenant_isolation ON "data_mappings"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "document_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "document_requests";
CREATE POLICY tenant_isolation ON "document_requests"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "gpa_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gpa_configurations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "gpa_configurations";
CREATE POLICY tenant_isolation ON "gpa_configurations"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "grade_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_import_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "grade_import_jobs";
CREATE POLICY tenant_isolation ON "grade_import_jobs"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "graduation_rule_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graduation_rule_sets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "graduation_rule_sets";
CREATE POLICY tenant_isolation ON "graduation_rule_sets"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "holidays" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "holidays";
CREATE POLICY tenant_isolation ON "holidays"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "isams_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "isams_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "isams_configs";
CREATE POLICY tenant_isolation ON "isams_configs"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "isams_sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "isams_sync_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "isams_sync_jobs";
CREATE POLICY tenant_isolation ON "isams_sync_jobs"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "school_assessment_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_assessment_configs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_assessment_configs";
CREATE POLICY tenant_isolation ON "school_assessment_configs"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "school_assessment_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_assessment_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_assessment_settings";
CREATE POLICY tenant_isolation ON "school_assessment_settings"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "school_course_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_course_import_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_course_import_jobs";
CREATE POLICY tenant_isolation ON "school_course_import_jobs"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "school_framework_course_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_framework_course_overrides" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_framework_course_overrides";
CREATE POLICY tenant_isolation ON "school_framework_course_overrides"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "school_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_users";
CREATE POLICY tenant_isolation ON "school_users"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "student_grades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_grades" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_grades";
CREATE POLICY tenant_isolation ON "student_grades"
  USING (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    "schoolId" = current_setting('app.current_school_id', true)
    OR current_setting('app.bypass_rls', true) = 'on'
  );

