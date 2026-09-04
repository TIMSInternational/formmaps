-- services/api/tests/FormMaps.IntegrationTests/Telemetry/Data/telemetry-schema.sql
--
-- DDL for the formmaps#65 telemetry harness (the port of api/src/routes/telemetry.ts). Two tables, and
-- UNLIKE the moderation harness both of them ARE policied in production:
--
--   users            -> api/prisma/rls/005-sensitive.sql (self-or-same-school).
--   telemetry_events -> api/prisma/rls/003-fk-users.sql:408-431 (own row, or a row whose "userId"
--                       belongs to the session's non-empty school).
--
-- Both are vendored under TestSupport/Rls/ and applied by ProductionRlsPolicies.ApplyAsync, so the
-- policies these tests run against are byte-for-byte the ones Aurora enforces. Both are named in
-- TelemetryDatabaseFixture.PoliciedTables; naming a table production does not policy would fail the
-- fixture, which is the anti-vacuity guard doing its job.
--
-- WHY THAT MATTERS HERE. The telemetry policy is a real floor, but it is NOT the tenant boundary this
-- endpoint relies on: its school branch means the database will happily accept a row a caller writes
-- naming a CLASSMATE. What stops that is the endpoint passing context.Tenant!.UserId and nothing else
-- (legacy's `req.userId!`, telemetry.ts:47). TelemetryCrossTenantRlsTests pins both halves, including
-- the half where the database says yes.
--
-- Column sets are production's, from api/prisma/migrations/0_init/migration.sql:879-894 for
-- telemetry_events (including the FK to users and the three indexes) plus every column the vendored
-- policies reference on users. "updatedAt" is Prisma @updatedAt: NOT NULL with NO database default,
-- application-managed. Do not add DEFAULT now() -- the writer must bind it, and a default here would
-- hide a writer that forgot. "id" is likewise @default(uuid()), generated client-side, so it carries no
-- database default either.

CREATE TABLE "users" (
  "id" text PRIMARY KEY,
  "name" text,
  "email" text NOT NULL,
  "roleId" text NOT NULL DEFAULT '',
  "roleName" text NOT NULL DEFAULT 'student',
  "schoolId" text,
  "isActive" boolean NOT NULL DEFAULT true
);

-- model TelemetryEvent (api/prisma/schema.prisma:1165-1185). Every scalar column is present because the
-- writer's INSERT names some of them and the assertions read all of them -- a column left out of the
-- harness is a column no test can prove the writer got right.
CREATE TABLE "telemetry_events" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userIdHash" text NOT NULL DEFAULT '',
  "type" text NOT NULL,
  "timestamp" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "properties" jsonb,
  "expiresAt" timestamp(3) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdBy" text,
  "createdDate" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" text,
  "updatedAt" timestamp(3) NOT NULL
);

CREATE INDEX "telemetry_events_userId_idx" ON "telemetry_events"("userId");
CREATE INDEX "telemetry_events_type_idx" ON "telemetry_events"("type");
CREATE INDEX "telemetry_events_timestamp_idx" ON "telemetry_events"("timestamp");
