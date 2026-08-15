-- Schema-only harness DDL for the question360 READS slice (FM-DOTNET question360). Hand-authored from
-- prisma/schema.prisma model Question360 (@@map("questions_360")). It is a GLOBAL reference/catalog table:
-- no schoolId, no RLS policy, no foreign keys (schema-only). There is NO correct-answer / scoring-key column.
-- The fixture pins a NON-UTC server timezone so ISO-Z timestamp emission is caught if it were tz-dependent.

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

CREATE INDEX "questions_360_questionNumber_idx" ON "questions_360"("questionNumber");
CREATE INDEX "questions_360_parentQuestionId_idx" ON "questions_360"("parentQuestionId");

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 13 of formmaps#52). Deliberately SIMPLIFIED: table shape only --
-- no RLS policy and no immutability trigger. Both are proven once, thoroughly, against the real DDL
-- in FormMaps.IntegrationTests/Audit (plan Tasks 1/4); repeating them across seven unrelated domain
-- fixtures would only add the DISABLE-TRIGGER reset dance for zero extra coverage. What THIS copy is
-- for is the wiring question: does Question360Writer actually persist a row for each of its five
-- mutation paths -- and, just as importantly, NOT on the paths that persist nothing (a missing id on
-- update/activate/delete, and the delete child-guard).
--
-- "subjectId" is NULLABLE and stays null for bulk_created: a batch has no single subject. That is the
-- production shape too (see infra/aws/sql/audit-events-schema.sql), so the assertions here exercise
-- the same nullability the real table has rather than a stricter local copy.
--
-- There is deliberately no FK from "subjectId" to "questions_360": audit_events outlives its subjects
-- by design (a purged catalog row must not take its audit trail with it), so a reference here would be
-- a shape the production table does not have -- and questions_360 is TRUNCATEd between tests.
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
