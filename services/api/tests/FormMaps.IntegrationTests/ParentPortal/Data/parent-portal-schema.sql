-- Schema-only harness DDL for the parent portal self-scoped surface (FM-DOTNET-078), hand-written from schema.prisma.
-- Only the columns the repo queries touch are modelled (users profile/join, student_parent_links delete + children,
-- notifications list/mark, evaluation_groups pending). Timestamps are `timestamp` (no tz) to match Prisma @db defaults.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "name"       text NOT NULL,
    "email"      text,
    "gradeLevel" integer,
    "schoolId"   text
);

CREATE TABLE "student_parent_links" (
    "id"           text PRIMARY KEY,
    "studentId"    text NOT NULL,
    "parentUserId" text,
    "relation"     text NOT NULL DEFAULT 'parent',
    "isAccepted"   boolean NOT NULL DEFAULT false,
    "isActive"     boolean NOT NULL DEFAULT true,
    "createdDate"  timestamp NOT NULL DEFAULT now(),
    "updatedAt"    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "notifications" (
    "id"                text PRIMARY KEY,
    "userId"            text NOT NULL,
    "type"              text NOT NULL DEFAULT 'info',
    "title"             text NOT NULL DEFAULT 'Title',
    "message"           text NOT NULL DEFAULT 'Message',
    "isRead"            boolean NOT NULL DEFAULT false,
    "readAt"            timestamp,
    "relatedEntityId"   text,
    "relatedEntityType" text,
    "isActive"          boolean NOT NULL DEFAULT true,
    "createdBy"         text,
    "createdDate"       timestamp NOT NULL DEFAULT now(),
    "updatedBy"         text,
    "updatedAt"         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "evaluation_groups" (
    "id"                    text PRIMARY KEY,
    "evaluatorEmail"        text NOT NULL,
    "evaluatedUserId"       text NOT NULL,
    "invitationToken"       text NOT NULL DEFAULT '',
    "tokenExpiryDate"       timestamp NOT NULL DEFAULT now(),
    "isEvaluationCompleted" boolean NOT NULL DEFAULT false,
    "isActive"              boolean NOT NULL DEFAULT true,
    "createdDate"           timestamp NOT NULL DEFAULT now()
);
