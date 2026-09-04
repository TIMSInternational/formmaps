-- services/api/tests/FormMaps.IntegrationTests/Moderation/Data/moderation-schema.sql
--
-- DDL for the formmaps#63 moderation harness. Six tables, and WHICH of them production policies is the
-- whole point of this fixture:
--
--   users, conversations, messages -> ENABLE + FORCE ROW LEVEL SECURITY in
--       api/prisma/rls/005-sensitive.sql, vendored at TestSupport/Rls/005-sensitive.sql and applied by
--       ProductionRlsPolicies.ApplyAsync. Named in ModerationDatabaseFixture.PoliciedTables.
--
--   reports, user_blocks, audit_logs -> UNPOLICIED in production, deliberately. All three are in
--       formmaps#77's "group 2", split off from 007-self-scoped.sql because they still need an owner
--       decision (see that file's header: "audit_logs, user_blocks, notification_outbox, schools, roles,
--       course_recommendation_caches ... deliberately NOT in this file"). audit_logs is also on
--       005-sensitive.sql's explicitly-unpolicied list.
--
-- That asymmetry is not incidental to this domain, it IS the security argument: for reports and
-- user_blocks the database provides NO tenant floor at all, so the endpoint predicates
-- (canModerateUser / canReportTarget / the reporter-school scope on the queue) are the entire boundary.
-- Which is why ModerationCrossTenantRlsTests sabotages those predicates: a test that passed on RLS
-- visibility here would be passing on a backstop that does not exist.
--
-- Column sets are the production ones for the columns these queries touch, plus every column the
-- vendored policies reference. "updatedAt" is Prisma @updatedAt on all three write tables: NOT NULL with
-- NO database default, application-managed. Do not add DEFAULT now() -- every writer must bind it, and a
-- default here would hide a writer that forgot.

CREATE TABLE "users" (
  "id" text PRIMARY KEY,
  "name" text,
  "email" text NOT NULL,
  "roleId" text NOT NULL DEFAULT '',
  "roleName" text NOT NULL DEFAULT 'student',
  "schoolId" text,
  "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "conversations" (
  "id" text PRIMARY KEY,
  "participantAId" text NOT NULL,
  "participantBId" text NOT NULL,
  "lastMessageAt" timestamp,
  "lastMessagePreview" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL,
  UNIQUE ("participantAId", "participantBId")
);

CREATE TABLE "messages" (
  "id" text PRIMARY KEY,
  "conversationId" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "senderId" text NOT NULL,
  "content" text NOT NULL,
  "readAt" timestamp,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL
);

-- model Report (api/prisma/schema.prisma). Every scalar column is here because GET /reports serialises
-- the Prisma row verbatim, so a column missing from the fixture is a column missing from the assertion.
CREATE TABLE "reports" (
  "id" text PRIMARY KEY,
  "reporterId" text NOT NULL,
  "targetType" text NOT NULL,
  "targetId" text NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "reviewedBy" text,
  "reviewedAt" timestamp,
  "resolution" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdDate" timestamp NOT NULL DEFAULT now(),
  "updatedBy" text,
  "updatedAt" timestamp NOT NULL
);

-- model UserBlock. The @@unique([blockerId, blockedId]) is load-bearing: blockUser is a Prisma upsert on
-- that compound key, ported here as INSERT ... ON CONFLICT, which needs the real unique constraint.
CREATE TABLE "user_blocks" (
  "id" text PRIMARY KEY,
  "blockerId" text NOT NULL,
  "blockedId" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdDate" timestamp NOT NULL DEFAULT now(),
  "updatedBy" text,
  "updatedAt" timestamp NOT NULL,
  UNIQUE ("blockerId", "blockedId")
);

-- model AuditLog -- the LEGACY trail both backends write while both are live (see
-- dotnet-service-role.sql section 4.6). Unpolicied, so the caller's Identity session may INSERT here.
CREATE TABLE "audit_logs" (
  "id" text PRIMARY KEY,
  "actorId" text NOT NULL,
  "actorEmail" text NOT NULL,
  "action" text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId" text,
  "details" jsonb,
  "ipAddress" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdDate" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL
);
