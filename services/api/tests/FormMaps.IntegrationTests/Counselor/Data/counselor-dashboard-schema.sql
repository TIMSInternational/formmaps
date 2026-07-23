-- Schema-only harness DDL for the counselor dashboard reads (FM-DOTNET-067). Hand-written from schema.prisma; the
-- timestamp columns are `timestamp` WITHOUT time zone (Prisma @db.Timestamp default) so the reader's tz-independence
-- (Kind=Unspecified `now` binding) is exercised — the fixture pins a NON-UTC server timezone. course_change_requests
-- credits is numeric so trim_scale/::text behave as in prod; status/action are native enums read back via ::text.

CREATE TABLE "users" (
    "id"          text PRIMARY KEY,
    "name"        text,
    "email"       text NOT NULL,
    "roleName"    text,
    "schoolId"    text,
    "gradeLevel"  integer,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "assignedAt"  timestamp NOT NULL DEFAULT now(),
    "assignedBy"  text,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdBy"   text,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedBy"   text,
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "counselor_notes" (
    "id"                  text PRIMARY KEY,
    "studentId"           text NOT NULL,
    "authorId"            text NOT NULL,
    "type"                text NOT NULL,
    "content"             text NOT NULL,
    "isPrivate"           boolean NOT NULL DEFAULT false,
    "followUpDate"        timestamp,
    "followUpCompleted"   boolean NOT NULL DEFAULT false,
    "followUpCompletedAt" timestamp,
    "tags"                text[] NOT NULL DEFAULT '{}',
    "isActive"            boolean NOT NULL DEFAULT true,
    "createdBy"           text,
    "createdDate"         timestamp NOT NULL DEFAULT now(),
    "updatedBy"           text,
    "updatedAt"           timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "counselor_sessions" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "startTime"   timestamp NOT NULL,
    "endTime"     timestamp NOT NULL,
    "status"      text NOT NULL DEFAULT 'confirmed',
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TYPE "CourseChangeStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "CourseChangeAction" AS ENUM ('add', 'drop', 'swap');

CREATE TABLE "course_change_requests" (
    "id"            text PRIMARY KEY,
    "studentId"     text NOT NULL,
    "schoolId"      text NOT NULL,
    "courseId"      text NOT NULL,
    "courseCode"    text,
    "courseName"    text,
    "credits"       numeric NOT NULL DEFAULT 0,
    "gradeLevel"    integer NOT NULL,
    "semester"      text,
    "action"        "CourseChangeAction" NOT NULL,
    "dueDate"       timestamp,
    "studentNote"   text,
    "status"        "CourseChangeStatus" NOT NULL DEFAULT 'pending',
    "counselorNote" text,
    "reviewedBy"    text,
    "reviewedAt"    timestamp,
    "isActive"      boolean NOT NULL DEFAULT true,
    "createdBy"     text,
    "createdDate"   timestamp NOT NULL DEFAULT now(),
    "updatedBy"     text,
    "updatedAt"     timestamp NOT NULL DEFAULT now()
);
