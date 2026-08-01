-- services/api/tests/FormMaps.IntegrationTests/Auth/Data/auth-schema.sql
-- Test-only fixture mirroring the LIVE Node/Prisma-owned tables this domain reads/writes
-- (users, roles, refresh_tokens, login_attempts, password_reset_tokens, user_settings, and a
-- touched-column subset of schools, per api/prisma/schema.prisma in formmaps-platform).
-- Production already has these tables via the live Node/Prisma migrations. Nothing in this task
-- or plan creates or alters a production table. Never run this outside Testcontainers.
--
-- "updatedAt" is intentionally NOT NULL with NO database default on every table below, matching
-- production exactly (verified against api/prisma/migrations/20260505140750_init/migration.sql --
-- every migrated table there has "updatedAt" TIMESTAMP(3) NOT NULL with no DEFAULT clause, while
-- "createdDate" DOES get DEFAULT CURRENT_TIMESTAMP). Prisma's @updatedAt is application-managed,
-- never a DB-level default. Do not add DEFAULT now() to "updatedAt" -- every writer must bind it
-- explicitly, so a missing bind fails loudly here the same way it would against production,
-- instead of being silently papered over by the fixture.

CREATE TABLE IF NOT EXISTS "roles" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

-- Touched-column subset only (invitationToken/invitationTokenExpiresAt/adminEmail/status/isActive
-- per the plan), plus id/name/createdDate/updatedAt as the minimum viable stub shape.
CREATE TABLE IF NOT EXISTS "schools" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "invitationToken" TEXT,
    "invitationTokenExpiresAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL UNIQUE,
    "password" TEXT,
    "roleId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,
    "schoolId" TEXT,
    "gradeLevel" INT,
    "dateOfBirth" TIMESTAMPTZ,
    "passwordNeedsMigration" BOOLEAN NOT NULL DEFAULT false,
    "onboardingToken" TEXT UNIQUE,
    "onboardingTokenExpiresAt" TIMESTAMPTZ,
    "stripeCustomerId" TEXT UNIQUE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyUnlockGrandfathered" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_schoolId_idx" ON "users" ("schoolId");
CREATE INDEX IF NOT EXISTS "users_roleId_idx" ON "users" ("roleId");

CREATE TABLE IF NOT EXISTS "user_settings" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "bookingNotifications" BOOLEAN NOT NULL DEFAULT true,
    "courseNotifications" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "language" TEXT NOT NULL DEFAULT 'en',
    "profileVisible" BOOLEAN NOT NULL DEFAULT true,
    "showEmail" BOOLEAN NOT NULL DEFAULT false,
    "showPhone" BOOLEAN NOT NULL DEFAULT false,
    "shareProgress" BOOLEAN NOT NULL DEFAULT true,
    "allowAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "calendarIntegrations" JSONB NOT NULL DEFAULT '{"google":{"connected":false},"outlook":{"connected":false}}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMPTZ,
    "revokedBy" TEXT,
    "createdByIp" TEXT,
    "revokedByIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx" ON "refresh_tokens" ("userId");
CREATE INDEX IF NOT EXISTS "refresh_tokens_token_idx" ON "refresh_tokens" ("token");

CREATE TABLE IF NOT EXISTS "login_attempts" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "failedCount" INT NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastIp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "login_attempts_email_idx" ON "login_attempts" ("email");

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdDate" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx" ON "password_reset_tokens" ("userId");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_token_idx" ON "password_reset_tokens" ("token");
