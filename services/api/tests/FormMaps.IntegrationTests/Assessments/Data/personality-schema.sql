-- Schema-only harness DDL for the personality full-lifecycle write slice (FM-DOTNET-030).
-- From prisma/schema.prisma (PersonalityAssessmentSession + PersonalityResponse), with a minimal `users`
-- stub (name/email are what the results reader joins for user_name). status/variant are plain TEXT (NOT
-- Postgres enums). NO RLS policies (schema-only; RLS-e2e deferred — policy DDL is not in the repo).

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "personality_assessment_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'estudiantil',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "resolved_type" TEXT,
    "dimension_scores" JSONB,
    "session_language" TEXT,
    "violations" JSONB,
    "flag_for_review" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personality_assessment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "personality_responses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "item_number" INTEGER NOT NULL,
    "dimension" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personality_responses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "personality_assessment_sessions_user_id_idx" ON "personality_assessment_sessions"("user_id");
CREATE INDEX "personality_assessment_sessions_user_id_status_idx" ON "personality_assessment_sessions"("user_id", "status");
CREATE INDEX "personality_responses_session_id_idx" ON "personality_responses"("session_id");
CREATE UNIQUE INDEX "personality_responses_session_id_item_number_key" ON "personality_responses"("session_id", "item_number");

ALTER TABLE "personality_assessment_sessions" ADD CONSTRAINT "personality_assessment_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personality_responses" ADD CONSTRAINT "personality_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "personality_assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------------
-- audit-events retrofit (plan Task 9). Deliberately SIMPLIFIED: table shape only — no RLS policy and
-- no immutability trigger. Both are proven once, thoroughly, against the real DDL in
-- FormMaps.IntegrationTests/Audit (plan Tasks 1/4); repeating them here would only add the
-- DISABLE-TRIGGER reset dance to seven unrelated fixtures for zero extra coverage. What THIS copy is
-- for is the wiring question: does PersonalitySessionWriter actually persist a row when it starts and
-- when it completes a session — and, just as importantly, NOT on the resume/retake/replay paths.
--
-- There is deliberately no FK from "subjectId" to personality_assessment_sessions: audit_events
-- outlives its subjects by design (a deleted session must not take its audit trail with it), so a
-- reference here would be a shape the production table does not have.
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
