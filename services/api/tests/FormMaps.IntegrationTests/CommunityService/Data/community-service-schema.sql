-- Schema-only harness DDL for the student community-service CRUD (FM-DOTNET-075). users (schoolId lookup) + schools
-- (serviceHoursRequired) back the GET envelope; community_service_entries is the write target. hours is Decimal
-- (trim_scale::text on read); status is the CommunityServiceStatus enum (edit/delete gated on 'pending').

CREATE TYPE "CommunityServiceStatus" AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "schoolId" text
);

CREATE TABLE "schools" (
    "id"                   text PRIMARY KEY,
    "serviceHoursRequired" integer
);

CREATE TABLE "community_service_entries" (
    "id"              text PRIMARY KEY,
    "studentId"       text NOT NULL,
    "schoolId"        text NOT NULL,
    "organization"    text NOT NULL,
    "description"     text,
    "hours"           decimal(65,30) NOT NULL,
    "date"            timestamp NOT NULL,
    "supervisorName"  text,
    "supervisorEmail" text,
    "status"          "CommunityServiceStatus" NOT NULL DEFAULT 'pending',
    "note"            text,
    "verifiedBy"      text,
    "verifiedAt"      timestamp,
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
);
