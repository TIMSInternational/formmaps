-- Schema-only harness DDL for the academic-gaps reads (FM-DOTNET-080). Hand-written from schema.prisma; only the
-- columns the reader touches. Decimal credit columns are numeric so ::double precision behaves as in prod.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "name"       text,
    "email"      text NOT NULL,
    "schoolId"   text,
    "roleName"   text,
    "gradeLevel" integer
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "studentId"   text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_grades" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "schoolId"  text NOT NULL,
    "courseId"  text NOT NULL,
    "credits"   numeric NOT NULL DEFAULT 0,
    "status"    text NOT NULL DEFAULT 'completed',
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "school_courses" (
    "id"         text PRIMARY KEY,
    "schoolId"   text NOT NULL,
    "code"       text,
    "name"       text,
    "department" text,
    "credits"    numeric NOT NULL DEFAULT 0,
    "status"     text NOT NULL DEFAULT 'active',
    "isActive"   boolean NOT NULL DEFAULT true
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

CREATE TABLE "category_requirements" (
    "id"               text PRIMARY KEY,
    "ruleSetId"        text NOT NULL,
    "category"         text NOT NULL,
    "minCredits"       numeric NOT NULL DEFAULT 0,
    "requiredCourses"  text[] NOT NULL DEFAULT '{}',
    "electivesAllowed" boolean NOT NULL DEFAULT true,
    "sortOrder"        integer NOT NULL DEFAULT 0,
    "isActive"         boolean NOT NULL DEFAULT true
);
