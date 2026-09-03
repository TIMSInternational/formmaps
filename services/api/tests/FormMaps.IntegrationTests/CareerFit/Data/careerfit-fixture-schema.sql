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
