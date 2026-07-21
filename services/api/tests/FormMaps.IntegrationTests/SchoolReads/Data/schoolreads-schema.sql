-- Schema-only harness for the school:manage reads (FM-DOTNET-050). Hand-authored from prisma/schema.prisma with
-- only the columns the four reads touch: users (roster/scope + counselors), school_courses (course count),
-- course_change_requests (pending count), pca_evaluations (distinct-user completion), pca_exam_sessions
-- (avg scorePercentage over status='Completed'), counselor_student_assignments (assignments/workload),
-- counselor_sessions (workload sessionCount), counselor_notes (notes list + workload noteCount). NO foreign keys
-- / RLS policies (schema-only). The `status` columns are text here (the real DB uses PG enums); the reader casts
-- with ::text so 'pending' / 'Completed' match identically on both. The fixture pins a NON-UTC server timezone.

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "name"       text NOT NULL,
    "email"      text NOT NULL,
    "roleName"   text NOT NULL,
    "schoolId"   text,
    "gradeLevel" integer,
    "isActive"   boolean NOT NULL DEFAULT true
);

CREATE TABLE "school_courses" (
    "id"       text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "course_change_requests" (
    "id"       text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "status"   text NOT NULL DEFAULT 'pending'
);

CREATE TABLE "pca_evaluations" (
    "id"     text PRIMARY KEY,
    "userId" text NOT NULL
);

CREATE TABLE "pca_exam_sessions" (
    "id"              text PRIMARY KEY,
    "userId"          text NOT NULL,
    "scorePercentage" double precision NOT NULL DEFAULT 0,
    "status"          text NOT NULL DEFAULT 'InProgress'
);

CREATE TABLE "counselor_student_assignments" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "counselorId" text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "counselor_sessions" (
    "id"          text PRIMARY KEY,
    "counselorId" text NOT NULL,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "counselor_notes" (
    "id"                  text PRIMARY KEY,
    "studentId"           text NOT NULL,
    "authorId"            text NOT NULL,
    "type"                text NOT NULL,
    "content"             text NOT NULL,
    "isPrivate"           boolean NOT NULL DEFAULT false,
    "followUpDate"        timestamp,
    "followUpCompleted"   boolean NOT NULL DEFAULT false,
    "followUpCompletedAt" timestamp,
    "tags"                text[] NOT NULL DEFAULT '{}',
    "isActive"            boolean NOT NULL DEFAULT true,
    "createdBy"           text,
    "createdDate"         timestamp NOT NULL DEFAULT now(),
    "updatedBy"           text,
    "updatedAt"           timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "schoolreads_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "schoolreads_school_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "schoolreads_course_change_requests_schoolId_idx" ON "course_change_requests"("schoolId");
CREATE INDEX "schoolreads_pca_evaluations_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "schoolreads_pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "schoolreads_counselor_assignments_counselorId_idx" ON "counselor_student_assignments"("counselorId");
CREATE INDEX "schoolreads_counselor_sessions_counselorId_idx" ON "counselor_sessions"("counselorId");
CREATE INDEX "schoolreads_counselor_notes_studentId_idx" ON "counselor_notes"("studentId");
CREATE INDEX "schoolreads_counselor_notes_authorId_idx" ON "counselor_notes"("authorId");
