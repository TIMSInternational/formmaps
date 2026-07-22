-- Schema-only harness for the school-courses slice (FM-DOTNET-054). Hand-authored from prisma/schema.prisma
-- reflecting the CURRENT model (the init migration predates the maxEnrollment/isHonors columns, which live only in
-- schema.prisma via db-push; the live code reads/writes them, so the harness includes them). Four tables the two
-- routes touch: school_courses (list + create, WITH the @@unique([schoolId, code]) the ON-CONFLICT/23505 relies on),
-- student_course_plans (enrollmentCount groupBy — only courseId+status are read), curriculum_frameworks (enabled
-- types) and framework_courses (the merge set, WITH @@unique([frameworkType, code])). credits is DECIMAL (→ number
-- via ::double precision); gradeLevels INTEGER[]; prerequisites/corequisites TEXT[]. gen_random_uuid() is built-in on
-- postgres 13+. NO RLS policies (schema-only). The fixture pins a NON-UTC server tz so the ISO-Z / now() round-trips
-- are caught if tz-dependent.

CREATE TABLE "school_courses" (
    "id"                text PRIMARY KEY,
    "schoolId"          text NOT NULL,
    "code"              text NOT NULL,
    "name"              text NOT NULL,
    "department"        text NOT NULL,
    "credits"           decimal(65,30) NOT NULL DEFAULT 0,
    "gradeLevels"       integer[] DEFAULT ARRAY[]::integer[],
    "prerequisites"     text[] DEFAULT ARRAY[]::text[],
    "corequisites"      text[] DEFAULT ARRAY[]::text[],
    "frameworkType"     text,
    "frameworkCourseId" text,
    "description"       text,
    "maxEnrollment"     integer,
    "isHonors"          boolean NOT NULL DEFAULT false,
    "status"            text NOT NULL DEFAULT 'active',
    "isActive"          boolean NOT NULL DEFAULT true,
    "createdBy"         text,
    "createdDate"       timestamp NOT NULL DEFAULT now(),
    "updatedBy"         text,
    "updatedAt"         timestamp NOT NULL,
    CONSTRAINT "school_courses_schoolId_code_key" UNIQUE ("schoolId", "code")
);

-- Only courseId + status are read (enrollmentCount groupBy). id PK for insert; the other NOT-NULL relational
-- columns are kept nullable here for seed convenience (this is a schema-only read harness, no FK/RLS fidelity).
CREATE TABLE "student_course_plans" (
    "id"             text PRIMARY KEY,
    "studentId"      text,
    "schoolId"       text,
    "academicYearId" text,
    "courseId"       text NOT NULL,
    "status"         text NOT NULL DEFAULT 'planned',
    "isActive"       boolean NOT NULL DEFAULT true
);

CREATE TABLE "curriculum_frameworks" (
    "id"       text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "type"     text NOT NULL,
    "enabled"  boolean NOT NULL DEFAULT false,
    "isActive" boolean NOT NULL DEFAULT true,
    CONSTRAINT "curriculum_frameworks_schoolId_type_key" UNIQUE ("schoolId", "type")
);

CREATE TABLE "framework_courses" (
    "id"            text PRIMARY KEY,
    "frameworkType" text NOT NULL,
    "code"          text NOT NULL,
    "name"          text NOT NULL,
    "department"    text,
    "credits"       decimal(65,30) NOT NULL DEFAULT 0,
    "gradeLevels"   integer[] DEFAULT ARRAY[]::integer[],
    "isActive"      boolean NOT NULL DEFAULT true,
    CONSTRAINT "framework_courses_frameworkType_code_key" UNIQUE ("frameworkType", "code")
);

CREATE INDEX "schoolcourses_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "schoolcourses_plans_courseId_idx" ON "student_course_plans"("courseId");
CREATE INDEX "schoolcourses_frameworks_schoolId_idx" ON "curriculum_frameworks"("schoolId");
CREATE INDEX "schoolcourses_fwcourses_frameworkType_idx" ON "framework_courses"("frameworkType");
