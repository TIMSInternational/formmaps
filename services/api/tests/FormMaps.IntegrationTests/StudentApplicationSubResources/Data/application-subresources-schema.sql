-- Schema-only harness DDL for application essays + checklist (FM-DOTNET-077), hand-written from schema.prisma.
-- Includes a minimal "student_applications" parent (the ownership gate reads its "studentId") plus the two
-- sub-resource tables. All timestamp columns are `timestamp` (no tz) to match Prisma @db defaults, exactly as the
-- FM-074 harness does.

CREATE TABLE "student_applications" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "name"        text NOT NULL DEFAULT 'n',
    "type"        text NOT NULL DEFAULT 'university',
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "application_essays" (
    "id"                   text PRIMARY KEY,
    "studentApplicationId" text NOT NULL,
    "title"                text NOT NULL,
    "prompt"               text,
    "wordLimit"            integer,
    "currentDraft"         text,
    "draftVersion"         integer NOT NULL DEFAULT 1,
    "status"               text NOT NULL DEFAULT 'not_started',
    "dueDate"              timestamp,
    "isActive"             boolean NOT NULL DEFAULT true,
    "createdBy"            text,
    "createdDate"          timestamp NOT NULL DEFAULT now(),
    "updatedBy"            text,
    "updatedAt"            timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "application_checklists" (
    "id"                   text PRIMARY KEY,
    "studentApplicationId" text NOT NULL,
    "itemName"             text NOT NULL,
    "category"             text NOT NULL DEFAULT 'other',
    "isCompleted"          boolean NOT NULL DEFAULT false,
    "completedAt"          timestamp,
    "dueDate"              timestamp,
    "notes"                text,
    "isActive"             boolean NOT NULL DEFAULT true,
    "createdBy"            text,
    "createdDate"          timestamp NOT NULL DEFAULT now(),
    "updatedBy"            text,
    "updatedAt"            timestamp NOT NULL DEFAULT now()
);
