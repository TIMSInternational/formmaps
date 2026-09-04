-- infra/aws/sql/careerfit-shadow-tables.sql
-- FM-CF-013: the shadow-comparison table. ONE row per (student, comparison run): the .NET engine's
-- family ranking, the legacy /careers/score result projected onto the same fourteen families, and the
-- delta between them with every disagreement classified BY CAUSE.
--
-- WHY A SEPARATE FILE AND NOT A SECTION OF careerfit-schema.sql. careerfit_runs /
-- careerfit_family_results are the product's own evidence and outlive the migration; this table is
-- MEASUREMENT, it exists only for the shadow period, and it is retired at cutover (FM-CF-015) the way
-- billing-shadow-tables.sql's trio is. Keeping it in its own file means the retirement is one DROP of
-- one file's objects and the immutable-evidence file is never touched to do it. Same precedent, same
-- apply-order rule: it is a table-creating file, so it goes BEFORE dotnet-service-role.sql, whose
-- section 4.8 GRANTs on it. It also depends on careerfit_runs existing (the "runId" foreign key), so
-- it goes AFTER careerfit-schema.sql. See docs/migration/sql-apply-runbook.md.
--
-- WHAT THE SHADOW JOB DOES AND DOES NOT DO. It never affects the response a user sees: the legacy
-- POST /api/v1/careers/score answer is served by Node and is not touched, read or delayed by any of
-- this. The job reads the legacy answer where the platform already cached it
-- (user_career_profiles."careerMatches"), scores the same student through the .NET engine, compares,
-- and appends one row here. Nothing in apps/web reads this table; no endpoint serves it. It is input
-- to tools/careerfit/shadow_report.py and to nothing else.
--
-- WHY IT IS TENANT-SCOPED AND RLS-NATIVE, unlike the billing shadow trio. Those tables hold Stripe
-- bookkeeping and are .NET-internal, so they carry no policy. A row here holds a NAMED STUDENT's two
-- career rankings; it is student data by any reading, and the manifest guardrail is explicit — "no
-- CareerFit table without a school scope; inherit RLS and tenant context from services/api". The
-- policy below is careerfit_runs' predicate, copied rather than paraphrased so the two behave
-- identically (self OR the row's own school OR bypass).
--
-- APPEND-ONLY, like a run. A comparison is the evidence that THIS engine version, THIS projection and
-- THIS legacy snapshot disagreed in THIS way; re-measuring is a new row, ordered after the old one by
-- "createdAt". The service role therefore gets SELECT + INSERT only (dotnet-service-role.sql section
-- 4.8), and DbRoleGrantsTests pins that verb set the same way it pins the run pair's.
--
-- Idempotent: safe to run multiple times. CREATE TABLE / CREATE INDEX are IF NOT EXISTS; the policy is
-- DROP IF EXISTS + CREATE, the idiom careerfit-schema.sql and every production policy file use, so a
-- re-apply always leaves the predicate this file declares rather than silently keeping a stale one.
-- apply.sh's --single-transaction makes the drop-and-recreate atomic.

-- ---------------------------------------------------------------------------
-- careerfit_shadow_comparisons
--
-- "userId" / "schoolId" are careerfit_runs' columns with careerfit_runs' semantics, including the
-- erasure asymmetry decided in formmaps#78: the user cascades (a comparison is derived data ABOUT
-- that student -- their two rankings are inside the jsonb), the school does not (a school is not a
-- data subject).
--
-- "runId" is NULLABLE and ON DELETE CASCADE. Nullable because a pair can be classified as NOT
-- COMPARABLE before any run exists -- LEGACY_LOCKED and LEGACY_ABSENT are decided from the legacy side
-- alone and the job records them rather than silently skipping the student, which is the difference
-- between "we measured 40 students, 12 had no legacy answer" and "we measured 28 students". CASCADE
-- because a comparison that outlived the run it measures would be unreadable evidence.
--
-- "comparatorVersion" / "projectionVersion" are on the ROW, not in a config table, because they are
-- what makes a row re-interpretable later: the comparator's classification rules and the legacy
-- cluster -> family projection are both expected to change during the shadow period (the projection is
-- INCOMPLETE today -- see services/api/src/FormMaps.Application/CareerFit/Data/careerfit-shadow-projection.v0.json), and a report that
-- mixed two projections without saying so would be a wrong number, not a stale one.
--
-- "spearmanRho" / "topThreeOverlap" are the two metrics the manifest names, precomputed per pair so the
-- report generator aggregates rather than re-derives (one implementation of the metric, in
-- CareerFitShadowComparator, held by unit tests). Both are NULL when "comparable" is false -- there is
-- no correlation between a ranking and nothing.
--
-- RAW INDEX DELTAS ARE DELIBERATELY NOT A COLUMN. 360 is not seeded (FM-CF-006) and personality may be
-- absent, so up to 45% of the model's weight can be constant across every family; CareerFitAbsolute is
-- uniformly deflated and its distance from a legacy 0-100 "totalScore" measures the missing
-- instruments, not the port. The ORDERING is what is comparable, which is why the metrics here are
-- rank correlation and top-3 overlap and why no delta-of-scores column exists to be misread.
--
-- "primaryCause" is the pair-level verdict; "disagreements" carries the per-family classification.
-- The CHECK list is CareerFitShadowCause's persisted spelling (ToPersistedValue) -- a row that cannot
-- be parsed back is a row that should not have been written.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "careerfit_shadow_comparisons" (
    "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId"             TEXT NOT NULL,
    "schoolId"           TEXT NULL REFERENCES "schools" ("id"),
    "runId"              UUID NULL REFERENCES "careerfit_runs" ("id") ON DELETE CASCADE,
    "rulesVersion"       TEXT NOT NULL,
    "discGraph"          SMALLINT NULL,
    "comparatorVersion"  TEXT NOT NULL,
    "projectionVersion"  TEXT NOT NULL,
    "comparable"         BOOLEAN NOT NULL,
    "primaryCause"       TEXT NOT NULL,
    "spearmanRho"        DOUBLE PRECISION NULL,
    "topThreeOverlap"    SMALLINT NULL,
    "engineRanking"      JSONB NOT NULL,
    "legacyRanking"      JSONB NOT NULL,
    "disagreements"      JSONB NOT NULL,
    "legacyObservedAt"   TIMESTAMPTZ NULL,
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "careerfit_shadow_comparisons_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
    CONSTRAINT "careerfit_shadow_comparisons_discGraph_check"
        CHECK ("discGraph" IS NULL OR "discGraph" BETWEEN 1 AND 3),
    CONSTRAINT "careerfit_shadow_comparisons_rulesVersion_check"
        CHECK (length("rulesVersion") > 0),
    CONSTRAINT "careerfit_shadow_comparisons_primaryCause_check"
        CHECK ("primaryCause" IN (
            'AGREEMENT', 'LEGACY_ABSENT', 'LEGACY_LOCKED', 'DISC_GRAPH_MISMATCH',
            'ENGINE_NOT_SCORABLE', 'TAXONOMY_UNMAPPED', 'TAXONOMY_NO_LEGACY_EVIDENCE',
            'INPUT_COVERAGE', 'NAME_JOIN', 'TIE', 'UNEXPLAINED')),
    CONSTRAINT "careerfit_shadow_comparisons_spearman_check"
        CHECK ("spearmanRho" IS NULL OR ("spearmanRho" >= -1.0 AND "spearmanRho" <= 1.0)),
    CONSTRAINT "careerfit_shadow_comparisons_topThree_check"
        CHECK ("topThreeOverlap" IS NULL OR "topThreeOverlap" BETWEEN 0 AND 3),
    -- An incomparable pair has no metric, and a comparable one always has both. Stated as a constraint
    -- rather than left to the writer because the report's denominators are computed from "comparable":
    -- a comparable row with a NULL rho would silently shrink the denominator of the mean.
    CONSTRAINT "careerfit_shadow_comparisons_metrics_match_comparable_check"
        CHECK (
            ("comparable" AND "spearmanRho" IS NOT NULL AND "topThreeOverlap" IS NOT NULL)
            OR (NOT "comparable" AND "spearmanRho" IS NULL AND "topThreeOverlap" IS NULL))
);

