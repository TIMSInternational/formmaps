-- Schema-only harness for the gradebook transcript read (FM-DOTNET Phase-B).
-- Mirrors the Prisma models touched: users (scoping) + student_grades + gpa_configurations.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "name"       text,
    "email"      text,
    "roleName"   text,
    "schoolId"   text,
    "gradeLevel" integer,
    "isActive"   boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_grades" (
    "id"           text PRIMARY KEY,
    "schoolId"     text NOT NULL,
    "studentId"    text NOT NULL,
    "courseId"     text,
    "courseCode"   text,
    "semester"     text,
    "grade"        text,
    "credits"      numeric NOT NULL DEFAULT 0,
    "status"       text NOT NULL DEFAULT 'completed',
    "importJobId"  text,
    "courseLevel"  text,
    "academicYear" text,
    "isActive"     boolean NOT NULL DEFAULT true,
    "createdBy"    text,
    "createdDate"  timestamp NOT NULL DEFAULT now(),
    "updatedBy"    text,
    "updatedAt"    timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "gpa_configurations" (
    "id"            text PRIMARY KEY,
    "schoolId"      text UNIQUE NOT NULL,
    "unweightedMap" jsonb,
    "weightBonuses" jsonb,
    "isActive"      boolean NOT NULL DEFAULT true
);
