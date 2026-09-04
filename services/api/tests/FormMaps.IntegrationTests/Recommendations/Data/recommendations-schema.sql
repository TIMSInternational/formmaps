-- Schema-only DDL for the Testcontainers letters-of-recommendation harness (formmaps#59).
--
-- Column sets mirror api/prisma/schema.prisma for the tables the repository actually touches, PLUS every
-- column the production RLS policies name -- notably users."schoolId", which the tenant_isolation policies on
-- recommendation_requests / recommendation_application_links / student_applications /
-- counselor_student_assignments all sub-select. Leaving it out is the 42703 failure mode CONVERTING-A-FIXTURE.md
-- warns about.
--
-- Every table here that production policies is named in RecommendationsFixture.PoliciedTables:
--   users                              (005-sensitive.sql)
--   recommendation_requests            (003-fk-users.sql)
--   student_applications               (003-fk-users.sql)
--   counselor_student_assignments      (003-fk-users.sql)
--   recommendation_application_links   (004-fk-parent.sql)
-- `coaches` and `bookings` appear in NO policy file, so they are deliberately absent from that list and stay
-- unpolicied here -- which matches production, where they are unpolicied too.

CREATE TABLE "users" (
    "id"        text PRIMARY KEY,
    "name"      text,
    "email"     text NOT NULL,
    "roleName"  text,
    "schoolId"  text,
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "coaches" (
    "id"       text PRIMARY KEY,
    "userId"   text NOT NULL,
    "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "bookings" (
    "id"        text PRIMARY KEY,
    "coachId"   text NOT NULL,
    "studentId" text NOT NULL,
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_applications" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "name"        text NOT NULL DEFAULT 'app',
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp(3) NOT NULL DEFAULT now(),
    "updatedAt"   timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE "recommendation_requests" (
    "id"               text PRIMARY KEY,
    "studentId"        text NOT NULL,
    "recommenderId"    text NOT NULL,
    "status"           text NOT NULL DEFAULT 'requested',
    "relationship"     text,
    "requestMessage"   text,
    "declineReason"    text,
    "dueDate"          timestamp(3),
    "submittedAt"      timestamp(3),
    "letterFileKey"    text,
    "letterFileName"   text,
    "letterUploadedAt" timestamp(3),
    "isActive"         boolean NOT NULL DEFAULT true,
    "createdBy"        text,
    "createdDate"      timestamp(3) NOT NULL DEFAULT now(),
    "updatedBy"        text,
    "updatedAt"        timestamp(3) NOT NULL DEFAULT now()
);

-- The @@unique([studentId, recommenderId]) that makes the re-request policy work: one canonical row per pair,
-- and the ON CONFLICT target the create path names.
CREATE UNIQUE INDEX "recommendation_requests_studentId_recommenderId_key"
    ON "recommendation_requests" ("studentId", "recommenderId");

CREATE TABLE "recommendation_application_links" (
    "id"                      text PRIMARY KEY,
    "recommendationRequestId" text NOT NULL,
    "studentApplicationId"    text NOT NULL,
    "isSubmitted"             boolean NOT NULL DEFAULT false,
    "submittedAt"             timestamp(3),
    "isActive"                boolean NOT NULL DEFAULT true,
    "createdBy"               text,
    "createdDate"             timestamp(3) NOT NULL DEFAULT now(),
    "updatedBy"               text,
    "updatedAt"               timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "recommendation_application_links_request_application_key"
    ON "recommendation_application_links" ("recommendationRequestId", "studentApplicationId");
