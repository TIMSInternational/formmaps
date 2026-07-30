-- Schema-only harness for the course-plan.ts compute reads (FM-DOTNET-086 — recommendations + eligibility). Hand-authored
-- from prisma/schema.prisma with only the tables the two reads touch. NO foreign keys / RLS policies. Enum-typed columns
-- (pca_exam_sessions.examType, lia_assessment_sessions.status) are text here (the reader casts ::text); numeric for the
-- Decimal columns so trim_scale/::double precision behave as in prod; text[]/int[] arrays and jsonb match prod.
-- lia_assessment_sessions uses the snake_case @map columns (user_id / is_active).

CREATE TABLE "users" (
    "id"         text PRIMARY KEY,
    "schoolId"   text,
    "gradeLevel" integer,
    "legacyUnlockGrandfathered" boolean NOT NULL DEFAULT false
);

-- checkAssessmentCompletion loads
CREATE TABLE "pca_exam_sessions" (
    "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"      text NOT NULL,
    "examType"    text NOT NULL,
    "isCompleted" boolean NOT NULL DEFAULT false,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "lia_assessment_sessions" (
    "id"        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"   text NOT NULL,
    "status"    text NOT NULL DEFAULT 'not_started',
    "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "personality_assessment_sessions" (
    "id"        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"   text NOT NULL,
    "status"    text NOT NULL DEFAULT 'in_progress',
    "is_active" boolean NOT NULL DEFAULT true
);

CREATE TABLE "evaluation_groups" (
    "id"                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "evaluatedUserId"       text NOT NULL,
    "isEvaluationCompleted" boolean NOT NULL DEFAULT false,
    "isActive"              boolean NOT NULL DEFAULT true
);

CREATE TABLE "pca_evaluations" (
    "id"          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"      text NOT NULL,
    "isCompleted" boolean NOT NULL DEFAULT false
);

-- recommendations loads
CREATE TABLE "course_enrollments" (
    "id"        text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "courseId"  text NOT NULL,
    "studentId" text NOT NULL,
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "user_preferences" (
    "id"                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"             text NOT NULL UNIQUE,
    "preferredFields"    text[] NOT NULL DEFAULT '{}',
    "preferredLanguages" text[] NOT NULL DEFAULT '{}'
);

-- Task-6 language-parity fold: resolveUserLanguage(userId) reads this (report's "Schema facts" section).
CREATE TABLE "user_settings" (
    "id"       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"   text NOT NULL UNIQUE,
    "language" text NOT NULL DEFAULT 'en'
);

-- Task-6 engine-career-alignment fold: extractEngineCareerTitles reads this (report §4/§5).
CREATE TABLE "user_career_profiles" (
    "id"            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId"        text NOT NULL UNIQUE,
    "careerMatches" jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE "courses" (
    "id"                   text PRIMARY KEY,
    "title"                text NOT NULL,
    "shortDescription"     text NOT NULL DEFAULT '',
    "fullDescription"      text NOT NULL DEFAULT '',
    "provider"             text NOT NULL DEFAULT '',
    "instructor"           text NOT NULL DEFAULT '',
    "category"             text NOT NULL DEFAULT '',
    "subcategory"          text NOT NULL DEFAULT '',
    "difficulty"           text NOT NULL DEFAULT '',
    "duration"             integer NOT NULL DEFAULT 0,
    "durationUnit"         text NOT NULL DEFAULT 'weeks',
    "estimatedHours"       integer NOT NULL DEFAULT 0,
    "thumbnailUrl"         text NOT NULL DEFAULT '',
    "videoUrl"             text NOT NULL DEFAULT '',
    "courseraUrl"          text NOT NULL DEFAULT '',
    "externalId"           text NOT NULL DEFAULT '',
    "rating"               numeric NOT NULL DEFAULT 0,
    "reviewCount"          integer NOT NULL DEFAULT 0,
    "enrollmentCount"      integer NOT NULL DEFAULT 0,
    "certificate"          boolean NOT NULL DEFAULT false,
    "language"             text NOT NULL DEFAULT '',
    "country"              text NOT NULL DEFAULT '',
    "region"               text NOT NULL DEFAULT '',
    "skills"               text[] NOT NULL DEFAULT '{}',
    "matchingCompetencies" text[] NOT NULL DEFAULT '{}',
    "careerPaths"          text[] NOT NULL DEFAULT '{}',
    "learningObjectives"   text[] NOT NULL DEFAULT '{}',
    "prerequisites"        text[] NOT NULL DEFAULT '{}',
    "syllabus"             jsonb NOT NULL DEFAULT '[]',
    "recommendedScore"     numeric NOT NULL DEFAULT 0,
    "sourceUrl"            text NOT NULL DEFAULT '',
    "isActive"             boolean NOT NULL DEFAULT true,
    "createdBy"            text,
    "createdDate"          timestamp NOT NULL DEFAULT now(),
    "updatedBy"            text,
    "updatedAt"            timestamp NOT NULL DEFAULT now()
);

-- eligibility loads
CREATE TABLE "school_courses" (
    "id"            text PRIMARY KEY,
    "schoolId"      text NOT NULL,
    "code"          text NOT NULL DEFAULT '',
    "gradeLevels"   integer[] NOT NULL DEFAULT '{}',
    "prerequisites" text[] NOT NULL DEFAULT '{}',
    "status"        text NOT NULL DEFAULT 'active',
    "isActive"      boolean NOT NULL DEFAULT true
);

CREATE TABLE "student_grades" (
    "id"        text PRIMARY KEY,
    "studentId" text NOT NULL,
    "schoolId"  text,
    "courseId"  text NOT NULL,
    "status"    text NOT NULL DEFAULT 'completed',
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE INDEX "cpc_pca_exam_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "cpc_lia_user_idx" ON "lia_assessment_sessions"("user_id");
CREATE INDEX "cpc_eval_groups_idx" ON "evaluation_groups"("evaluatedUserId");
CREATE INDEX "cpc_pca_eval_userId_idx" ON "pca_evaluations"("userId");
CREATE INDEX "cpc_enroll_studentId_idx" ON "course_enrollments"("studentId");
CREATE INDEX "cpc_courses_isActive_idx" ON "courses"("isActive");
CREATE INDEX "cpc_school_courses_schoolId_idx" ON "school_courses"("schoolId");
CREATE INDEX "cpc_student_grades_studentId_idx" ON "student_grades"("studentId");
