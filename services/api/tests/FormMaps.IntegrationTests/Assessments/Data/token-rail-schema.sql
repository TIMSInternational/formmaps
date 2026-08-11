-- Schema-only harness DDL for the FM-DOTNET token-gated external write rail (capstone). Hand-authored from
-- prisma/schema.prisma (no committed migration for these tables — dev materialized them via `prisma db push`).
-- No enums; Decimal -> numeric; Json -> jsonb; String[] -> text[]. NO RLS policies (schema-only; the rail runs
-- under GUC bypass anyway). The fixture pins a NON-UTC server timezone so a mishandled tz on the expiry
-- comparison / ISO-Z emission is caught. The two UNIQUE indexes back the vocational upsert + the 23505→409.

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_groups" (
    "id" TEXT NOT NULL,
    "evaluatorName" TEXT NOT NULL DEFAULT '',
    "evaluatorEmail" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT '',
    "groupType" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    "invitationToken" TEXT NOT NULL,
    "tokenExpiryDate" TIMESTAMP(3) NOT NULL,
    "isTokenUsed" BOOLEAN NOT NULL DEFAULT false,
    "tokenUsedDate" TIMESTAMP(3),
    "isEvaluationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "evaluationCompletedDate" TIMESTAMP(3),
    "isEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instrument" TEXT,
    "instrumentVersion" TEXT,
    "violations" JSONB,
    "violation_count" INTEGER NOT NULL DEFAULT 0,
    "flag_for_review" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "evaluation_groups_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "evaluation_groups_invitationToken_idx" ON "evaluation_groups"("invitationToken");

CREATE TABLE "evaluation_feedbacks" (
    "id" TEXT NOT NULL,
    "evaluationGroupId" TEXT NOT NULL,
    "evaluatorEmail" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "feedbackItems" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "answeredQuestions" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_feedbacks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "evaluation_feedbacks_evaluationGroupId_evaluatorEmail_key" ON "evaluation_feedbacks"("evaluationGroupId", "evaluatorEmail");

CREATE TABLE "vocational_responses" (
    "id" TEXT NOT NULL,
    "evaluationGroupId" TEXT NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "dimensionKey" TEXT,
    "type" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "rankingOrder" JSONB,
    "selectedValues" JSONB,
    "textValue" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_responses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_responses_evaluationGroupId_questionNumber_key" ON "vocational_responses"("evaluationGroupId", "questionNumber");

CREATE TABLE "questions_360" (
    "id" TEXT NOT NULL,
    "questionEnglishText" TEXT NOT NULL,
    "questionSpanishText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "isSubQuestion" BOOLEAN NOT NULL DEFAULT false,
    "parentQuestionId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "questions_360_pkey" PRIMARY KEY ("id")
);

-- Vocational instrument/questionnaire tables (getQuestionnaire + the best-effort recompute reuse them).
CREATE TABLE "vocational_instruments" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "groupWeights" JSONB NOT NULL DEFAULT '{}',
    "integrationWeights" JSONB NOT NULL DEFAULT '{}',
    "interpretationBands" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_instruments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_instruments_version_key" ON "vocational_instruments"("version");

CREATE TABLE "vocational_dimensions" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEs" TEXT NOT NULL,
    "nameEn" TEXT,
    "weight" DECIMAL NOT NULL DEFAULT 0,
    "scaleAnchors" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_dimensions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_dimensions_instrumentId_key_key" ON "vocational_dimensions"("instrumentId", "key");

CREATE TABLE "vocational_questions" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "dimensionId" TEXT,
    "block" TEXT NOT NULL DEFAULT '',
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "area" TEXT,
    "scaleAnchors" JSONB,
    "options" JSONB,
    "scoringRule" JSONB,
    "group" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vocational_question_variants" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "textEs" TEXT NOT NULL,
    "textEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_question_variants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_question_variants_questionId_group_key" ON "vocational_question_variants"("questionId", "group");

CREATE TABLE "vocational_results" (
    "id" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "composite" DECIMAL NOT NULL,
    "band" TEXT NOT NULL,
    "respondentCount" INTEGER NOT NULL,
    "groupsIncluded" TEXT[] NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "rankings" JSONB NOT NULL,
    "weightsApplied" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_results_evaluatedUserId_instrumentVersion_key" ON "vocational_results"("evaluatedUserId", "instrumentVersion");

ALTER TABLE "vocational_responses" ADD CONSTRAINT "vocational_responses_evaluationGroupId_fkey"
    FOREIGN KEY ("evaluationGroupId") REFERENCES "evaluation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_feedbacks" ADD CONSTRAINT "evaluation_feedbacks_evaluationGroupId_fkey"
    FOREIGN KEY ("evaluationGroupId") REFERENCES "evaluation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 12 of formmaps#52). Same SIMPLIFIED shape as the other retrofit
-- fixtures (no RLS policy, no immutability trigger -- proven once in FormMaps.IntegrationTests/Audit).
-- This rail does not write audit_events itself; it is here because a rater's submission triggers
-- VocationalWriter.RecomputeScoreAsync, which now does. Without the table that write would take
-- AuditEventWriter's fail-soft branch on every submit test -- green, but proving nothing, and hiding
-- the one path where the recompute has NO human actor (the rail runs under RequestContext.System()).
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "schoolId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB
);
