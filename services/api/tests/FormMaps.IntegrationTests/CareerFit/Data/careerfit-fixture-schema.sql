-- Harness DDL for the CareerFit persistence slice (FM-CF-002). PLATFORM tables only, hand-written from
-- schema.prisma with just the columns the policies and the foreign keys touch; the two CareerFit tables
-- are NOT here. They come from the REAL infra/aws/sql/careerfit-schema.sql, embedded by reference (see
-- FormMaps.IntegrationTests.csproj) and applied by CareerFitDatabaseFixture.AdditionalDdl on top of this
-- file -- the same rule the Audit fixture follows for audit_events. A transcription of the CareerFit DDL
-- here would let production drift out from under a green suite (formmaps#125), so do not add one.
--
-- Why each table is here:
--   users                          careerfit_runs."userId" REFERENCES it ON DELETE CASCADE (GDPR erasure,
--                                  formmaps#78 -- see the production file's header), so the erasure tests
--                                  delete real rows here; production policies it (005-sensitive.sql: self
--                                  OR same school), and the harness applies that.
--   schools                        careerfit_runs."schoolId" REFERENCES it. Unpolicied in production
--                                  (007-self-scoped.sql's header lists it under "still needs an owner
--                                  decision"), so it is NOT in PoliciedTables.
--   counselor_student_assignments  the counselor cases seed a row here so the tests state, on real data,
--                                  that the platform policy admits a same-school counselor WHETHER OR NOT
--                                  an assignment exists (003-fk-users.sql keys it on studentId; the
--                                  counselorId column appears in no policy). Policied by 003; applied here.
--   student_parent_links           the parent case: a school-less parent is admitted to NOTHING here --
--                                  the CareerFit policy has no parent branch, matching every other
--                                  student-data table (009-parent-links.sql admits parents to the LINK row
--                                  only). Policied by 003 + 009; applied here so the seed is realistic.

CREATE TABLE "schools" (
    "id"        text PRIMARY KEY,
    "name"      text NOT NULL DEFAULT '',
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "users" (
    "id"          text PRIMARY KEY,
    "name"        text NOT NULL DEFAULT '',
    "email"       text NOT NULL,
    "schoolId"    text REFERENCES "schools" ("id"),
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_parent_links" (
    "id"           text PRIMARY KEY,
    "studentId"    text NOT NULL,
    "parentEmail"  text NOT NULL,
    "parentUserId" text,
    "isActive"     boolean NOT NULL DEFAULT true
);

-- ------------------------------------------------------------------------------------------------
-- FM-CF-010 (P1–P3): the three SOURCE tables CareerFitInputReader reads, hand-written from
-- schema.prisma with the columns the reader's queries and the seeds touch, the shapes the real
-- writers persist (pca_results: TIMS's discResult / competences blobs, one row per user;
-- lia_assessment_sessions: LiaSessionWriter's percentiles on a completed session, status a native
-- enum; personality_assessment_sessions: PersonalitySessionWriter's dimension_scores + resolved_type,
-- status plain text). RLS: pca_results is policied by the vendored 007-self-scoped.sql (self OR the
-- owner's school via a users sub-select) and the base fixture applies that automatically because the
-- table now exists here — it is named in PoliciedTables so its absence would fail the fixture. The two
-- session tables appear in NO vendored policy file, so they are left unpolicied exactly as the vendored
-- set leaves them (formmaps#77 PENDING) — under RLS a cross-school caller really can read their rows, and
-- CareerFitEvaluatorDatabaseTests asserts that on this seed. What stops a cross-school read of a student is
-- therefore NOT those tables: it is CareerFitInputReader's explicit gate against the policied "users" row,
-- which runs before any instrument read, plus careerfit_runs' own policy on the write.
-- ------------------------------------------------------------------------------------------------

CREATE TYPE "LiaSessionStatus" AS ENUM ('not_started', 'practice', 'in_progress', 'completed', 'abandoned');

CREATE TABLE "pca_results" (
    "id"           text PRIMARY KEY,
    "userId"       text NOT NULL,
    "discResult"   jsonb,
    "competences"  jsonb,
    "isActive"     boolean NOT NULL DEFAULT true,
    CONSTRAINT "pca_results_userId_key" UNIQUE ("userId")
);

CREATE TABLE "lia_assessment_sessions" (
    "id"            text PRIMARY KEY,
    "user_id"       text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    "status"        "LiaSessionStatus" NOT NULL DEFAULT 'not_started',
    "completed_at"  timestamp(3),
    "percentiles"   jsonb,
    "is_active"     boolean NOT NULL DEFAULT true
);

CREATE TABLE "personality_assessment_sessions" (
    "id"                text PRIMARY KEY,
    "user_id"           text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    "variant"           text NOT NULL DEFAULT 'estudiantil',
    "status"            text NOT NULL DEFAULT 'in_progress',
    "resolved_type"     text,
    "dimension_scores"  jsonb,
    "completed_at"      timestamp(3),
    "is_active"         boolean NOT NULL DEFAULT true
);

-- ------------------------------------------------------------------------------------------------
-- FM-CF-007: the vocational 360 chassis, MINIMAL -- only the columns VocationalResponseLoader reads.
-- CareerFitInputReader now loads the student's completed rater groups and their item responses through
-- that loader (the same query the vocational recompute runs), so these two tables must exist for the
-- evaluator to reach the end of a read. Shapes copied from FormMaps.IntegrationTests/Assessments/Data/
-- vocational-schema.sql, which is itself hand-written from prisma/schema.prisma -- there is no committed
-- migration for the vocational tables.
--
-- Like the two assessment SESSION tables above, neither appears in any vendored production policy file
-- (formmaps#77 PENDING), so both are left unpolicied here exactly as production leaves them, and neither
-- is in PoliciedTables. What stops a cross-school caller reaching a student's 360 responses is the same
-- thing that stops them reaching the LIA percentiles: CareerFitInputReader's gate against the policied
-- "users" row, which runs BEFORE any instrument read and short-circuits.
-- ------------------------------------------------------------------------------------------------

CREATE TABLE "evaluation_groups" (
    "id"                     text PRIMARY KEY,
    "groupType"              text NOT NULL,
    "evaluatedUserId"        text NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
    "instrument"             text,
    "isEvaluationCompleted"  boolean NOT NULL DEFAULT false,
    "isActive"               boolean NOT NULL DEFAULT true,
    "createdDate"            timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "vocational_responses" (
    "id"                 text PRIMARY KEY,
    "evaluationGroupId"  text NOT NULL REFERENCES "evaluation_groups" ("id") ON DELETE CASCADE,
    "instrumentVersion"  text NOT NULL DEFAULT '',
    "group"              text NOT NULL DEFAULT '',
    "questionNumber"     integer NOT NULL,
    "dimensionKey"       text,
    "type"               text NOT NULL,
    "ratingValue"        integer,
    "rankingOrder"       jsonb,
    "selectedValues"     jsonb,
    "textValue"          text,
    "isActive"           boolean NOT NULL DEFAULT true,
    "createdDate"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
