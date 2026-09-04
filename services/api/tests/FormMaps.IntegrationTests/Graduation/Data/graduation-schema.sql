-- Harness DDL for the GRADUATION half of routes/school-grades.ts (issue #55). Hand-authored from
-- prisma/schema.prisma / prisma/migrations/0_init. No foreign keys.
--
-- formmaps#125: the PRODUCTION RLS policies are applied on top of this by GraduationDatabaseFixture and the
-- code under test runs as a NOSUPERUSER NOBYPASSRLS login. Five of the six tables here are policied and all
-- five are named in PoliciedTables.
--
-- #135 DISCLOSURE, required by CONVERTING-A-FIXTURE.md: `school_courses` IS policied in production, by
-- prisma/rls/pilot.sql, which this harness does not vendor. In THIS fixture it therefore carries no policy, so
-- every school_courses assertion below proves the app-layer predicate only. That understates production rather
-- than overstating it — but "unpolicied here" must never be written down as "unpolicied in production".
--
-- DECIMAL(65,30) on totalCreditsRequired / minCredits / value is deliberate: these are the columns legacy never
-- coerces, so they reach the client as decimal.js STRINGS, and a NUMERIC(10,2) stub would hide the
-- normalization this port has to reproduce.

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

CREATE TABLE "academic_years" (
    "id"          TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "startDate"   TIMESTAMP(3) NOT NULL,
    "endDate"     TIMESTAMP(3) NOT NULL,
    "isCurrent"   BOOLEAN NOT NULL DEFAULT false,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "graduation_rule_sets" (
    "id"                   TEXT NOT NULL,
    "schoolId"             TEXT NOT NULL,
    "academicYearId"       TEXT NOT NULL,
    "totalCreditsRequired" DECIMAL(65,30) NOT NULL,
    "isActive"             BOOLEAN NOT NULL DEFAULT true,
    "createdBy"            TEXT,
    "createdDate"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"            TEXT,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "graduation_rule_sets_pkey" PRIMARY KEY ("id")
);

-- @@unique([schoolId, academicYearId]) — reproduced because a second POST for the same year must fail the way
-- production fails, not succeed quietly.
CREATE UNIQUE INDEX "graduation_rule_sets_schoolId_academicYearId_key"
    ON "graduation_rule_sets"("schoolId", "academicYearId");

CREATE TABLE "category_requirements" (
    "id"               TEXT NOT NULL,
    "ruleSetId"        TEXT NOT NULL,
    "category"         TEXT NOT NULL,
    "minCredits"       DECIMAL(65,30) NOT NULL DEFAULT 0,
    "requiredCourses"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "electivesAllowed" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"        INTEGER NOT NULL DEFAULT 0,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdBy"        TEXT,
    "createdDate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"        TEXT,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "special_requirements" (
    "id"          TEXT NOT NULL,
    "ruleSetId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "value"       DECIMAL(65,30) NOT NULL,
    "unit"        TEXT,
    "description" TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "special_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_grades" (
    "id"           TEXT NOT NULL,
    "schoolId"     TEXT NOT NULL,
    "studentId"    TEXT NOT NULL,
    "courseId"     TEXT,
    "courseCode"   TEXT,
    "semester"     TEXT,
    "grade"        TEXT,
    "credits"      DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status"       TEXT NOT NULL DEFAULT 'completed',
    "courseLevel"  TEXT,
    "academicYear" TEXT,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_grades_pkey" PRIMARY KEY ("id")
);

-- Policied in production by pilot.sql, which this harness does not vendor (#135). See the header.
CREATE TABLE "school_courses" (
    "id"          TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "department"  TEXT,
    "credits"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status"      TEXT NOT NULL DEFAULT 'active',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "school_courses_pkey" PRIMARY KEY ("id")
);
