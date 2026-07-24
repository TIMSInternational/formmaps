-- Schema-only harness for the student course-planning CRUD (FM-DOTNET-084 — routes/course-plan.ts). Hand-authored
-- from prisma/schema.prisma with only the columns the three endpoints touch: users (requireSchoolMembership schoolId +
-- gradeLevel), academic_years (?academicYearId findUnique / current-year findFirst), student_course_plans (the full-row
-- passthrough enrollments + create/delete), student_grades (totalCreditsEarned). NO foreign keys / RLS policies
-- (schema-only). student_course_plans.status is text here (the real DB column is a plain String, not a PG enum) so the
-- 'planned' literal compares directly. credits is numeric so ::double precision behaves as in prod.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "schoolId"   text,
    "gradeLevel" integer
);

CREATE TABLE "academic_years" (
    "id"        text PRIMARY KEY,
    "schoolId"  text NOT NULL,
    "name"      text NOT NULL DEFAULT '',
    "isCurrent" boolean NOT NULL DEFAULT false
);

CREATE TABLE "student_course_plans" (
    "id"             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "studentId"      text NOT NULL,
    "schoolId"       text NOT NULL,
    "academicYearId" text NOT NULL,
    "term"           text,
    "courseId"       text NOT NULL,
    "status"         text NOT NULL DEFAULT 'planned',
    "sortOrder"      integer NOT NULL DEFAULT 0,
    "notes"          text,
    "isActive"       boolean NOT NULL DEFAULT true,
    "createdBy"      text,
    "createdDate"    timestamp NOT NULL DEFAULT now(),
    "updatedBy"      text,
    "updatedAt"      timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "student_grades" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "schoolId"  text,
    "courseId"  text NOT NULL,
    "credits"   numeric NOT NULL DEFAULT 0,
    "status"    text NOT NULL DEFAULT 'completed',
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE INDEX "studentcourseplan_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "studentcourseplan_academic_years_schoolId_idx" ON "academic_years"("schoolId");
CREATE INDEX "studentcourseplan_plans_studentId_idx" ON "student_course_plans"("studentId");
CREATE INDEX "studentcourseplan_plans_ay_idx" ON "student_course_plans"("academicYearId");
CREATE INDEX "studentcourseplan_grades_studentId_idx" ON "student_grades"("studentId");
