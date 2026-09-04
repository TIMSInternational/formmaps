-- Harness DDL for the transcript + GPA slice (issue #55, routes/transcript.ts). Hand-authored from
-- prisma/schema.prisma / prisma/migrations/0_init: the six tables the nine routes touch, with the column TYPES
-- that matter to this port (DECIMAL(65,30) for every GPA/credit column, JSONB for the maps and the yearly
-- breakdown, TIMESTAMP(3) for the ISO-Z emission). No foreign keys.
--
-- formmaps#125: the PRODUCTION RLS policies are applied on top of this by TranscriptDatabaseFixture and the
-- code under test runs as a NOSUPERUSER NOBYPASSRLS login. Every table below is policied in production, so
-- every one is named in PoliciedTables. `users` is load-bearing twice over: it is read directly by the reader
-- AND sub-selected by student_gpas' school branch (003-fk-users.sql), so the policies cannot even be created
-- without it.
--
-- DECIMAL(65,30) is deliberate, not decoration. Postgres renders such a column with all thirty fractional
-- digits, and the `scale` column of gpa_configurations is the one Decimal legacy does NOT coerce — it reaches
-- JSON.stringify as a decimal.js STRING. A NUMERIC(10,2) stub would have hidden the normalization this port
-- has to reproduce.

CREATE TABLE "users" (
    "id"         TEXT NOT NULL,
    "name"       TEXT NOT NULL DEFAULT '',
    "email"      TEXT,
    "schoolId"   TEXT,
    "roleName"   TEXT,
    "gradeLevel" INTEGER,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_grades" (
    "id"          TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "courseId"    TEXT,
    "courseCode"  TEXT,
    "semester"    TEXT,
    "grade"       TEXT,
    "credits"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status"      TEXT NOT NULL DEFAULT 'completed',
    "importJobId" TEXT,
    "courseLevel" TEXT,
    "academicYear" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_gpas" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "gpaUnweighted"   DECIMAL(65,30),
    "gpaWeighted"     DECIMAL(65,30),
    "totalCredits"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "classRank"       INTEGER,
    "classSize"       INTEGER,
    "rankPercentile"  DECIMAL(65,30),
    "yearlyBreakdown" JSONB NOT NULL DEFAULT '{}',
    "computedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdBy"       TEXT,
    "createdDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"       TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_gpas_pkey" PRIMARY KEY ("id")
);

-- The ON CONFLICT target of computeAndPersistGpa / computeClassRanks (`userId String @unique`).
CREATE UNIQUE INDEX "student_gpas_userId_key" ON "student_gpas"("userId");

CREATE TABLE "gpa_configurations" (
    "id"            TEXT NOT NULL,
    "schoolId"      TEXT NOT NULL,
    "scale"         DECIMAL(65,30) NOT NULL DEFAULT 4.0,
    "unweightedMap" JSONB NOT NULL DEFAULT '{"A+":4.0,"A":4.0,"A-":3.7,"B+":3.3,"B":3.0,"B-":2.7,"C+":2.3,"C":2.0,"C-":1.7,"D+":1.3,"D":1.0,"D-":0.7,"F":0.0}',
    "weightBonuses" JSONB NOT NULL DEFAULT '{"honors":0.5,"ap":1.0,"ib":1.0}',
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdBy"     TEXT,
    "createdDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"     TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gpa_configurations_pkey" PRIMARY KEY ("id")
);

-- The ON CONFLICT target of the gpa-config upsert (`schoolId String @unique`).
CREATE UNIQUE INDEX "gpa_configurations_schoolId_key" ON "gpa_configurations"("schoolId");

-- `role` is the SchoolUserRole enum in production; the reader compares it to the literal 'student', so the
-- enum is reproduced rather than flattened to TEXT — a TEXT column would let a query that forgot the cast pass
-- here and fail against production.
CREATE TYPE "SchoolUserRole" AS ENUM ('student', 'teacher', 'counselor', 'school_admin', 'parent');

CREATE TABLE "school_users" (
    "id"          TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "role"        "SchoolUserRole" NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'active',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_parent_links" (
    "id"           TEXT NOT NULL,
    "studentId"    TEXT NOT NULL,
    "parentUserId" TEXT,
    "parentEmail"  TEXT,
    "relationship" TEXT,
    "isAccepted"   BOOLEAN NOT NULL DEFAULT false,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_parent_links_pkey" PRIMARY KEY ("id")
);
