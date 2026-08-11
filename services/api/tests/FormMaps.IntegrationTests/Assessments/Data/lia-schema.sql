-- Schema-only harness DDL for the LIA session write lifecycle (FM-DOTNET-029).
-- Verbatim from prisma/migrations/20260703000000_lia_tims_parity (+ flag_for_review from the
-- 07-13 proctoring migration, + reentryCount/lockedAt from 20260725100000_lia_reentry_limit),
-- with ONE harness simplification: a minimal `users` stub (the prod table has many more columns
-- none of which this slice touches). NO RLS policies (schema-only; RLS-e2e deferred — policy DDL
-- is not in the repo migrations; note that prod's lia_questions has no RLS policy either, so this
-- table in particular is a faithful mirror).
--
-- `lia_questions` and the `lia_responses_question_id_fkey` FK ARE present and MUST stay present.
-- They were originally omitted with the justification "completeSession never reads lia_questions" —
-- true for the first task's read-only-completion scope, but false the moment response-INSERTing code
-- arrived. Without this constraint the harness silently accepted any question_id string, so a whole
-- class of bug (writing ids that cannot exist in prod's lia_questions) passed a fully green suite and
-- would have 500'd on every /answer and /timeout call in production. LiaWriteDatabaseFixture seeds
-- one row here per entry of the embedded static question bank, with a freshly generated uuid — exactly
-- mirroring prod, where `id` is `@default(uuid())` and therefore differs per environment/seed run.

CREATE TYPE "LiaSubtest" AS ENUM ('pattern_recognition', 'verbal_reasoning', 'numerical_speed', 'working_memory', 'visual_rotation');
CREATE TYPE "LiaSessionStatus" AS ENUM ('not_started', 'practice', 'in_progress', 'completed', 'abandoned');

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lia_questions" (
    "id" TEXT NOT NULL,
    "subtest" "LiaSubtest" NOT NULL,
    "item_number" INTEGER NOT NULL,
    "question_data" JSONB NOT NULL,
    "correct_answer" TEXT NOT NULL,
    "is_practice" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lia_questions_pkey" PRIMARY KEY ("id")
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

CREATE INDEX "lia_questions_subtest_is_practice_idx" ON "lia_questions"("subtest", "is_practice");
CREATE UNIQUE INDEX "lia_questions_subtest_item_number_is_practice_key" ON "lia_questions"("subtest", "item_number", "is_practice");
CREATE INDEX "lia_assessment_sessions_user_id_idx" ON "lia_assessment_sessions"("user_id");
CREATE INDEX "lia_assessment_sessions_user_id_status_idx" ON "lia_assessment_sessions"("user_id", "status");
CREATE INDEX "lia_responses_session_id_idx" ON "lia_responses"("session_id");
CREATE INDEX "lia_responses_question_id_idx" ON "lia_responses"("question_id");
CREATE UNIQUE INDEX "lia_responses_session_id_question_id_key" ON "lia_responses"("session_id", "question_id");

ALTER TABLE "lia_assessment_sessions" ADD CONSTRAINT "lia_assessment_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lia_responses" ADD CONSTRAINT "lia_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "lia_assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lia_responses" ADD CONSTRAINT "lia_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "lia_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 8). Deliberately SIMPLIFIED: table shape only — no RLS policy and
-- no immutability trigger. Both are proven once, thoroughly, against the real DDL in
-- FormMaps.IntegrationTests/Audit (plan Tasks 1/4); repeating them here would only add the
-- DISABLE-TRIGGER reset dance to seven unrelated fixtures for zero extra coverage. What THIS copy is
-- for is the wiring question: does LiaSessionWriter actually persist a row on every completion path.
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT PRIMARY KEY,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "schoolId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "metadata" JSONB
);
