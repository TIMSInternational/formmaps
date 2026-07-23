-- Schema-only harness DDL for the enriched caseload reads (FM-DOTNET-068). Hand-written from schema.prisma; only the
-- columns the reader touches. Decimal credit columns are numeric so ::double precision behaves as in prod; the enum
-- columns (ExamType/ExamStatus/AlertSeverity) are native so ::text reads back the label.

CREATE TABLE "users" (
    "id"          text PRIMARY KEY,
    "name"        text,
    "email"       text NOT NULL,
    "schoolId"    text,
    "gradeLevel"  integer,
    "isActive"    boolean NOT NULL DEFAULT true,
    "createdDate" timestamp NOT NULL DEFAULT now()
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
    "courseId"  text NOT NULL,
    "grade"     text,
    "credits"   numeric NOT NULL DEFAULT 0,
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TYPE "ExamType" AS ENUM ('PatternRecognition', 'VerbalReasoning', 'WorkingMemory', 'NumericVelocity', 'VisualRotation');
CREATE TYPE "ExamStatus" AS ENUM ('InProgress', 'Completed', 'TimeExpired', 'Abandoned');

CREATE TABLE "pca_exam_sessions" (
    "id"        text PRIMARY KEY,
    "userId"    text NOT NULL,
    "examType"  "ExamType" NOT NULL,
    "status"    "ExamStatus" NOT NULL DEFAULT 'InProgress',
    "isActive"  boolean NOT NULL DEFAULT true
);

CREATE TABLE "evaluation_groups" (
    "id"                    text PRIMARY KEY,
    "evaluatedUserId"       text NOT NULL,
    "isEvaluationCompleted" boolean NOT NULL DEFAULT false,
    "isActive"              boolean NOT NULL DEFAULT true
);

CREATE TABLE "pca_evaluations" (
    "id"          text PRIMARY KEY,
    "userId"      text NOT NULL DEFAULT '',
    "isCompleted" boolean NOT NULL DEFAULT false,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "user_career_profiles" (
    "id"                 text PRIMARY KEY,
    "userId"             text NOT NULL,
    "isAnalysisComplete" boolean NOT NULL DEFAULT false,
    "careerMatches"      jsonb NOT NULL DEFAULT '[]'
);

CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'high', 'critical');

CREATE TABLE "student_alerts" (
    "id"          text PRIMARY KEY,
    "studentId"   text NOT NULL,
    "type"        text NOT NULL,
    "severity"    "AlertSeverity" NOT NULL DEFAULT 'info',
    "message"     text NOT NULL DEFAULT '',
    "isDismissed" boolean NOT NULL DEFAULT false,
    "isActive"    boolean NOT NULL DEFAULT true
);

CREATE TABLE "school_courses" (
    "id"       text PRIMARY KEY,
    "schoolId" text NOT NULL,
    "credits"  numeric NOT NULL DEFAULT 0,
    "isActive" boolean NOT NULL DEFAULT true
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
