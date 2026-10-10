-- =============================================================================
-- complimentary-access.sql: audit 2026-10-09 E5 (decision D6), additive only.
--
-- Creates "complimentary_access_grants" (Super Admin free access for a student or a school,
-- N days, auto-expiring) with its RLS policy and app grant. Mirrors, verbatim:
--   formmaps-platform api/prisma/migrations/20261010120000_complimentary_access/migration.sql
--   formmaps-platform api/prisma/rls/012-complimentary-access.sql
-- Every statement is idempotent; re-running is a no-op.
--
-- Apply BEFORE deploying the Node and .NET code that reads the table. Until then both APIs
-- read a missing table as "no grant" (nobody loses access).
--
--   formmaps-sql-apply  sql_files=complimentary-access.sql  confirm=apply-to-production
--
-- formmaps_dotnet_svc does not exist in prod yet; when it is created, add this table to
-- dotnet-service-role.sql's SELECT tier (the .NET entitlement check only reads it).
-- =============================================================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "complimentary_access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "schoolId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "grantedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "complimentary_access_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "complimentary_access_grants_userId_expiresAt_idx" ON "complimentary_access_grants"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "complimentary_access_grants_schoolId_expiresAt_idx" ON "complimentary_access_grants"("schoolId", "expiresAt");
DO $$ BEGIN
  ALTER TABLE "complimentary_access_grants" ADD CONSTRAINT "complimentary_access_grants_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "complimentary_access_grants" ADD CONSTRAINT "complimentary_access_grants_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Exactly one target (Prisma cannot express this; the service enforces it too).
DO $$ BEGIN
  ALTER TABLE "complimentary_access_grants" ADD CONSTRAINT "complimentary_access_grants_one_target"
    CHECK (("userId" IS NULL) <> ("schoolId" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS (prisma/rls/012-complimentary-access.sql)
ALTER TABLE "complimentary_access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complimentary_access_grants" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "complimentary_access_grants";
CREATE POLICY tenant_isolation ON "complimentary_access_grants"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- The app role reads and writes through RLS. Explicit, in case default privileges do not
-- cover tables created by the applying role.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'formmaps_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."complimentary_access_grants" TO formmaps_app;
  END IF;
END $$;
