-- Schema-only harness DDL for the assembleCompleteProfile read slice (FM-DOTNET-035).
-- Hand-authored from prisma/schema.prisma (these cross-domain source tables have no single prod
-- migration): the exact @@map names + camelCase/snake_case quoted columns + native enums the assembler
-- reads. Only the columns assembleCompleteProfile touches are modelled (a faithful subset — the prod
-- tables have many more columns). NO foreign keys (schema-only; keeps seeding order-free + TRUNCATE
-- simple) and NO RLS policies (RLS-e2e deferred — policy DDL is not in the repo). The fixture pins the
-- server to a NON-UTC timezone so any tz-dependent ordering (testDate / endTime / completed_at) is caught.

CREATE TYPE "ExamType" AS ENUM ('PatternRecognition', 'VerbalReasoning', 'WorkingMemory', 'NumericVelocity', 'VisualRotation');
CREATE TYPE "LiaSessionStatus" AS ENUM ('not_started', 'practice', 'in_progress', 'completed', 'abandoned');
CREATE TYPE "StudentActivityCategory" AS ENUM ('academic', 'athletic', 'arts', 'community_service', 'work', 'leadership', 'other');

-- Legacy per-exam LIA history (superseded by lia_assessment_sessions when a parity run is completed).
CREATE TABLE "pca_exam_sessions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "endTime" TIMESTAMP(3),
    "totalTimeSpent" INTEGER,
    "scorePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "pca_exam_sessions_pkey" PRIMARY KEY ("id")
);

-- tims-parity LIA engine: a completed session's percentiles supersede the per-exam rows.
CREATE TABLE "lia_assessment_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "LiaSessionStatus" NOT NULL DEFAULT 'not_started',
    "completed_at" TIMESTAMP(3),
    "subtest_times" JSONB,
    "percentiles" JSONB,
    "response_counts" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "lia_assessment_sessions_pkey" PRIMARY KEY ("id")
);

-- TIMS PCA result blob (DISC across 3 graphs + competences). Read by userId (no isActive filter).
CREATE TABLE "pca_results" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discResult" JSONB,
    "competences" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "pca_results_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pca_results_userId_key" UNIQUE ("userId")
);

CREATE TABLE "evaluation_groups" (
    "id" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    CONSTRAINT "evaluation_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_feedbacks" (
    "id" TEXT NOT NULL,
    "evaluationGroupId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "feedbackItems" JSONB NOT NULL DEFAULT '[]',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "evaluation_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions_360" (
    "id" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "questions_360_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_grades" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "grade" TEXT,
    "courseLevel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_test_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "testDate" TIMESTAMP(3),
    "satTotal" INTEGER,
    "actComposite" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_test_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_portfolio_items" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT,
    "activityCategory" "StudentActivityCategory" NOT NULL DEFAULT 'other',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_portfolio_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredFields" TEXT[] NOT NULL DEFAULT '{}',
    "targetCareers" TEXT[] NOT NULL DEFAULT '{}',
    "preferredCountries" TEXT[] NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_preferences_userId_key" UNIQUE ("userId")
);

CREATE INDEX "pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "lia_assessment_sessions_user_id_status_idx" ON "lia_assessment_sessions"("user_id", "status");
CREATE INDEX "evaluation_feedbacks_evaluationGroupId_idx" ON "evaluation_feedbacks"("evaluationGroupId");
CREATE INDEX "evaluation_groups_evaluatedUserId_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "student_grades_studentId_idx" ON "student_grades"("studentId");
CREATE INDEX "student_test_scores_userId_idx" ON "student_test_scores"("userId");
CREATE INDEX "student_portfolio_items_studentId_idx" ON "student_portfolio_items"("studentId");
