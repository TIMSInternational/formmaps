-- Schema-only harness DDL for the student parent-links CRUD (FM-DOTNET-076). The unique (studentId, parentEmail)
-- constraint drives the duplicate-invite → 500 path.

CREATE TABLE "student_parent_links" (
    "id"              text PRIMARY KEY,
    "studentId"       text NOT NULL,
    "parentEmail"     text NOT NULL,
    "parentName"      text NOT NULL DEFAULT '',
    "parentUserId"    text,
    "relation"        text NOT NULL DEFAULT 'parent',
    "invitationToken" text,
    "tokenExpiresAt"  timestamp,
    "isAccepted"      boolean NOT NULL DEFAULT false,
    "acceptedAt"      timestamp,
    "invitedBy"       text,
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now(),
    UNIQUE ("studentId", "parentEmail")
);
