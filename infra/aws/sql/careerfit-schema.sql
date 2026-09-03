-- infra/aws/sql/careerfit-schema.sql
-- FM-CF-002: tenant-scoped, RLS-native persistence for CareerFit runs. .NET-owned (the
-- CareerFit bounded context under services/api, docs/careerfit/careerfit.manifest.json);
-- legacy Node never reads or writes these tables.
--
-- WHY THIS FILE EXISTS INSTEAD OF THE TIMS DDL. The reference schema TIMS delivered with
-- the engine keys results on a bare student_id VARCHAR(120) and has no school column at
-- all. The platform's RLS model (formmaps-platform/api/prisma/rls/*.sql, vendored under
-- services/api/tests/FormMaps.IntegrationTests/TestSupport/Rls/) scopes every row of
-- student data by the OWNER (app.current_user_id) and by the owner's SCHOOL
-- (app.current_school_id); a table without either is invisible to that model and would
-- ship exactly the bug class formmaps#121/#125 are about. The manifest guardrail is
-- therefore "no CareerFit table without a school scope; inherit RLS and tenant context
-- from services/api", and this file is that guardrail made concrete.
--
-- What it creates:
--   * careerfit_runs            one row per evaluation of one student: who, which tenant,
--                               which rule-set version, the exact engine inputs.
--   * careerfit_family_results  one row per (run, family): every evaluate_owner scalar as a
--                               typed column, plus the audit trail as jsonb.
-- What it deliberately does NOT do: no UPDATE path (a run is immutable; a re-evaluation is a
-- NEW run -- see dotnet-service-role.sql section 4.7), no per-career / per-subfamily rows
-- (V1 scores families only; FM-CF-009's resolver decides when that changes), no
-- presentation columns (FM-CF-011 owns the payload), and no rank stored as a percentage --
-- CareerFitAbsolute is a 0-100 score and careerfit_relative is a rank-derived spread,
-- neither is a probability (manifest guardrail 3).
--
-- Applied by .github/workflows/formmaps-sql-apply.yml (one explicitly named file per
-- dispatch, via infra/aws/sql/apply.sh under --single-transaction). ORDER: this file
-- creates tables that dotnet-service-role.sql GRANTs on, so on a fresh database it goes
-- BEFORE dotnet-service-role.sql or that file's GRANT aborts with 42P01 -- the same rule as
-- billing-shadow-tables.sql and audit-events-schema.sql. See
-- docs/migration/sql-apply-runbook.md, "Canonical first production sequence".
--
-- Idempotent: safe to run multiple times. CREATE TABLE / CREATE INDEX are IF NOT EXISTS; the
-- policies are DROP IF EXISTS + CREATE, the idiom every production policy file and
-- audit-events-schema.sql use, so a re-apply always leaves the predicate the file declares
-- (a DO/IF NOT EXISTS guard would silently keep a STALE predicate on re-apply, which for a
-- security control is the wrong failure mode). apply.sh's --single-transaction makes the
-- drop-and-recreate atomic, so there is no unprotected window.
--
-- The GRANTs for formmaps_dotnet_svc live in infra/aws/sql/dotnet-service-role.sql, not
-- here, so that file stays the single place any role's privileges are described.
--
-- The integration harness (services/api/tests/FormMaps.IntegrationTests/CareerFit/) embeds
-- THIS file by reference and applies it verbatim to a Testcontainers Postgres, then runs
-- the RLS assertions as a NOSUPERUSER NOBYPASSRLS login. A hand-maintained copy would let
-- production drift out from under a green suite (formmaps#125), so do not fork it.

-- ---------------------------------------------------------------------------
-- careerfit_runs
--
-- Column types follow the platform, not the TIMS DDL: users.id and schools.id are TEXT
-- (cuid), so the foreign keys are TEXT -- a uuid column cannot REFERENCE a text one
-- (42804). The run's own id is a server-generated uuid because nothing else needs to mint
-- it; gen_random_uuid() is core in Postgres 13+ (no pgcrypto).
--
-- "schoolId" is NULLABLE because non-school users exist (individual students, coaches,
-- parents -- see 003-fk-users.sql's header), and it is the row's OWN tenant snapshot,
-- written by the run writer from the request's tenant scope at evaluation time. The policy
-- scopes on it directly (the idiom 005-sensitive.sql uses for "users" itself) rather than
-- joining users on every read: the two agree by construction when the row is written, and
-- the direct column is what makes the guardrail checkable from the schema alone. A NULL
-- "schoolId" row is reachable only by its owner and by bypass -- exactly the platform's
-- treatment of no-school users, whose rows have no school branch to match.
--
-- "discGraph" records WHICH of the three TIMS DISC graphs fed the engine (1 = work
-- adaptation, 2 = under pressure, 3 = self image -- PcaNormalization.cs); the rule set's
-- open question on this is FM-CF-005's to close, so it is nullable until then and bounded
-- so a wrong integer cannot be stored as if it meant something.
--
-- "inputs" is the CareerFitAssessment the formulas consumed, verbatim, so a stored result
-- can be re-derived under any later rules version; "inputQuality" is the adapter's
-- coverage/quality record for those inputs (which instruments were present, which graph
-- was chosen, which competencies were missing) -- FM-CF-005 defines its shape, this file
-- only guarantees it is present.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "careerfit_runs" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"        TEXT NOT NULL REFERENCES "users" ("id"),
    "schoolId"      TEXT NULL REFERENCES "schools" ("id"),
    "rulesVersion"  TEXT NOT NULL,
    "discGraph"     SMALLINT NULL,
    "inputs"        JSONB NOT NULL,
    "inputQuality"  JSONB NOT NULL,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "careerfit_runs_discGraph_check"
        CHECK ("discGraph" IS NULL OR "discGraph" BETWEEN 1 AND 3),
    CONSTRAINT "careerfit_runs_rulesVersion_check"
        CHECK (length("rulesVersion") > 0)
);

-- The read path is "this student's runs, newest first" (the latest run is the product; the
-- history is the audit), so the composite carries the ordering column.
CREATE INDEX IF NOT EXISTS "careerfit_runs_userId_createdAt_idx"
    ON "careerfit_runs" ("userId", "createdAt" DESC);
-- School-level reads (counselor caseload, school analytics, the FM-CF-013 shadow report).
CREATE INDEX IF NOT EXISTS "careerfit_runs_schoolId_idx"
    ON "careerfit_runs" ("schoolId");

-- ---------------------------------------------------------------------------
-- careerfit_family_results
--
-- One row per (run, family). The scalar columns are evaluate_owner's return keys
-- (docs/careerfit/sources/formmaps_engine_reference.py, the normative engine) under their
-- reference names, so a row compares field-for-field against the Python output and against
-- CareerFitFormulas.EvaluateOwner's OwnerEvaluation; the platform-side columns (id, runId,
-- familyId) keep the platform's camelCase. The enum-valued columns are constrained to the
-- reference string values CareerFitEnums.ToReferenceValue() emits -- a row that cannot be
-- parsed back is a row that should not have been written.
--
-- rank_position / careerfit_relative are NULL until assign_relative_fit (F21) has ranked the
-- family against its alternatives; a single-family write is legal but unranked.
--
-- "audit" carries the non-scalar half of evaluate_owner: audit_inputs (per-route PCA
-- scores, MIL/personality/360 evidence), convergence_detail (per-instrument supports and
-- the strong count), critical_gaps and mil_relative_strengths. FM-CF-010 owns the exact
-- shape; this file guarantees it travels with the scores (spec section 21).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "careerfit_family_results" (
    "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "runId"                     UUID NOT NULL REFERENCES "careerfit_runs" ("id") ON DELETE CASCADE,
    "familyId"                  SMALLINT NOT NULL,
    "pca_route_fit"             DOUBLE PRECISION NOT NULL,
    "pca_winning_route"         TEXT NOT NULL,
    "competency_fit"            DOUBLE PRECISION NOT NULL,
    "competency_gate"           TEXT NOT NULL,
    "pca_index"                 DOUBLE PRECISION NOT NULL,
    "mil_fit"                   DOUBLE PRECISION NOT NULL,
    "mil_gate"                  TEXT NOT NULL,
    "personality_fit"           DOUBLE PRECISION NOT NULL,
    "personality_winning_route" TEXT NOT NULL,
    "careerfit360"              DOUBLE PRECISION NOT NULL,
    "careerfit360_consensus"    DOUBLE PRECISION NULL,
    "careerfit360_confidence"   TEXT NOT NULL,
    "final_gate"                TEXT NOT NULL,
    "convergence_level"         TEXT NOT NULL,
    "careerfit_absolute"        DOUBLE PRECISION NOT NULL,
    "careerfit_relative"        DOUBLE PRECISION NULL,
    "rank_position"             SMALLINT NULL,
    "audit"                     JSONB NOT NULL,
    CONSTRAINT "careerfit_family_results_runId_familyId_key" UNIQUE ("runId", "familyId"),
    CONSTRAINT "careerfit_family_results_competency_gate_check"
        CHECK ("competency_gate" IN ('SATISFIED', 'CONDITIONED', 'CRITICAL')),
    CONSTRAINT "careerfit_family_results_mil_gate_check"
        CHECK ("mil_gate" IN ('SATISFIED', 'CONDITIONED', 'CRITICAL')),
    CONSTRAINT "careerfit_family_results_final_gate_check"
        CHECK ("final_gate" IN ('SATISFIED', 'CONDITIONED', 'CRITICAL')),
    CONSTRAINT "careerfit_family_results_careerfit360_confidence_check"
        CHECK ("careerfit360_confidence" IN ('HIGH', 'MEDIUM', 'LOW', 'NOT_DETERMINABLE')),
    CONSTRAINT "careerfit_family_results_convergence_level_check"
        CHECK ("convergence_level" IN ('VERY_HIGH', 'SOLID', 'PARTIAL', 'DIVERGENT')),
    CONSTRAINT "careerfit_family_results_rank_position_check"
        CHECK ("rank_position" IS NULL OR "rank_position" >= 1)
);

-- ---------------------------------------------------------------------------
-- RLS. Both tables ENABLE + FORCE, one tenant_isolation policy each, the same shape as
-- every production policy file.
--
-- careerfit_runs is the platform's FK-to-user shape (003-fk-users.sql) with the school
-- branch on the row's own "schoolId" (005-sensitive.sql's idiom for "users"). Predicates,
-- copied rather than paraphrased so they behave identically:
--
--   bypass   current_setting('app.bypass_rls', true) = 'on'
--            RequestContext.System() and every super-admin request (TenantGucPlanResolver
--            returns Bypass for context.IsSystem || Actor.IsSuperAdmin). Identity mode never
--            sets the GUC, so current_setting(..., true) is NULL there and the branch is
--            NULL -> not admitted; Deny mode sets it to 'off' explicitly.
--   self     "userId" = app.current_user_id, guarded against the empty string so a session
--            with no user cannot match a row whose owner is ''.
--   school   "schoolId" = app.current_school_id, guarded the same way so a no-school caller
--            ('' GUC) cannot match, and NULL on the row never matches anything.
--
-- WHAT THE SCHOOL BRANCH ADMITS, stated plainly because it is the platform's design and
-- not this file's choice: EVERY caller whose tenant is the row's school -- the assigned
-- counselor, an unassigned counselor, the school admin, a classmate. 003-fk-users.sql's
-- header says it in one line: "per-user authz stays in app code". No production policy
-- branches on counselor_student_assignments, and this one does not either, so that a
-- counselor's access to a CareerFit run is decided by exactly the same rule as their access
-- to the student's PCA session or test scores. The per-user gate (assigned counselor only,
-- own child only, and so on) is the endpoint's job -- FM-CF-012 -- and the harness has a
-- test that names this so it cannot be mistaken for a hole later
-- (CareerFitRlsTests.Same_school_caller_is_admitted_by_the_policy_so_the_endpoint_gate_is_not_optional).
--
-- careerfit_family_results has no owner or school column of its own; it inherits the run's
-- isolation through nested RLS (004-fk-parent.sql's idiom): the EXISTS sub-select on
-- careerfit_runs is itself filtered by careerfit_runs' policy, so a child row is visible
-- exactly when its parent is. bypass is still spelled out explicitly, as 004 does.
-- ---------------------------------------------------------------------------
ALTER TABLE "careerfit_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "careerfit_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "careerfit_runs";
CREATE POLICY tenant_isolation ON "careerfit_runs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR ("userId" = current_setting('app.current_user_id', true) AND current_setting('app.current_user_id', true) <> '')
    OR ("schoolId" = current_setting('app.current_school_id', true) AND current_setting('app.current_school_id', true) <> '')
  );

ALTER TABLE "careerfit_family_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "careerfit_family_results" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "careerfit_family_results";
CREATE POLICY tenant_isolation ON "careerfit_family_results"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "careerfit_runs" p WHERE p.id = "careerfit_family_results"."runId")
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (SELECT 1 FROM "careerfit_runs" p WHERE p.id = "careerfit_family_results"."runId")
  );
