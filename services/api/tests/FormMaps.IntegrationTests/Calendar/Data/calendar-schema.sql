-- Schema-only harness for the school academic-calendar reads (FM-DOTNET-047, Phase-B).
-- Mirrors the Prisma models touched: academic_years + academic_terms + assessment_periods + holidays.

CREATE TABLE "academic_years" (
    "id"          text PRIMARY KEY,
    "schoolId"    text NOT NULL,
    "name"        text NOT NULL,
    "startDate"   timestamp NOT NULL,
    "endDate"     timestamp NOT NULL,
    "isCurrent"   boolean NOT NULL DEFAULT false,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdBy"   text,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedBy"   text,
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "academic_terms" (
    "id"             text PRIMARY KEY,
    "academicYearId" text NOT NULL,
    "name"           text NOT NULL,
    "startDate"      timestamp NOT NULL,
    "endDate"        timestamp NOT NULL,
    "sortOrder"      integer NOT NULL DEFAULT 0,
    "isActive"       boolean NOT NULL DEFAULT true,
    "createdBy"      text,
    "createdDate"    timestamp NOT NULL DEFAULT now(),
    "updatedBy"      text,
    "updatedAt"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "assessment_periods" (
    "id"              text PRIMARY KEY,
    "schoolId"        text NOT NULL,
    "termId"          text NOT NULL,
    "name"            text NOT NULL,
    "startDate"       timestamp NOT NULL,
    "endDate"         timestamp NOT NULL,
    "assessmentTypes" text[] NOT NULL DEFAULT '{}',
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "holidays" (
    "id"             text PRIMARY KEY,
    "schoolId"       text NOT NULL,
    "academicYearId" text NOT NULL,
    "name"           text NOT NULL,
    "date"           timestamp NOT NULL,
    "endDate"        timestamp,
    "type"           text NOT NULL DEFAULT 'holiday',
    "isActive"       boolean NOT NULL DEFAULT true,
    "createdBy"      text,
    "createdDate"    timestamp NOT NULL DEFAULT now(),
    "updatedBy"      text,
    "updatedAt"      timestamp NOT NULL DEFAULT now()
);
