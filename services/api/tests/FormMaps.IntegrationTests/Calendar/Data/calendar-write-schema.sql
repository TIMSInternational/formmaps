-- Schema-only harness for the school academic-calendar WRITES (FM-DOTNET-048, Phase-B).
-- Distinct from calendar-schema.sql (the reads harness): this one carries the real DB-level FK cascades
-- (academic_terms -> academic_years, holidays -> academic_years, both ON DELETE CASCADE) that
-- deleteAcademicYear relies on. The reads harness cannot carry these FKs — its tests seed holidays/terms
-- that reference non-existent years — so the two harnesses are kept separate (the fixtures match distinct
-- EndsWith suffixes: "calendar-schema.sql" vs "calendar-write-schema.sql").

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
    "academicYearId" text NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
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
    "academicYearId" text NOT NULL REFERENCES "academic_years"("id") ON DELETE CASCADE,
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
