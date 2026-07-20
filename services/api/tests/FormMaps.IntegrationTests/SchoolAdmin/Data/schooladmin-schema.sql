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
    "isEvaluationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "evaluation_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_evaluations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pca_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_exam_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT,
    "scorePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pca_exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "school_assessment_settings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "assessmentWindowStart" TEXT,
    "assessmentWindowEnd" TEXT,
    "retakePolicy" TEXT NOT NULL DEFAULT 'none',
    "allowSelfSchedule" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 7,
    "aiWeightsJson" TEXT,
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
    CONSTRAINT "assessment_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "evaluation_groups_evaluatedUserId_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "pca_evaluations_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "assessment_schedules_schoolId_idx" ON "assessment_schedules"("schoolId");
