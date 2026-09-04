-- Harness DDL for the graduation-PLAN half of issue #55 (routes/graduation-plan.ts +
-- routes/counselor-graduation.ts). Hand-authored from prisma/schema.prisma. No foreign keys.
--
-- formmaps#125: the PRODUCTION RLS policies are applied on top of this by
-- GraduationPlanDatabaseFixture and the code under test runs as a NOSUPERUSER NOBYPASSRLS login.
--
-- #135 DISCLOSURE, required by CONVERTING-A-FIXTURE.md. TWO tables here are policied in production by
-- prisma/rls/pilot.sql, which this harness does not vendor, and are therefore deliberately ABSENT from
-- PoliciedTables:
--   * student_course_plans -- written by the counselor approve path;
--   * school_courses       -- not read by this lane at all, and not created here.
-- Every student_course_plans assertion below proves the APP-LAYER predicate only. That understates
-- production, which is the safe direction, but it must not be re-read as "unpolicied in production".
--
-- `courses` and `universities` are GLOBAL catalogs and carry no policy in ANY vendored file — that is
-- production, not a harness gap. The supplemental rail reads the whole `courses` table on purpose.
--
-- @@unique([studentId]) on student_graduation_targets is reproduced because the port's upsert is an
-- ON CONFLICT ("studentId") and would be a plain INSERT-that-always-succeeds without it.

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
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- Decimal(65,30) on totalPlannedCredits / credits mirrors Prisma. Unlike the rule-set tree these ARE
-- coerced with Number() by legacy, so the port reads them ::double precision; the wide column is kept so a
-- regression back to an uncoerced string would be visible.
CREATE TABLE "graduation_plans" (
    "id"                  TEXT NOT NULL,
    "studentId"           TEXT NOT NULL,
    "schoolId"            TEXT NOT NULL,
    "targetId"            TEXT NOT NULL,
    "templateKey"         TEXT NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'draft',
    "engineVersion"       TEXT NOT NULL DEFAULT 'v1',
    "inputHash"           TEXT,
    "gapReport"           JSONB NOT NULL DEFAULT '[]',
    "warnings"            JSONB NOT NULL DEFAULT '[]',
    "rationale"           TEXT,
    "totalPlannedCredits" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "submittedAt"         TIMESTAMP(3),
    "reviewedBy"          TEXT,
    "reviewedAt"          TIMESTAMP(3),
    "reviewNote"          TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdBy"           TEXT,
    "createdDate"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"           TEXT,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "graduation_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "graduation_plan_items" (
    "id"          TEXT NOT NULL,
    "planId"      TEXT NOT NULL,
    "schoolId"    TEXT NOT NULL,
    "courseId"    TEXT NOT NULL,
    "courseCode"  TEXT NOT NULL,
    "courseName"  TEXT NOT NULL,
    "credits"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gradeLevel"  INTEGER NOT NULL,
    "term"        TEXT,
    "category"    TEXT,
    "reason"      TEXT,
    "source"      TEXT NOT NULL DEFAULT 'engine',
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdBy"   TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"   TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "graduation_plan_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_graduation_targets" (
    "id"              TEXT NOT NULL,
    "studentId"       TEXT NOT NULL,
    "schoolId"        TEXT,
    "universityId"    TEXT,
    "universityName"  TEXT,
    "major"           TEXT NOT NULL,
    "fieldKey"        TEXT NOT NULL,
    "selectivityTier" TEXT NOT NULL,
    "templateKey"     TEXT NOT NULL,
    "source"          TEXT NOT NULL DEFAULT 'recommendation',
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdBy"       TEXT,
    "createdDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"       TEXT,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_graduation_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_graduation_targets_studentId_key"
    ON "student_graduation_targets"("studentId");

CREATE TABLE "counselor_student_assignments" (
    "id"          TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "assignedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy"  TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "counselor_student_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_parent_links" (
    "id"           TEXT NOT NULL,
    "studentId"    TEXT NOT NULL,
    "parentEmail"  TEXT NOT NULL,
    "parentName"   TEXT NOT NULL DEFAULT '',
    "parentUserId" TEXT,
    "relation"     TEXT NOT NULL DEFAULT 'parent',
    "isAccepted"   BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt"   TIMESTAMP(3),
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_parent_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "title"             TEXT NOT NULL,
    "message"           TEXT NOT NULL,
    "isRead"            BOOLEAN NOT NULL DEFAULT false,
    "readAt"            TIMESTAMP(3),
    "relatedEntityId"   TEXT,
    "relatedEntityType" TEXT,
    "isActive"          BOOLEAN NOT NULL DEFAULT true,
    "createdBy"         TEXT,
    "createdDate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"         TEXT,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "university_favorites" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "favoritedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdDate"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "university_favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "targetCareers"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "preferredFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdDate"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_career_profiles" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "careerMatches" JSONB NOT NULL DEFAULT '[]',
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_career_profiles_pkey" PRIMARY KEY ("id")
);

-- Global catalogs: no policy in any vendored file, and none in production either.
CREATE TABLE "universities" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "acceptanceRate" DECIMAL(65,30),
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdDate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courses" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "provider"    TEXT NOT NULL DEFAULT '',
    "category"    TEXT NOT NULL DEFAULT '',
    "rating"      DECIMAL(65,30) NOT NULL DEFAULT 0,
    "skills"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "careerPaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_enrollments" (
    "id"          TEXT NOT NULL,
    "courseId"    TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'enrolled',
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- Policied in production by pilot.sql, which this harness does not vendor (#135). See the header.
CREATE TABLE "student_course_plans" (
    "id"             TEXT NOT NULL,
    "studentId"      TEXT NOT NULL,
    "schoolId"       TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "term"           TEXT,
    "gradeLevel"     INTEGER,
    "courseId"       TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'planned',
    "sortOrder"      INTEGER NOT NULL DEFAULT 0,
    "notes"          TEXT,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    "createdBy"      TEXT,
    "createdDate"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"      TEXT,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_course_plans_pkey" PRIMARY KEY ("id")
);
