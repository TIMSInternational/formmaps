-- Schema-only harness for the school-analytics reads (FM-DOTNET-049). Hand-authored from prisma/schema.prisma
-- with only the columns the three reads touch: users (roster/scope + createdDate for enrollments), student_grades
-- (GPA + grades-metric), pca_evaluations (distinct-user completion), pca_exam_sessions (completion_rate metric),
-- evaluation_groups (completion_rate metric), counselor_student_assignments (coverage). NO foreign keys / RLS
-- policies (schema-only). The fixture pins a NON-UTC server timezone so the UTC date-bucketing is caught if it
-- ever depended on the container's local tz.

CREATE TABLE "users" (
    "id"          text PRIMARY KEY,
    "name"        text NOT NULL,
    "email"       text NOT NULL,
    "roleName"    text NOT NULL,
    "schoolId"    text,
    "gradeLevel"  integer,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "student_grades" (
    "id"          text PRIMARY KEY,
    "schoolId"    text NOT NULL,
    "studentId"   text NOT NULL,
    "grade"       text,
    "status"      text NOT NULL DEFAULT 'completed',
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "pca_evaluations" (
    "id"     text PRIMARY KEY,
    "userId" text NOT NULL
);

CREATE TABLE "pca_exam_sessions" (
    "id"          text PRIMARY KEY,
    "userId"      text NOT NULL,
    "isCompleted" boolean NOT NULL DEFAULT false,
    "startTime"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "evaluation_groups" (
    "id"                      text PRIMARY KEY,
    "evaluatedUserId"         text NOT NULL,
    "isEvaluationCompleted"   boolean NOT NULL DEFAULT false,
    "evaluationCompletedDate" timestamp
);

CREATE TABLE "counselor_student_assignments" (
    "id"         text PRIMARY KEY,
    "studentId"  text NOT NULL,
    "counselorId" text NOT NULL,
    "isActive"   boolean NOT NULL DEFAULT true
);

CREATE INDEX "analytics_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "analytics_student_grades_schoolId_idx" ON "student_grades"("schoolId");
CREATE INDEX "analytics_pca_evaluations_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "analytics_pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "analytics_evaluation_groups_evaluatedUserId_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "analytics_counselor_assignments_studentId_idx" ON "counselor_student_assignments"("studentId");

-- Audit D2: the overview's completion rate comes from the shared school assessment tally
-- (SchoolAssessmentTally). Same column names/types as production.
ALTER TABLE "users" ADD COLUMN "password" TEXT;
ALTER TABLE "users" ADD COLUMN "legacyUnlockGrandfathered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pca_exam_sessions" ADD COLUMN "examType" TEXT NOT NULL DEFAULT 'PatternRecognition';
ALTER TABLE "pca_exam_sessions" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pca_evaluations" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "evaluation_groups" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "lia_assessment_sessions" (
    "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "status" TEXT NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "lia_assessment_sessions_pkey" PRIMARY KEY ("id"));
CREATE TABLE "personality_assessment_sessions" (
    "id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'in_progress', "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "personality_assessment_sessions_pkey" PRIMARY KEY ("id"));

-- Audit D9: GPA goes through the configured GPA engine (credits, course level, per-school scale).
ALTER TABLE "student_grades" ADD COLUMN "credits" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "student_grades" ADD COLUMN "courseLevel" TEXT;
CREATE TABLE "gpa_configurations" (
    "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "unweightedMap" JSONB, "weightBonuses" JSONB,
    CONSTRAINT "gpa_configurations_pkey" PRIMARY KEY ("id"));
