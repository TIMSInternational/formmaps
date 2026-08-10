-- Schema-only harness DDL for the parent child-link-scoped reads (FM-DOTNET-079), hand-written from schema.prisma.
-- Only the columns the reader queries touch are modelled. totalCreditsRequired + credits are `numeric` (Prisma
-- Decimal); scorePercentage is double precision (Prisma Float); timestamps are `timestamp` (no tz).

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "name"       text NOT NULL,
    "gradeLevel" integer,
    "schoolId"   text
);

CREATE TABLE "student_parent_links" (
    "id"           text PRIMARY KEY,
    "studentId"    text NOT NULL,
    "parentUserId" text,
    "isAccepted"   boolean NOT NULL DEFAULT false,
    "isActive"     boolean NOT NULL DEFAULT true
);

CREATE TABLE "pca_evaluations" (
    "id"     text PRIMARY KEY,
    "userId" text NOT NULL
);

CREATE TABLE "pca_exam_sessions" (
    "id"              text PRIMARY KEY,
    "userId"          text NOT NULL,
    "scorePercentage" double precision NOT NULL DEFAULT 0,
    "isCompleted"     boolean NOT NULL DEFAULT false
);

CREATE TABLE "evaluation_groups" (
    "id"                    text PRIMARY KEY,
    "evaluatedUserId"       text NOT NULL,
    "isEvaluationCompleted" boolean NOT NULL DEFAULT false,
    "isActive"              boolean NOT NULL DEFAULT true
);

CREATE TABLE "academic_years" (
    "id"        text PRIMARY KEY,
    "schoolId"  text NOT NULL,
    "isCurrent" boolean NOT NULL DEFAULT false
);

CREATE TABLE "graduation_rule_sets" (
    "id"                   text PRIMARY KEY,
    "schoolId"             text NOT NULL,
    "academicYearId"       text NOT NULL,
    "totalCreditsRequired" numeric NOT NULL,
    "isActive"             boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_grades" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "status"    text NOT NULL DEFAULT 'completed',
    "grade"     text,
    "credits"   numeric NOT NULL DEFAULT 0,
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "graduation_plans" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "status"      text NOT NULL DEFAULT 'draft',
    "reviewedAt"  timestamp,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "graduation_plan_items" (
    "id"         text PRIMARY KEY,
    "planId"     text NOT NULL,
    "courseCode" text NOT NULL,
    "courseName" text NOT NULL,
    "credits"    numeric NOT NULL DEFAULT 0,
    "gradeLevel" integer NOT NULL,
    "term"       text,
    "sortOrder"  integer NOT NULL DEFAULT 0,
    "isActive"   boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_graduation_targets" (
    "id"             text PRIMARY KEY,
    "studentId"      text NOT NULL UNIQUE,
    "universityName" text,
    "major"          text NOT NULL,
    "isActive"       boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_course_plans" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "courseId"  text NOT NULL,
    "term"      text,
    "gradeLevel" integer,                              -- #122
    "status"    text NOT NULL DEFAULT 'planned',
    "sortOrder" integer NOT NULL DEFAULT 0,
    "isActive"  boolean NOT NULL DEFAULT true
);
