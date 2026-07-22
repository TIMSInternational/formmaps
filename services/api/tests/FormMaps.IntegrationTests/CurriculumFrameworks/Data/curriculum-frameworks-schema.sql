-- Schema-only harness for the curriculum:manage frameworks reads/writes (FM-DOTNET-055). Hand-authored from
-- prisma/schema.prisma / migrations/20260505140750_init: curriculum_frameworks, framework_courses and
-- school_framework_course_overrides, with the two @@unique indexes the UPSERTs depend on (ON CONFLICT targets).
-- NO foreign keys / RLS policies (schema-only). Decimal columns use the Prisma DECIMAL(65,30); the readers/writer
-- emit credits via trim_scale("credits")::text so it reads back as a decimal.js JSON string (raw Prisma Decimal
-- passthrough — FM-054 finding). gradeLevels is INTEGER[]. The fixture pins a
-- NON-UTC server timezone so the ISO-Z timestamps must not depend on the container's local tz.

CREATE TABLE "curriculum_frameworks" (
    "id"           text PRIMARY KEY,
    "schoolId"     text NOT NULL,
    "type"         text NOT NULL,
    "enabled"      boolean NOT NULL DEFAULT false,
    "configuredAt" timestamp,
    "isActive"     boolean NOT NULL DEFAULT true,
    "createdBy"    text,
    "createdDate"  timestamp NOT NULL DEFAULT now(),
    "updatedBy"    text,
    "updatedAt"    timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "curriculum_frameworks_schoolId_type_key"
    ON "curriculum_frameworks"("schoolId", "type");

CREATE TABLE "framework_courses" (
    "id"            text PRIMARY KEY,
    "frameworkType" text NOT NULL,
    "code"          text NOT NULL,
    "name"          text NOT NULL,
    "department"    text,
    "credits"       decimal(65,30) NOT NULL DEFAULT 0,
    "gradeLevels"   integer[] DEFAULT ARRAY[]::integer[],
    "description"   text,
    "isGlobal"      boolean NOT NULL DEFAULT true,
    "schoolId"      text,
    "isActive"      boolean NOT NULL DEFAULT true,
    "createdBy"     text,
    "createdDate"   timestamp NOT NULL DEFAULT now(),
    "updatedBy"     text,
    "updatedAt"     timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "framework_courses_frameworkType_code_key"
    ON "framework_courses"("frameworkType", "code");

CREATE TABLE "school_framework_course_overrides" (
    "id"                text PRIMARY KEY,
    "schoolId"          text NOT NULL,
    "frameworkCourseId" text NOT NULL,
    "credits"           decimal(65,30),
    "gradeLevels"       integer[] DEFAULT ARRAY[]::integer[],
    "localName"         text,
    "isActive"          boolean NOT NULL DEFAULT true,
    "createdBy"         text,
    "createdDate"       timestamp NOT NULL DEFAULT now(),
    "updatedBy"         text,
    "updatedAt"         timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "school_framework_course_overrides_schoolId_frameworkCourseId_key"
    ON "school_framework_course_overrides"("schoolId", "frameworkCourseId");