-- The report reads the whole shadow cohort in "createdAt" order; the per-student read ("did we already
-- compare this student under this comparator?") is by user, newest first, exactly careerfit_runs' shape.
CREATE INDEX IF NOT EXISTS "careerfit_shadow_comparisons_userId_createdAt_idx"
    ON "careerfit_shadow_comparisons" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "careerfit_shadow_comparisons_createdAt_idx"
    ON "careerfit_shadow_comparisons" ("createdAt");
-- School-level reads: the shadow cohort is recruited a school at a time.
CREATE INDEX IF NOT EXISTS "careerfit_shadow_comparisons_schoolId_idx"
    ON "careerfit_shadow_comparisons" ("schoolId");

-- ---------------------------------------------------------------------------
-- RLS. ENABLE + FORCE, one tenant_isolation policy, the predicate copied verbatim from
-- careerfit_runs (infra/aws/sql/careerfit-schema.sql) so the two cannot drift:
--
--   bypass   current_setting('app.bypass_rls', true) = 'on'
--   self     "userId" = app.current_user_id, guarded against the empty string
--   school   "schoolId" = app.current_school_id, guarded the same way
--
-- What the school branch admits is the platform's design and not this file's choice: EVERY caller
-- whose tenant is the row's school. There is no endpoint over this table, so there is no per-user
-- endpoint gate behind it either -- which is the reason the table carries no free-text student
-- identifier beyond "userId" and no explanatory prose: a shadow row is a pair of rankings and a cause
-- code, and everything a reader needs to interpret it is the run it points at.
-- ---------------------------------------------------------------------------
ALTER TABLE "careerfit_shadow_comparisons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "careerfit_shadow_comparisons" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "careerfit_shadow_comparisons";
CREATE POLICY tenant_isolation ON "careerfit_shadow_comparisons"
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
