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
