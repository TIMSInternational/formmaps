-- services/api/tests/FormMaps.IntegrationTests/Teacher/Data/teacher-schema.sql
-- Test-only fixture mirroring the LIVE Node/Prisma-owned tables routes/teacher.ts reads and writes
-- (teacher_invites, users, roles, evaluation_groups, and a touched-column subset of schools), per
-- api/prisma/schema.prisma in formmaps-platform. Production already has these via the live Node/Prisma
-- migrations; nothing in issue #62 creates or alters a production table. Never run this outside Testcontainers.
--
-- "updatedAt" is NOT NULL with NO database default on every table below, matching production exactly
-- (Prisma @updatedAt is application-managed, never a DB-level default). Do not add DEFAULT now(): every
-- writer must bind it explicitly, so a missing bind fails here the way it would against production.
--
-- WHICH TABLES ARE POLICIED IS DELIBERATE AND ASYMMETRIC, see TeacherDatabaseFixture:
--   teacher_invites   -> 007-self-scoped.sql (direct "schoolId")
--   users             -> 005-sensitive.sql   (own id OR own school)
--   evaluation_groups -> 003-fk-users.sql    (evaluated user OR that user's school)
--   schools           -> NOT policied anywhere in production (not in 002-009, not in pilot.sql). It is
--                        therefore deliberately absent from PoliciedTables. Do not "fix" that here: a
--                        fixture that policies a table production leaves open would make this suite
--                        stricter than Aurora and hide nothing real.

CREATE TABLE IF NOT EXISTS "roles" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Touched-column subset: teacher.ts only ever reads "name" off this table (:28, :98).
CREATE TABLE IF NOT EXISTS "schools" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "schoolId" TEXT,
    "passwordNeedsMigration" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

-- prisma/schema.prisma model TeacherInvite (@@map("teacher_invites")). "schoolId" is NULLABLE, which is
-- load-bearing for the RLS finding this suite records: a NULL-schoolId invite matches neither branch of
-- the tenant_isolation policy and is reachable ONLY through a bypass (systemContext) session.
CREATE TABLE IF NOT EXISTS "teacher_invites" (
    "id" TEXT PRIMARY KEY,
    "token" TEXT NOT NULL UNIQUE,
    "email" TEXT NOT NULL,
    "schoolId" TEXT,
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS "teacher_invites_token_idx" ON "teacher_invites" ("token");
CREATE INDEX IF NOT EXISTS "teacher_invites_email_idx" ON "teacher_invites" ("email");

-- Touched-column subset of model EvaluationGroup. "evaluatedUserId" is the column the production policy
-- scopes on, so it must be a real FK-shaped column here even though teacher.ts never selects it directly.
CREATE TABLE IF NOT EXISTS "evaluation_groups" (
    "id" TEXT PRIMARY KEY,
    "evaluatorName" TEXT NOT NULL DEFAULT '',
    "evaluatorEmail" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'teacher',
    "groupType" TEXT NOT NULL DEFAULT 'teacher',
    "evaluatedUserId" TEXT NOT NULL,
    "invitationToken" TEXT NOT NULL,
    "tokenExpiryDate" TIMESTAMPTZ NOT NULL,
    "isTokenUsed" BOOLEAN NOT NULL DEFAULT false,
    "isEvaluationCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "evaluation_groups_evaluatedUserId_idx" ON "evaluation_groups" ("evaluatedUserId");
