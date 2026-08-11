-- infra/aws/sql/audit-events-schema.sql
-- New, .NET-owned, cross-tenant audit trail. NOT legacy Node's "audit_logs" table
-- (formmaps-platform/api/prisma/schema.prisma) -- that table is untouched, stays Node-owned
-- until Domain 11 retires Node. See spec docs/superpowers/specs/2026-07-31-audit-events-design.md
-- for full rationale (RLS-bypass-only access, built-in immutability, PII-free schema).
-- Idempotent: safe to run multiple times.
--
-- The GRANT for formmaps_dotnet_svc lives in infra/aws/sql/dotnet-service-role.sql, not here,
-- so that file stays the single place any role's privileges are described.

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "schoolId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB
);

CREATE INDEX IF NOT EXISTS "audit_events_eventType_idx" ON "audit_events" ("eventType");
CREATE INDEX IF NOT EXISTS "audit_events_actorUserId_idx" ON "audit_events" ("actorUserId");
CREATE INDEX IF NOT EXISTS "audit_events_subject_idx" ON "audit_events" ("subjectType", "subjectId");
-- Composite, not ("occurredAt" DESC) alone: IAuditEventReader paginates by keyset on
-- ("occurredAt", "id") DESC (see the spec's read model), so the index has to carry the tiebreaker
-- column or the ORDER BY still needs a sort on every page.
CREATE INDEX IF NOT EXISTS "audit_events_occurredAt_id_idx" ON "audit_events" ("occurredAt" DESC, "id" DESC);

-- ---------------------------------------------------------------------------
-- RLS: bypass-only. An ordinary tenant-scoped (Identity-mode) RLS session gets
-- ZERO rows and cannot write. THE CRITERION IS THE GUC AND NOTHING ELSE: any session
-- with app.bypass_rls = 'on' passes both USING and WITH CHECK, whatever code opened
-- it. Stronger than legacy audit_logs (no RLS at all, app-layer-gate-only) by design
-- -- see spec's "Read-access model".
--
-- WHO ACTUALLY GETS THAT GUC is wider than "IAuditEventWriter and the audit-read
-- endpoint", and the difference matters when reading this file as a security control.
-- TenantGucPlanResolver.Resolve returns Bypass() for
--     context.IsSystem || context.Actor?.IsSuperAdmin == true
-- so EVERY authenticated super-admin request gets bypass mode, through ANY repository,
-- not just the two audit classes. No repository queries audit_events today, but the
-- database would not stop one that did: a super-admin-scoped session can SELECT from
-- and INSERT into this table exactly as System() can.
--
-- That is a documentation point, not a hole. The privilege ceiling is unchanged --
-- formmaps_dotnet_svc holds SELECT + INSERT and nothing more (dotnet-service-role.sql),
-- and the immutability trigger below binds a bypassing super-admin session identically
-- to every other role. The property RLS gives us here is "no TENANT-scoped session can
-- see or write audit rows"; it is not "only the audit classes can". The read
-- AUTHORIZATION gate is the endpoint's super-admin check (see AuditEndpoints), and the
-- write path is a code convention (IAuditEventWriter), not a DB-enforced one.
--
-- Identity mode never sets app.bypass_rls at all (see RlsSessionCommandBuilder), so
-- current_setting(..., true) returns NULL there and the predicate is NULL -> denied.
-- Deny mode sets it to 'off' explicitly. Same bypass clause as every other policy in
-- api/prisma/rls/*.sql.
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_events_bypass_only" ON "audit_events";
CREATE POLICY "audit_events_bypass_only" ON "audit_events"
    USING (current_setting('app.bypass_rls', true) = 'on')
    WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- ---------------------------------------------------------------------------
-- Immutability (SOC2 CC7.2 / ISO A.8.15): rows may be INSERTed, never
-- UPDATEd/DELETEd/TRUNCATEd, by ANY role including the table owner. Modeled
-- structurally after tims-ats/TimsSuite's AuditImmutability CB-1 pattern
-- (different repo/schema, referenced as a template only, not imported).
--
-- The trigger is what actually enforces this: it fires for every role, owner and
-- superuser included, and BEFORE ... FOR EACH STATEMENT means it fires even when the
-- statement would have matched zero rows. ENABLE ALWAYS is the second half and is not
-- decoration -- a plain ENABLEd trigger silently no-ops under
-- session_replication_role = 'replica', which is exactly what a logical-replication
-- applier session runs as.
--
-- The REVOKE below is a guard, not the control, and the distinction matters: PUBLIC
-- holds no privileges on a freshly created table anyway, so on a clean apply this
-- statement changes nothing. It exists so that a future blanket "GRANT ALL ... TO
-- PUBLIC" somewhere else cannot quietly hand out the mutating verbs. What actually
-- keeps the application credential from mutating rows is (a) the trigger above and
-- (b) dotnet-service-role.sql granting formmaps_dotnet_svc SELECT + INSERT and
-- deliberately nothing else.
--
-- Stated limitation, not implied: a superuser with direct DB access can ALTER TABLE
-- ... DISABLE TRIGGER and then mutate. No in-database control can prevent that. This
-- closes the ordinary vectors (compromised app credential, an accidental UPDATE/DELETE
-- from a future code path, and the session_replication_role='replica' bypass).
-- See Task 4's tests, which prove each half separately.
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_events" FROM PUBLIC;

CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events rows are immutable (SOC2 CC7.2 / ISO A.8.15): % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable ON "audit_events";
CREATE TRIGGER audit_events_immutable
    BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
ALTER TABLE "audit_events" ENABLE ALWAYS TRIGGER audit_events_immutable;
