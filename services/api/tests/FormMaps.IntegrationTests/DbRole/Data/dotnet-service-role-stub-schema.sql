-- Minimal stub schema for verifying infra/aws/sql/dotnet-service-role.sql's GRANTs. This is
-- privilege-boundary testing, not data-shape testing, so every table is just "id text primary
-- key" -- what matters is that the table names here are exactly the table names the role script
-- grants against.
--
-- No exact count is quoted here on purpose: this header carried one for a long time and it was
-- wrong (it said 86 against an actual 87), as did the two other places in this harness that
-- quoted one. A hand-maintained number in prose cannot be kept honest, and it is not the
-- invariant anyway -- set equality between the two lists is, and that is enforced in BOTH
-- directions by machine:
--   * granted-but-not-stubbed  -> the GRANT raises 42P01 during DbRoleDatabaseFixture.InitializeAsync,
--                                 taking the whole class down (verified, not assumed).
--   * stubbed-but-not-granted  -> DbRoleGrantsTests.Every_table_in_the_schema_is_granted_at_least_select.
CREATE TABLE "academic_terms" (id text PRIMARY KEY);
CREATE TABLE "academic_years" (id text PRIMARY KEY);
CREATE TABLE "application_checklists" (id text PRIMARY KEY);
CREATE TABLE "application_essays" (id text PRIMARY KEY);
CREATE TABLE "assessment_periods" (id text PRIMARY KEY);
CREATE TABLE "assessment_schedules" (id text PRIMARY KEY);
-- formmaps#52: the audit trail. Stubbed BARE like every other table here -- no RLS policy and no
-- immutability trigger, unlike the real infra/aws/sql/audit-events-schema.sql. This keeps a
-- rejected UPDATE/DELETE in DbRoleGrantsTests attributable to the GRANT and to nothing else.
--
-- Note what this bareness does NOT do: it is not what stops an over-broad grant from hiding behind
-- the trigger. Measured -- with the real ENABLE ALWAYS trigger added here AND the grant widened to
-- UPDATE/DELETE, the behavioural test still failed. The trigger raises P0001 while a missing
-- privilege raises 42501, and that test asserts the SqlState rather than merely that something
-- threw. The SqlState assertion is the load-bearing part; do not relax it to Assert.ThrowsAsync.
CREATE TABLE "audit_events" (id text PRIMARY KEY);
CREATE TABLE "bookings" (id text PRIMARY KEY);
CREATE TABLE "category_requirements" (id text PRIMARY KEY);
CREATE TABLE "coaches" (id text PRIMARY KEY);
CREATE TABLE "college_essays" (id text PRIMARY KEY);
CREATE TABLE "community_service_entries" (id text PRIMARY KEY);
CREATE TABLE "conversations" (id text PRIMARY KEY);
CREATE TABLE "counselor_availabilities" (id text PRIMARY KEY);
CREATE TABLE "counselor_notes" (id text PRIMARY KEY);
CREATE TABLE "counselor_sessions" (id text PRIMARY KEY);
CREATE TABLE "counselor_student_assignments" (id text PRIMARY KEY);
CREATE TABLE "course_change_requests" (id text PRIMARY KEY);
CREATE TABLE "course_enrollments" (id text PRIMARY KEY);
CREATE TABLE "courses" (id text PRIMARY KEY);
CREATE TABLE "curriculum_frameworks" (id text PRIMARY KEY);
CREATE TABLE "data_mappings" (id text PRIMARY KEY);
CREATE TABLE "essay_comments" (id text PRIMARY KEY);
CREATE TABLE "evaluation_feedbacks" (id text PRIMARY KEY);
CREATE TABLE "evaluation_groups" (id text PRIMARY KEY);
CREATE TABLE "framework_courses" (id text PRIMARY KEY);
CREATE TABLE "gpa_configurations" (id text PRIMARY KEY);
CREATE TABLE "graduation_plan_items" (id text PRIMARY KEY);
CREATE TABLE "graduation_plans" (id text PRIMARY KEY);
CREATE TABLE "graduation_rule_sets" (id text PRIMARY KEY);
CREATE TABLE "holidays" (id text PRIMARY KEY);
CREATE TABLE "isams_configs" (id text PRIMARY KEY);
CREATE TABLE "isams_sync_jobs" (id text PRIMARY KEY);
CREATE TABLE "lia_assessment_sessions" (id text PRIMARY KEY);
CREATE TABLE "lia_questions" (id text PRIMARY KEY);
CREATE TABLE "lia_responses" (id text PRIMARY KEY);
CREATE TABLE "login_attempts" (id text PRIMARY KEY);
CREATE TABLE "messages" (id text PRIMARY KEY);
CREATE TABLE "notification_outbox" (id text PRIMARY KEY);
CREATE TABLE "notifications" (id text PRIMARY KEY);
CREATE TABLE "password_reset_tokens" (id text PRIMARY KEY);
CREATE TABLE "pca_evaluations" (id text PRIMARY KEY);
CREATE TABLE "pca_exam_answers" (id text PRIMARY KEY);
CREATE TABLE "pca_exam_sessions" (id text PRIMARY KEY);
CREATE TABLE "pca_exams" (id text PRIMARY KEY);
CREATE TABLE "pca_questions" (id text PRIMARY KEY);
CREATE TABLE "pca_results" (id text PRIMARY KEY);
CREATE TABLE "personality_assessment_sessions" (id text PRIMARY KEY);
CREATE TABLE "personality_responses" (id text PRIMARY KEY);
CREATE TABLE "questions_360" (id text PRIMARY KEY);
CREATE TABLE "refresh_tokens" (id text PRIMARY KEY);
CREATE TABLE "reports" (id text PRIMARY KEY);
CREATE TABLE "resumes" (id text PRIMARY KEY);
CREATE TABLE "reviews" (id text PRIMARY KEY);
CREATE TABLE "roles" (id text PRIMARY KEY);
CREATE TABLE "school_assessment_settings" (id text PRIMARY KEY);
CREATE TABLE "school_course_import_errors" (id text PRIMARY KEY);
CREATE TABLE "school_course_import_jobs" (id text PRIMARY KEY);
CREATE TABLE "school_courses" (id text PRIMARY KEY);
CREATE TABLE "school_framework_course_overrides" (id text PRIMARY KEY);
CREATE TABLE "schools" (id text PRIMARY KEY);
-- Domain 9a shadow-mode billing tables (infra/aws/sql/billing-shadow-tables.sql).
CREATE TABLE "shadow_payments" (id text PRIMARY KEY);
CREATE TABLE "shadow_stripe_events" (id text PRIMARY KEY);
CREATE TABLE "shadow_user_subscriptions" (id text PRIMARY KEY);
CREATE TABLE "student_alerts" (id text PRIMARY KEY);
CREATE TABLE "student_applications" (id text PRIMARY KEY);
CREATE TABLE "student_course_plans" (id text PRIMARY KEY);
CREATE TABLE "student_grades" (id text PRIMARY KEY);
CREATE TABLE "student_graduation_targets" (id text PRIMARY KEY);
CREATE TABLE "student_parent_links" (id text PRIMARY KEY);
CREATE TABLE "student_portfolio_items" (id text PRIMARY KEY);
CREATE TABLE "student_test_scores" (id text PRIMARY KEY);
-- Domain 9a: read-only plan catalog (PlanReader).
CREATE TABLE "subscription_plans" (id text PRIMARY KEY);
CREATE TABLE "universities" (id text PRIMARY KEY);
CREATE TABLE "university_favorites" (id text PRIMARY KEY);
CREATE TABLE "user_blocks" (id text PRIMARY KEY);
CREATE TABLE "user_career_profiles" (id text PRIMARY KEY);
CREATE TABLE "user_preferences" (id text PRIMARY KEY);
CREATE TABLE "user_settings" (id text PRIMARY KEY);
CREATE TABLE "user_subscriptions" (id text PRIMARY KEY);
CREATE TABLE "users" (id text PRIMARY KEY);
CREATE TABLE "vocational_dimensions" (id text PRIMARY KEY);
CREATE TABLE "vocational_instruments" (id text PRIMARY KEY);
CREATE TABLE "vocational_integrated_results" (id text PRIMARY KEY);
CREATE TABLE "vocational_question_variants" (id text PRIMARY KEY);
CREATE TABLE "vocational_questions" (id text PRIMARY KEY);
CREATE TABLE "vocational_responses" (id text PRIMARY KEY);
CREATE TABLE "vocational_results" (id text PRIMARY KEY);
