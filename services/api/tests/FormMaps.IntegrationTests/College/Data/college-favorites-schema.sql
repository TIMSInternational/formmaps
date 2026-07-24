-- Schema-only harness DDL for college search + favorites (FM-DOTNET-082), hand-written from schema.prisma.
-- No RLS policies. universities carries only the columns the /search + favorites-join select touch; acceptanceRate is
-- Decimal (numeric), the sat*/act*/studentCount are Int, tuition is jsonb (default '{}'). university_favorites has the
-- unique (userId, universityId) that backs the upsert-reactivate + 409.

CREATE TABLE "universities" (
    "id"               text PRIMARY KEY,
    "name"             text NOT NULL,
    "city"             text NOT NULL,
    "state"            text,
    "acceptanceRate"   numeric,
    "satAverage"       integer,
    "satReading25"     integer,
    "satReading75"     integer,
    "satMath25"        integer,
    "satMath75"        integer,
    "actCumulative25"  integer,
    "actCumulative75"  integer,
    "actCumulativeMid" integer,
    "tuition"          jsonb NOT NULL DEFAULT '{}',
    "studentCount"     integer,
    "type"             text NOT NULL,
    "website"          text NOT NULL DEFAULT '',
    "isActive"         boolean NOT NULL DEFAULT true
);

CREATE TABLE "university_favorites" (
    "id"                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"            text NOT NULL,
    "universityId"      text NOT NULL,
    "favoritedAt"       timestamp NOT NULL DEFAULT now(),
    "notes"             text,
    "fitClassification" text,
    "isActive"          boolean NOT NULL DEFAULT true,
    "createdBy"         text,
    "createdDate"       timestamp NOT NULL DEFAULT now(),
    "updatedBy"         text,
    "updatedAt"         timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "university_favorites_userId_universityId_key" UNIQUE ("userId", "universityId")
);
