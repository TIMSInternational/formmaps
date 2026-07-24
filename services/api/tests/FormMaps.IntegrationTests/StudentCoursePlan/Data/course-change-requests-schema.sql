-- Schema-only harness for the student course change-requests CRUD (FM-DOTNET-085 — routes/course-plan.ts L92-143).
-- Hand-authored from prisma/schema.prisma with only the tables the three endpoints touch: users (requireSchoolMembership
-- schoolId + gradeLevel), school_assessment_settings (courseRequestDeadline dueDate default), course_change_requests (the
-- full-row create/list/soft-cancel). NO foreign keys / RLS policies (schema-only). action/status are native PG enums (the
-- real DB uses them) so the create's @action::"CourseChangeAction" cast rejects an invalid label (→ 500) and the list's
-- @status::"CourseChangeStatus" filter reproduces Prisma's enum-validation 500. credits is numeric so trim_scale/::text
-- echoes the decimal.js string as in prod.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "schoolId"   text,
    "gradeLevel" integer
);

CREATE TABLE "school_assessment_settings" (
    "id"                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "schoolId"              text NOT NULL UNIQUE,
    "courseRequestDeadline" timestamp
);

CREATE TYPE "CourseChangeStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "CourseChangeAction" AS ENUM ('add', 'drop', 'swap');

CREATE TABLE "course_change_requests" (
    "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "studentId"     text NOT NULL,
    "schoolId"      text NOT NULL,
    "courseId"      text NOT NULL,
    "courseCode"    text,
    "courseName"    text,
    "credits"       numeric NOT NULL DEFAULT 0,
    "gradeLevel"    integer NOT NULL,
    "semester"      text,
    "action"        "CourseChangeAction" NOT NULL,
    "dueDate"       timestamp,
    "studentNote"   text,
    "status"        "CourseChangeStatus" NOT NULL DEFAULT 'pending',
    "counselorNote" text,
    "reviewedBy"    text,
    "reviewedAt"    timestamp,
    "isActive"      boolean NOT NULL DEFAULT true,
    "createdBy"     text,
    "createdDate"   timestamp NOT NULL DEFAULT now(),
    "updatedBy"     text,
    "updatedAt"     timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "ccr_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "ccr_change_requests_studentId_idx" ON "course_change_requests"("studentId");
CREATE INDEX "ccr_change_requests_schoolId_idx" ON "course_change_requests"("schoolId");
