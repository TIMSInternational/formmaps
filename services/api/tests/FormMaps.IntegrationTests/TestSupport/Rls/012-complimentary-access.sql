-- RLS for complimentary access grants (audit 2026-10-09 E5). Idempotent. NOT APPLIED —
-- Federico applies it after prisma/migrations/20261010120000_complimentary_access.
-- A student's own session must read the grants that cover it: its own (userId) and its
-- school's (schoolId) — lib/studentEntitlement.ts and the .NET StudentAccessReader read them
-- under the caller's tenant context. Writes come only from Super Admin routes (bypass).

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
