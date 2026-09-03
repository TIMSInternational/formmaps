-- Harness DDL for the CareerFit persistence slice (FM-CF-002). PLATFORM tables only, hand-written from
-- schema.prisma with just the columns the policies and the foreign keys touch; the two CareerFit tables
-- are NOT here. They come from the REAL infra/aws/sql/careerfit-schema.sql, embedded by reference (see
-- FormMaps.IntegrationTests.csproj) and applied by CareerFitDatabaseFixture.AdditionalDdl on top of this
-- file -- the same rule the Audit fixture follows for audit_events. A transcription of the CareerFit DDL
-- here would let production drift out from under a green suite (formmaps#125), so do not add one.
--
-- Why each table is here:
--   users                          careerfit_runs."userId" REFERENCES it; production policies it
--                                  (005-sensitive.sql: self OR same school), and the harness applies that.
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
-- set leaves them; a cross-school read of a student is stopped at pca_results (the reader reads it
-- first and fails closed) and at careerfit_runs.
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
