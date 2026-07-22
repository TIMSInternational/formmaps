-- Schema-only harness for the iSAMS integration READS (FM-DOTNET-053 — GET /integrations/isams/status and
-- /integrations/isams/jobs). Hand-authored from prisma/schema.prisma + the init migration
-- (20260505140750_init/migration.sql) with only the columns the two reads touch. NO foreign keys / RLS policies
-- (schema-only). The `status` column uses the REAL native SyncJobStatus PG enum (verbatim from the migration) so
-- the reader's "status"::text passthrough is exercised against a genuine enum, not a text stand-in. The fixture
-- pins a NON-UTC server timezone so the reader's ISO-Z emission cannot depend on the container's local tz.

-- CreateEnum (verbatim from 20260505140750_init/migration.sql).
CREATE TYPE "SyncJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE "isams_configs" (
    "id"                   text PRIMARY KEY,
    "schoolId"             text NOT NULL UNIQUE,
    "endpoint"             text,
    "authType"            text,
    "credentialsEncrypted" text,
    "lastSyncAt"           timestamp(3),
    "lastSyncStatus"       text,
    "isActive"             boolean NOT NULL DEFAULT true,
    "createdBy"            text,
    "createdDate"          timestamp(3) NOT NULL DEFAULT now(),
    "updatedBy"            text,
    "updatedAt"            timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE "isams_sync_jobs" (
    "id"          text PRIMARY KEY,
    "schoolId"    text NOT NULL,
    "initiatedBy" text NOT NULL,
    "status"      "SyncJobStatus" NOT NULL DEFAULT 'pending',
    "details"     text,
    "startedAt"   timestamp(3),
    "finishedAt"  timestamp(3),
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdBy"   text,
    "createdDate" timestamp(3) NOT NULL DEFAULT now(),
    "updatedBy"   text,
    "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE INDEX "isams_configs_schoolId_idx" ON "isams_configs"("schoolId");
CREATE INDEX "isams_sync_jobs_schoolId_idx" ON "isams_sync_jobs"("schoolId");
