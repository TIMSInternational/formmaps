-- Schema-only harness for the prerequisites slice (FM-DOTNET-057). Hand-authored from prisma/schema.prisma. Three
-- tables the five endpoints touch: school_courses (chain + eligibility reads; the PUT updates prerequisites/
-- corequisites/updatedBy/updatedAt — WITH @@unique([schoolId, code]) though the prereq routes don't rely on it),
-- student_grades (completed-course lookup — only schoolId/studentId/courseId/status/isActive are read), and users
-- (id/schoolId/gradeLevel for the student lookup + grade gate). credits DECIMAL (→ STRING via trim_scale::text);
-- gradeLevels INTEGER[]; prerequisites/corequisites TEXT[]. updatedAt is the @updatedAt column the writer bumps. NO
-- RLS policies (schema-only). The fixture pins a NON-UTC server tz so the now() round-trip is caught if tz-dependent.

CREATE TABLE "school_courses" (
    "id"                text PRIMARY KEY,
    "schoolId"          text NOT NULL,
    "code"              text NOT NULL,
    "name"              text NOT NULL,
    "department"        text NOT NULL DEFAULT '',
    "credits"           decimal(65,30) NOT NULL DEFAULT 0,
    "gradeLevels"       integer[] DEFAULT ARRAY[]::integer[],
    "prerequisites"     text[] DEFAULT ARRAY[]::text[],
    "corequisites"      text[] DEFAULT ARRAY[]::text[],
    "frameworkType"     text,
    "isHonors"          boolean NOT NULL DEFAULT false,
    "status"            text NOT NULL DEFAULT 'active',
    "isActive"          boolean NOT NULL DEFAULT true,
    "updatedBy"         text,
    "updatedAt"         timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "prerequisites_school_courses_schoolId_code_key" UNIQUE ("schoolId", "code")
);

CREATE TABLE "student_grades" (
    "id"         text PRIMARY KEY,
    "schoolId"   text NOT NULL,
    "studentId"  text NOT NULL,
    "courseId"   text NOT NULL,
    "status"     text NOT NULL DEFAULT 'completed',
    "isActive"   boolean NOT NULL DEFAULT true
);

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "schoolId"   text,
    "gradeLevel" integer
);

CREATE INDEX "prerequisites_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "prerequisites_grades_lookup_idx" ON "student_grades"("schoolId", "studentId", "status");
