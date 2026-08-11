-- Harness DDL for the test-scores READS slice (FM-DOTNET-037). Hand-authored from prisma/schema.prisma:
-- student_test_scores (full row the list/student-view returns), a minimal universities catalog (the 9 columns
-- college-fit reads), and the two authorization tables the student-view checks (counselor_student_assignments,
-- student_parent_links). No foreign keys. The fixture pins a NON-UTC server timezone so the ISO-Z timestamp
-- emission is caught if it were tz-dependent.
--
-- formmaps#125: the PRODUCTION RLS policies are now applied on top of this by TestScoreDatabaseFixture, and the
-- reads run as a NOSUPERUSER NOBYPASSRLS login. `users` had to be added below to make that possible — it is not
-- read by any query in this slice, but all three policied tables here sub-select it for their school branch
-- ("owner.schoolId = app.current_school_id"), so without it those policies cannot even be created. Dropping the
-- policies instead would have left the tables unprotected and every isolation assertion vacuous, which is the
-- exact failure #125 is about; ProductionRlsPolicies refuses to make that trade silently.
--
-- `universities` is deliberately NOT policied: it is a global catalog, unpolicied in production too.

-- Policy-support table (school branch of 003-fk-users.sql) + the tenant key itself (005-sensitive.sql).
CREATE TABLE "users" (
    "id"       TEXT NOT NULL,
    "name"     TEXT NOT NULL DEFAULT '',
    "email"    TEXT,
    "schoolId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_test_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "testDate" TIMESTAMP(3),
    "satTotal" INTEGER,
    "satMath" INTEGER,
    "satReading" INTEGER,
    "actComposite" INTEGER,
    "actEnglish" INTEGER,
    "actMath" INTEGER,
    "actReading" INTEGER,
    "actScience" INTEGER,
    "apSubject" TEXT,
    "apScore" INTEGER,
    "totalScore" INTEGER,
    "subScores" JSONB,
    "isSuperScore" BOOLEAN NOT NULL DEFAULT false,
    "isOfficial" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_test_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "universities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "acceptanceRate" DECIMAL,
    "satReading25" INTEGER,
    "satReading75" INTEGER,
    "satMath25" INTEGER,
    "satMath75" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "counselor_student_assignments" (
    "id" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "counselor_student_assignments_pkey" PRIMARY KEY ("id")
);

-- formmaps#121: "parentUserId" and "isAccepted" were missing here. They exist in the real schema and are what
-- the parent gate now matches on — the old fixture could only express an email match, which is precisely the
-- shape the bug had. See formmaps#125: this whole file is hand-written and carries no RLS, so it cannot catch
-- the tenant-isolation half of that bug either.
CREATE TABLE "student_parent_links" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "parentUserId" TEXT,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_parent_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_test_scores_userId_idx" ON "student_test_scores"("userId");
CREATE INDEX "counselor_student_assignments_pair_idx" ON "counselor_student_assignments"("counselorId", "studentId");
CREATE INDEX "student_parent_links_pair_idx" ON "student_parent_links"("studentId", "parentUserId");

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 10 of formmaps#52). Deliberately SIMPLIFIED: table shape only --
-- no RLS policy and no immutability trigger. Both are proven once, thoroughly, against the real DDL
-- in FormMaps.IntegrationTests/Audit (plan Tasks 1/4); repeating them here would only add the
-- DISABLE-TRIGGER reset dance to seven unrelated fixtures for zero extra coverage. What THIS copy is
-- for is the wiring question: does TestScoreWriter actually persist a row when a score is created,
-- updated and soft-deleted -- and, just as importantly, NOT on the paths that write nothing (a
-- rejected body, a foreign/missing row, a repeated delete).
--
-- It is deliberately absent from TestScoreDatabaseFixture.PoliciedTables: production policies nothing
-- on audit_events either -- it is locked to bypass-mode sessions by its own RLS policy instead (see
-- infra/aws/sql/audit-events-schema.sql), which is a shape this simplified copy does not reproduce.
-- The app login still reaches it here because CreateRestrictedLoginAsync grants ON ALL TABLES after
-- this file has run.
--
-- There is deliberately no FK from "subjectId" to student_test_scores: audit_events outlives its
-- subjects by design (a hard-deleted score must not take its audit trail with it), so a reference
-- here would be a shape the production table does not have.
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
