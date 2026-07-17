-- Supplemental harness DDL for the vocational INTEGRATED recompute write slice (FM-DOTNET-036).
-- Loaded ALONGSIDE assessmentprofile-schema.sql (the assembler's 10 source tables) — this file adds only
-- the three vocational tables the integrated recompute touches (verbatim from vocational-schema.sql /
-- prisma schema): the active instrument (integrationWeights + interpretationBands), the persisted 360 score
-- (read via FM-033 for the threeSixty channel), and the vocational_integrated_results write target. No
-- overlap with the assessmentprofile tables. NO RLS policies (schema-only). The two @@unique keys back the
-- ON CONFLICT (evaluatedUserId, instrumentVersion) upserts.

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

CREATE UNIQUE INDEX "vocational_instruments_version_key" ON "vocational_instruments"("version");
CREATE UNIQUE INDEX "vocational_results_evaluatedUserId_instrumentVersion_key" ON "vocational_results"("evaluatedUserId", "instrumentVersion");
CREATE UNIQUE INDEX "vocational_integrated_results_evaluatedUserId_instrumentVersion_key" ON "vocational_integrated_results"("evaluatedUserId", "instrumentVersion");
