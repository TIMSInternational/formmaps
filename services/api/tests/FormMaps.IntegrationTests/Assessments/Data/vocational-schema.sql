-- Schema-only harness DDL for the vocational score recompute write slice (FM-DOTNET-032).
-- Hand-written from prisma/schema.prisma (there is NO committed migration for the vocational tables —
-- dev materialized them via `prisma db push`). No enums (band/type/group/status are plain text); Decimal
-- -> numeric; Json -> jsonb; String[] -> text[]. evaluation_groups is a MINIMAL stub (only the columns the
-- recompute query reads). NO RLS policies (schema-only). The fixture pins a non-UTC server timezone.

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

-- Minimal stub: only the columns the recompute query joins/filters on.
CREATE TABLE "evaluation_groups" (
    "id" TEXT NOT NULL,
    "groupType" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    "instrument" TEXT,
    "isEvaluationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluation_groups_pkey" PRIMARY KEY ("id")
);

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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vocational_responses_evaluationGroupId_idx" ON "vocational_responses"("evaluationGroupId");

-- Write target.
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

CREATE TABLE "vocational_integrated_results" (
    "id" TEXT NOT NULL,
    "evaluatedUserId" TEXT NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "integratedComposite" DECIMAL NOT NULL,
    "band" TEXT NOT NULL,
    "threeSixtyScore" DECIMAL NOT NULL,
    "pcaScore" DECIMAL NOT NULL,
    "milScore" DECIMAL NOT NULL,
    "weightsApplied" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vocational_integrated_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vocational_integrated_results_evaluatedUserId_instrumentVersion_key" ON "vocational_integrated_results"("evaluatedUserId", "instrumentVersion");

ALTER TABLE "vocational_responses" ADD CONSTRAINT "vocational_responses_evaluationGroupId_fkey" FOREIGN KEY ("evaluationGroupId") REFERENCES "evaluation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 12 of formmaps#52). Deliberately SIMPLIFIED: table shape only --
-- no RLS policy and no immutability trigger. Both are proven once, thoroughly, against the real DDL
-- in FormMaps.IntegrationTests/Audit (plan Tasks 1/4); repeating them across seven unrelated domain
-- fixtures would only add the DISABLE-TRIGGER reset dance for zero extra coverage. What THIS copy is
-- for is the wiring question: does VocationalWriter actually persist a row when a score recompute
-- reaches "ready" -- and, just as importantly, NOT on the two paths that persist nothing (no active
-- instrument -> never_computed, and self-only -> needs_self_plus_one).
--
-- There is deliberately no FK from "subjectId" to any table: the subject of these events is the
-- evaluated user, and audit_events outlives its subjects by design (a purged user must not take its
-- audit trail with it), so a reference here would be a shape the production table does not have.
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
