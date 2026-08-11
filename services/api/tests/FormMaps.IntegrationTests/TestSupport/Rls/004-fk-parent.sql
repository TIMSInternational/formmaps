-- RLS Phase B (2/2): FK-to-parent tables (parent already FORCE-RLS policied).
-- Nested RLS: EXISTS(SELECT 1 FROM parent WHERE id = child.<fk>) — the parent's
-- own policy filters the subquery to the current tenant, so the child inherits
-- isolation. bypass handled explicitly. Idempotent.

ALTER TABLE "academic_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_terms" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "academic_terms";
CREATE POLICY tenant_isolation ON "academic_terms"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "academic_years" p WHERE p.id = "academic_terms"."academicYearId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "academic_years" p WHERE p.id = "academic_terms"."academicYearId")
  );

ALTER TABLE "category_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_requirements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "category_requirements";
CREATE POLICY tenant_isolation ON "category_requirements"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "graduation_rule_sets" p WHERE p.id = "category_requirements"."ruleSetId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "graduation_rule_sets" p WHERE p.id = "category_requirements"."ruleSetId")
  );

ALTER TABLE "special_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "special_requirements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "special_requirements";
CREATE POLICY tenant_isolation ON "special_requirements"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "graduation_rule_sets" p WHERE p.id = "special_requirements"."ruleSetId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "graduation_rule_sets" p WHERE p.id = "special_requirements"."ruleSetId")
  );

ALTER TABLE "grade_import_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_import_errors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "grade_import_errors";
CREATE POLICY tenant_isolation ON "grade_import_errors"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "grade_import_jobs" p WHERE p.id = "grade_import_errors"."jobId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "grade_import_jobs" p WHERE p.id = "grade_import_errors"."jobId")
  );

ALTER TABLE "school_course_import_errors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_course_import_errors" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "school_course_import_errors";
CREATE POLICY tenant_isolation ON "school_course_import_errors"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "school_course_import_jobs" p WHERE p.id = "school_course_import_errors"."jobId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "school_course_import_jobs" p WHERE p.id = "school_course_import_errors"."jobId")
  );

ALTER TABLE "course_sequence_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_sequence_nodes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_sequence_nodes";
CREATE POLICY tenant_isolation ON "course_sequence_nodes"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_sequences" p WHERE p.id = "course_sequence_nodes"."sequenceId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_sequences" p WHERE p.id = "course_sequence_nodes"."sequenceId")
  );

ALTER TABLE "course_sequence_edges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_sequence_edges" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_sequence_edges";
CREATE POLICY tenant_isolation ON "course_sequence_edges"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_sequences" p WHERE p.id = "course_sequence_edges"."sequenceId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_sequences" p WHERE p.id = "course_sequence_edges"."sequenceId")
  );

ALTER TABLE "pca_exam_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pca_exam_answers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "pca_exam_answers";
CREATE POLICY tenant_isolation ON "pca_exam_answers"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "pca_exam_sessions" p WHERE p.id = "pca_exam_answers"."sessionId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "pca_exam_sessions" p WHERE p.id = "pca_exam_answers"."sessionId")
  );

ALTER TABLE "evaluation_feedbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evaluation_feedbacks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "evaluation_feedbacks";
CREATE POLICY tenant_isolation ON "evaluation_feedbacks"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "evaluation_groups" p WHERE p.id = "evaluation_feedbacks"."evaluationGroupId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "evaluation_groups" p WHERE p.id = "evaluation_feedbacks"."evaluationGroupId")
  );

ALTER TABLE "application_essays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_essays" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "application_essays";
CREATE POLICY tenant_isolation ON "application_essays"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "student_applications" p WHERE p.id = "application_essays"."studentApplicationId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "student_applications" p WHERE p.id = "application_essays"."studentApplicationId")
  );

ALTER TABLE "application_checklists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "application_checklists" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "application_checklists";
CREATE POLICY tenant_isolation ON "application_checklists"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "student_applications" p WHERE p.id = "application_checklists"."studentApplicationId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "student_applications" p WHERE p.id = "application_checklists"."studentApplicationId")
  );

ALTER TABLE "recommendation_application_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recommendation_application_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "recommendation_application_links";
CREATE POLICY tenant_isolation ON "recommendation_application_links"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "recommendation_requests" p WHERE p.id = "recommendation_application_links"."recommendationRequestId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "recommendation_requests" p WHERE p.id = "recommendation_application_links"."recommendationRequestId")
  );

ALTER TABLE "essay_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "essay_comments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "essay_comments";
CREATE POLICY tenant_isolation ON "essay_comments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "college_essays" p WHERE p.id = "essay_comments"."essayId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "college_essays" p WHERE p.id = "essay_comments"."essayId")
  );

ALTER TABLE "course_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "course_progress";
CREATE POLICY tenant_isolation ON "course_progress"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_enrollments" p WHERE p.id = "course_progress"."enrollmentId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "course_enrollments" p WHERE p.id = "course_progress"."enrollmentId")
  );

