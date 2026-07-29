-- Schema-only harness DDL for the LIA completeSession write slice (FM-DOTNET-029).
-- Verbatim from prisma/migrations/20260703000000_lia_tims_parity (+ flag_for_review from the
-- 07-13 proctoring migration, + reentryCount/lockedAt from 20260725100000_lia_reentry_limit),
-- with two harness simplifications: a minimal `users` stub (the prod table has many more columns
-- none of which completeSession touches) and the lia_responses -> lia_questions FK dropped
-- (completeSession never reads lia_questions, so the harness omits that table). NO RLS policies
-- (schema-only; RLS-e2e deferred — policy DDL is not in the repo migrations).

CREATE TYPE "LiaSubtest" AS ENUM ('pattern_recognition', 'verbal_reasoning', 'numerical_speed', 'working_memory', 'visual_rotation');
CREATE TYPE "LiaSessionStatus" AS ENUM ('not_started', 'practice', 'in_progress', 'completed', 'abandoned');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lia_assessment_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "LiaSessionStatus" NOT NULL DEFAULT 'not_started',
    "current_subtest" "LiaSubtest",
    "current_item" INTEGER NOT NULL DEFAULT 0,
    "practice_completed" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "subtest_times" JSONB NOT NULL DEFAULT '{}',
    "raw_scores" JSONB,
    "final_scores" JSONB,
    "percentiles" JSONB,
    "global_percentile" DECIMAL(5,2),
    "performance_level" TEXT,
    "response_counts" JSONB,
    "lockdown_violations" JSONB,
    "device_info" JSONB,
    "language" TEXT NOT NULL DEFAULT 'es',
    "flag_for_review" BOOLEAN NOT NULL DEFAULT false,
    "reentryCount" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lia_assessment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lia_responses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "subtest" "LiaSubtest" NOT NULL,
    "item_number" INTEGER NOT NULL,
    "user_answer" TEXT,
    "is_correct" BOOLEAN,
    "answered_at" TIMESTAMP(3),
    "time_spent_ms" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lia_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lia_assessment_sessions_user_id_idx" ON "lia_assessment_sessions"("user_id");
CREATE INDEX "lia_assessment_sessions_user_id_status_idx" ON "lia_assessment_sessions"("user_id", "status");
CREATE INDEX "lia_responses_session_id_idx" ON "lia_responses"("session_id");
CREATE INDEX "lia_responses_question_id_idx" ON "lia_responses"("question_id");
CREATE UNIQUE INDEX "lia_responses_session_id_question_id_key" ON "lia_responses"("session_id", "question_id");

ALTER TABLE "lia_assessment_sessions" ADD CONSTRAINT "lia_assessment_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lia_responses" ADD CONSTRAINT "lia_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lia_assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
