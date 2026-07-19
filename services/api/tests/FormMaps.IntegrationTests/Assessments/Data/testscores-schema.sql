-- Schema-only harness DDL for the test-scores READS slice (FM-DOTNET-037). Hand-authored from
-- prisma/schema.prisma: student_test_scores (full row the list/student-view returns), a minimal universities
-- catalog (the 9 columns college-fit reads), and the two authorization tables the student-view checks
-- (counselor_student_assignments, student_parent_links). NO foreign keys / RLS policies (schema-only). The
-- fixture pins a NON-UTC server timezone so the ISO-Z timestamp emission is caught if it were tz-dependent.

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

CREATE TABLE "student_parent_links" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "student_parent_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_test_scores_userId_idx" ON "student_test_scores"("userId");
CREATE INDEX "counselor_student_assignments_pair_idx" ON "counselor_student_assignments"("counselorId", "studentId");
CREATE INDEX "student_parent_links_pair_idx" ON "student_parent_links"("studentId", "parentEmail");
