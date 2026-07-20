-- Schema-only harness DDL for the school-admin READS slice (FM-DOTNET, sub-slice 1). Hand-authored from
-- prisma/schema.prisma with only the columns these six reads touch: users (scoping + student roster),
-- evaluation_groups (overview), pca_evaluations (existence gates), pca_exam_sessions (Float scorePercentage),
-- school_assessment_settings (config), assessment_schedules (full-row list). NO foreign keys / RLS policies
-- (schema-only). The fixture pins a NON-UTC server timezone so ISO-Z timestamp emission is caught.

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "schoolId" TEXT,
    "gradeLevel" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_groups" (
    "id" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    "groupType" TEXT,
    "evaluatorName" TEXT,
    "evaluatorEmail" TEXT,
    "relation" TEXT,
    "invitationToken" TEXT,
    "tokenExpiryDate" TIMESTAMP(3),
    "isTokenUsed" BOOLEAN NOT NULL DEFAULT false,
    "isEvaluationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "evaluationCompletedDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NO db default (matches prod: Prisma @updatedAt is app-managed, NOT NULL, no default). A default here would
    -- mask a writer that forgets to set updatedAt (it did — see SchoolAdminEmailWriter setup-360 INSERT).
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "evaluation_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_parent_links" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "parentName" TEXT,
    "relation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_parent_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "counselor_student_assignments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "counselor_student_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_evaluations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pca_evaluations_pkey" PRIMARY KEY ("id")
);

-- pca_exam_sessions uses camelCase columns (matches Prisma @@map default here). Sub-slice 2 adds the
-- per-session detail columns the rich report + pipeline read (examType/status are native enums in prod;
-- TEXT here is faithful for the read comparisons). endTime is nullable; isActive gates the pipeline read.
CREATE TABLE "pca_exam_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT,
    "examName" TEXT NOT NULL DEFAULT '',
    "examType" TEXT NOT NULL DEFAULT 'PatternRecognition',
    "status" TEXT NOT NULL DEFAULT 'InProgress',
    "scorePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    CONSTRAINT "pca_exam_sessions_pkey" PRIMARY KEY ("id")
);

-- lia_assessment_sessions uses snake_case column maps (user_id / is_active); status is the LiaSessionStatus
-- enum in prod (TEXT here — the reads compare to string literals). The rich report + pipeline read it.
CREATE TABLE "lia_assessment_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "lia_assessment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "school_assessment_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assessmentWindowStart" TEXT,
    "assessmentWindowEnd" TEXT,
    "retakePolicy" TEXT NOT NULL DEFAULT 'none',
    "allowSelfSchedule" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "courseRequestDeadline" TIMESTAMP(3),
    "aiWeightsJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_assessment_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "school_assessment_settings_schoolId_key" UNIQUE ("schoolId")
);

CREATE TABLE "assessment_schedules" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "assessmentType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assessment_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_schedules_schoolId_gradeLevel_assessmentType_key" UNIQUE ("schoolId", "gradeLevel", "assessmentType")
);

CREATE INDEX "users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "evaluation_groups_evaluatedUserId_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "pca_evaluations_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "lia_assessment_sessions_user_id_idx" ON "lia_assessment_sessions"("user_id");
CREATE INDEX "assessment_schedules_schoolId_idx" ON "assessment_schedules"("schoolId");
