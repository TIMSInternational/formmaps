-- Harness DDL for the student parent-links CRUD (FM-DOTNET-076). The unique (studentId, parentEmail)
-- constraint drives the duplicate-invite → 500 path.
--
-- formmaps#125: the production RLS policies are applied on top of this and the repository runs as a
-- NOSUPERUSER NOBYPASSRLS login. "users" is here purely to satisfy those policies — no query in this slice
-- reads it, but student_parent_links' tenant_isolation (003-fk-users.sql) sub-selects it for the school branch
-- ("the student's school staff may see the link"), so the policy cannot be created without it. Dropping the
-- policy instead would leave the table unprotected and make the isolation assertions vacuous.

CREATE TABLE "users" (
    "id"       text PRIMARY KEY,
    "name"     text NOT NULL DEFAULT '',
    "schoolId" text
);

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
