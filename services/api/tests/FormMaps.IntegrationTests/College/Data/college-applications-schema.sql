-- Schema-only harness DDL for the college applications CRUD (FM-DOTNET-081), hand-written from schema.prisma.
-- No RLS policies (schema-only harness, like the other write fixtures). ApplicationColumn is a committed-migration
-- enum; CollegeAppStatus + the college drift columns match the FM-074 student-applications fixture. users /
-- counselor_student_assignments back the getStudentAccess rail; application_checklists / college_essays back the
-- unfiltered list counts; universities backs the create name lookup.

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

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "schoolId" text,
    "roleName" text
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "application_checklists" (
    "id"                   text PRIMARY KEY,
    "studentApplicationId" text NOT NULL,
    "isActive"             boolean NOT NULL DEFAULT true
);

CREATE TABLE "college_essays" (
    "id"                   text PRIMARY KEY,
    "studentApplicationId" text,
    "isActive"             boolean NOT NULL DEFAULT true
);

CREATE TABLE "universities" (
    "id"   text PRIMARY KEY,
    "name" text NOT NULL
);
