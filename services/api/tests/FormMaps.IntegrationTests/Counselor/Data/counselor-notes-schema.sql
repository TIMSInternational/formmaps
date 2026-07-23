-- Schema-only harness DDL for the counselor notes CRUD (FM-DOTNET-072). users for the author-name join;
-- counselor_student_assignments for the ensureCounselorStudentAccess check; counselor_notes is the write target
-- (tags is a text[]; followUpDate / followUpCompletedAt are nullable timestamps).

CREATE TABLE "users" (
    "id"   text PRIMARY KEY,
    "name" text
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
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
