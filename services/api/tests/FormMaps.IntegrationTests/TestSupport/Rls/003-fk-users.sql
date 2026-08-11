-- RLS Phase B (1/2): FK-to-user tables. Dual-key isolation:
-- bypass OR row.<fk> = app.current_user_id (own data, covers no-school users:
-- individual students, coaches, parents) OR owner.schoolId = app.current_school_id
-- (school tenant; per-user authz stays in app code). Idempotent. schoolId is TEXT.
-- NOTE: users table is NOT policied until Phase C, so the school match is explicit
-- here (not nested-RLS). The '' guards stop no-school users matching empty schoolId.

ALTER TABLE "student_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_applications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_applications";
CREATE POLICY tenant_isolation ON "student_applications"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_applications"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_applications"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "student_test_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_test_scores" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_test_scores";
CREATE POLICY tenant_isolation ON "student_test_scores"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_test_scores"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_test_scores"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "student_gpas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_gpas" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_gpas";
CREATE POLICY tenant_isolation ON "student_gpas"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_gpas"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_gpas"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "student_portfolio_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_portfolio_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_portfolio_items";
CREATE POLICY tenant_isolation ON "student_portfolio_items"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_portfolio_items"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_portfolio_items"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "scholarships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "scholarships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "scholarships";
CREATE POLICY tenant_isolation ON "scholarships"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "scholarships"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "scholarships"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "college_essays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "college_essays" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "college_essays";
CREATE POLICY tenant_isolation ON "college_essays"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "college_essays"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "college_essays"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "recommendation_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendation_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "recommendation_requests";
CREATE POLICY tenant_isolation ON "recommendation_requests"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "recommendation_requests"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "recommendation_requests"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "course_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_enrollments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_enrollments";
CREATE POLICY tenant_isolation ON "course_enrollments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "course_enrollments"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "course_enrollments"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_profiles";
CREATE POLICY tenant_isolation ON "user_profiles"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_profiles"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_profiles"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_settings";
CREATE POLICY tenant_isolation ON "user_settings"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_settings"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_settings"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_preferences" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_preferences";
CREATE POLICY tenant_isolation ON "user_preferences"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_preferences"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_preferences"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_career_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_career_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_career_profiles";
CREATE POLICY tenant_isolation ON "user_career_profiles"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_career_profiles"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_career_profiles"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_activities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_activities";
CREATE POLICY tenant_isolation ON "user_activities"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_activities"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_activities"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "notifications";
CREATE POLICY tenant_isolation ON "notifications"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "notifications"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "notifications"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "user_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_subscriptions";
CREATE POLICY tenant_isolation ON "user_subscriptions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_subscriptions"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "user_subscriptions"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "coursera_click_throughs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coursera_click_throughs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "coursera_click_throughs";
CREATE POLICY tenant_isolation ON "coursera_click_throughs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "coursera_click_throughs"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "coursera_click_throughs"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "telemetry_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telemetry_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "telemetry_events";
CREATE POLICY tenant_isolation ON "telemetry_events"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "telemetry_events"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "telemetry_events"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "pca_exam_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pca_exam_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pca_exam_sessions";
CREATE POLICY tenant_isolation ON "pca_exam_sessions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_exam_sessions"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "pca_exam_sessions"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "counselor_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselor_notes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselor_notes";
CREATE POLICY tenant_isolation ON "counselor_notes"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_notes"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_notes"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "counselor_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselor_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselor_sessions";
CREATE POLICY tenant_isolation ON "counselor_sessions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_sessions"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_sessions"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "counselor_student_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselor_student_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselor_student_assignments";
CREATE POLICY tenant_isolation ON "counselor_student_assignments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_student_assignments"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_student_assignments"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "counselor_availabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "counselor_availabilities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "counselor_availabilities";
CREATE POLICY tenant_isolation ON "counselor_availabilities"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_availabilities"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "counselor_availabilities"."userId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "evaluation_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evaluation_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evaluation_groups";
CREATE POLICY tenant_isolation ON "evaluation_groups"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("evaluatedUserId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "evaluation_groups"."evaluatedUserId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("evaluatedUserId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "evaluation_groups"."evaluatedUserId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

ALTER TABLE "student_parent_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_parent_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "student_parent_links";
CREATE POLICY tenant_isolation ON "student_parent_links"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_parent_links"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("studentId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = "student_parent_links"."studentId"
        AND u."schoolId" = current_setting('app.current_school_id', true)
        AND current_setting('app.current_school_id', true) <> ''
    )
  );

