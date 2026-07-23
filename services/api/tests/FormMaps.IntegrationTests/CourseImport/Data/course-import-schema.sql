-- Schema-only harness for the course bulk-import CORE slice (FM-DOTNET-059). Hand-authored from prisma/schema.prisma:
-- the native "ImportJobStatus" enum, school_courses (the upsert target — code set copied from the FM-054 school-courses
-- harness, WITH the @@unique([schoolId, code])), school_course_import_jobs (validationErrors jsonb default '[]', status
-- the enum) and school_course_import_errors (rawRow jsonb default '{}', errorMessages text[]). credits is DECIMAL;
-- gradeLevels INTEGER[]; prerequisites/corequisites TEXT[]. gen_random_uuid() is built-in on postgres 13+. NO RLS
-- (schema-only). The fixture pins a NON-UTC server tz so the ISO-Z / now() round-trips are caught if tz-dependent.

CREATE TYPE "ImportJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

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

CREATE TABLE "school_course_import_jobs" (
    "id"               text PRIMARY KEY,
    "schoolId"         text NOT NULL,
    "uploaderUserId"   text NOT NULL,
    "filename"         text,
    "status"           "ImportJobStatus" NOT NULL DEFAULT 'pending',
    "totalRows"        integer NOT NULL DEFAULT 0,
    "processedRows"    integer NOT NULL DEFAULT 0,
    "failedRows"       integer NOT NULL DEFAULT 0,
    "validationErrors" jsonb NOT NULL DEFAULT '[]',
    "completedAt"      timestamp,
    "isActive"         boolean NOT NULL DEFAULT true,
    "createdBy"        text,
    "createdDate"      timestamp NOT NULL DEFAULT now(),
    "updatedBy"        text,
    "updatedAt"        timestamp NOT NULL
);

CREATE TABLE "school_course_import_errors" (
    "id"            text PRIMARY KEY,
    "jobId"         text NOT NULL,
    "rowNumber"     integer NOT NULL,
    "rawRow"        jsonb NOT NULL DEFAULT '{}',
    "errorMessages" text[] DEFAULT ARRAY[]::text[],
    "isActive"      boolean NOT NULL DEFAULT true,
    "createdBy"     text,
    "createdDate"   timestamp NOT NULL DEFAULT now(),
    "updatedBy"     text,
    "updatedAt"     timestamp NOT NULL
);

CREATE INDEX "courseimport_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "courseimport_jobs_schoolId_idx" ON "school_course_import_jobs"("schoolId");
CREATE INDEX "courseimport_errors_jobId_idx" ON "school_course_import_errors"("jobId");
