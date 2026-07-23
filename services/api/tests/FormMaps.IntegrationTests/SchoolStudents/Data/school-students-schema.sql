-- Schema-only harness for the school:manage roster reads (FM-DOTNET-062). Hand-authored from prisma/schema.prisma
-- with only the columns the three reads touch: users (roster/scope + detail identity), student_grades (GPA +
-- earned credits), academic_years + graduation_rule_sets (creditsRequired), school_courses (credit fallback),
-- pca_evaluations (PCA existence), pca_exam_sessions (MIL status), evaluation_groups (Eval360 status),
-- student_alerts (alertCount), community_service_entries (the passthrough entries), schools (serviceHoursRequired).
-- NO foreign keys / RLS policies (schema-only). `status` columns are text here (the real DB uses PG enums); the
-- reader casts with ::text so labels match on both. `hours`/`credits`/`totalCreditsRequired` are numeric so
-- trim_scale/::double precision behave as in prod. The fixture pins a NON-UTC server timezone.

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

CREATE TABLE "student_grades" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "courseId"  text NOT NULL,
    "grade"     text,
    "credits"   numeric NOT NULL DEFAULT 0,
    "status"    text NOT NULL DEFAULT 'completed',
    "isActive"  boolean NOT NULL DEFAULT true
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

CREATE TABLE "school_courses" (
    "id"       text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "credits"  numeric NOT NULL DEFAULT 0,
    "isActive" boolean NOT NULL DEFAULT true
);

CREATE TABLE "pca_evaluations" (
    "id"     text PRIMARY KEY,
    "userId" text NOT NULL
);

CREATE TABLE "pca_exam_sessions" (
    "id"     text PRIMARY KEY,
    "userId" text NOT NULL,
    "status" text NOT NULL DEFAULT 'InProgress'
);

CREATE TABLE "evaluation_groups" (
    "id"                    text PRIMARY KEY,
    "evaluatedUserId"       text NOT NULL,
    "groupType"             text NOT NULL,
    "isEvaluationCompleted" boolean NOT NULL DEFAULT false
);

CREATE TABLE "student_alerts" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "schoolId"    text,
    "isRead"      boolean NOT NULL DEFAULT false,
    "isDismissed" boolean NOT NULL DEFAULT false
);

CREATE TABLE "community_service_entries" (
    "id"              text PRIMARY KEY,
    "studentId"       text NOT NULL,
    "schoolId"        text NOT NULL,
    "organization"    text NOT NULL,
    "description"     text,
    "hours"           numeric NOT NULL,
    "date"            timestamp NOT NULL,
    "supervisorName"  text,
    "supervisorEmail" text,
    "status"          text NOT NULL DEFAULT 'pending',
    "note"            text,
    "verifiedBy"      text,
    "verifiedAt"      timestamp,
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "schools" (
    "id"                   text PRIMARY KEY,
    "serviceHoursRequired" integer
);

-- FM-DOTNET-063: parent-link reads (listParents grouped roster + stats; listParentsForStudent Guardians tab).
CREATE TABLE "student_parent_links" (
    "id"              text PRIMARY KEY,
    "studentId"       text NOT NULL,
    "parentEmail"     text NOT NULL,
    "parentName"      text NOT NULL DEFAULT '',
    "parentUserId"    text,
    "relation"        text NOT NULL DEFAULT 'parent',
    "invitationToken" text,
    "tokenExpiresAt"  timestamp,
    "isAccepted"      boolean NOT NULL DEFAULT false,
    "acceptedAt"      timestamp,
    "invitedBy"       text,
    "isActive"        boolean NOT NULL DEFAULT true,
    "createdBy"       text,
    "createdDate"     timestamp NOT NULL DEFAULT now(),
    "updatedBy"       text,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "schoolstudents_users_schoolId_idx" ON "users"("schoolId");
CREATE INDEX "schoolstudents_student_grades_studentId_idx" ON "student_grades"("studentId");
CREATE INDEX "schoolstudents_academic_years_schoolId_idx" ON "academic_years"("schoolId");
CREATE INDEX "schoolstudents_grad_rule_sets_schoolId_idx" ON "graduation_rule_sets"("schoolId");
CREATE INDEX "schoolstudents_school_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "schoolstudents_pca_evaluations_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "schoolstudents_pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "schoolstudents_evaluation_groups_userId_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "schoolstudents_student_alerts_studentId_idx" ON "student_alerts"("studentId");
CREATE INDEX "schoolstudents_community_service_studentId_idx" ON "community_service_entries"("studentId");
CREATE INDEX "schoolstudents_parent_links_studentId_idx" ON "student_parent_links"("studentId");
CREATE INDEX "schoolstudents_parent_links_parentEmail_idx" ON "student_parent_links"("parentEmail");
