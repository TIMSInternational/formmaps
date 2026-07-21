-- Schema-only harness for the school:users cluster (FM-DOTNET-052). Hand-authored from prisma/schema.prisma with
-- only the columns the five routes touch: users (roster/scope + gradeLevel write target + counselor/student rows)
-- and counselor_student_assignments (assign/unassign writes + counselor-students read). The assignments table
-- carries the @@unique([counselorId, studentId]) the ON CONFLICT upsert relies on, plus FK ON DELETE CASCADE to
-- users (counselorId/studentId) — the write harness precedent (FM-048). NO RLS policies (schema-only). The
-- fixture pins a NON-UTC server timezone so the ISO-Z / now() timestamp round-trips are caught if tz-dependent.

CREATE TABLE "users" (
    "id"          text PRIMARY KEY,
    "name"        text NOT NULL,
    "email"       text NOT NULL,
    "roleName"    text NOT NULL,
    "schoolId"    text,
    "gradeLevel"  integer,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "studentId"   text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "assignedBy"  text,
    "isActive"    boolean NOT NULL DEFAULT true,
    "assignedAt"  timestamp NOT NULL DEFAULT now(),
    "createdBy"   text,
    "createdDate" timestamp NOT NULL DEFAULT now(),
    "updatedBy"   text,
    "updatedAt"   timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "counselor_student_assignments_counselorId_studentId_key" UNIQUE ("counselorId", "studentId")
);

CREATE INDEX "schoolusers_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "schoolusers_csa_counselorId_idx" ON "counselor_student_assignments"("counselorId");
CREATE INDEX "schoolusers_csa_studentId_idx" ON "counselor_student_assignments"("studentId");
