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
