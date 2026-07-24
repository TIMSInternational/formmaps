-- Schema-only harness DDL for the student applications core CRUD (FM-DOTNET-074), hand-written from schema.prisma.
-- ApplicationColumn is a committed-migration enum; CollegeAppStatus + fitClassification/applicationDeadline/
-- deadlineType/universityId/appStatus are prod db-push drift (no committed migration). matchScore is a nullable int.

CREATE TYPE "ApplicationColumn" AS ENUM ('researching', 'shortlisted', 'applying', 'applied', 'accepted');
CREATE TYPE "CollegeAppStatus" AS ENUM ('researching', 'applying', 'submitted', 'accepted', 'rejected', 'waitlisted', 'enrolled');

CREATE TABLE "student_applications" (
    "id"                  text PRIMARY KEY,
    "studentId"           text NOT NULL,
    "name"                text NOT NULL,
    "type"                text NOT NULL,
    "location"            text,
    "matchScore"          integer,
    "deadline"            text,
    "notes"               text,
    "column"              "ApplicationColumn" NOT NULL DEFAULT 'researching',
    "fitClassification"   text,
    "applicationDeadline" timestamp,
    "deadlineType"        text,
    "universityId"        text,
    "isActive"            boolean NOT NULL DEFAULT true,
    "createdBy"           text,
    "createdDate"         timestamp NOT NULL DEFAULT now(),
    "updatedBy"           text,
    "updatedAt"           timestamp NOT NULL DEFAULT now(),
    "appStatus"           "CollegeAppStatus" NOT NULL DEFAULT 'researching'
);
