-- Schema-only harness DDL for the pca-exam take/submit write slice (FM-DOTNET-031).
-- Verbatim from prisma/migrations/20260505140750_init + 20260713000000_proctoring_violations:
-- native "ExamType"/"ExamStatus" enums, camelCase quoted columns, TIMESTAMP(3). NO RLS policies
-- (schema-only; RLS-e2e deferred — policy DDL is not in the repo). The container is pinned to a
-- non-UTC timezone by the fixture (the tz-independent-timestamp regression pin).

CREATE TYPE "ExamType" AS ENUM ('PatternRecognition', 'VerbalReasoning', 'WorkingMemory', 'NumericVelocity', 'VisualRotation');
CREATE TYPE "ExamStatus" AS ENUM ('InProgress', 'Completed', 'TimeExpired', 'Abandoned');

CREATE TABLE "pca_exams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ExamType" NOT NULL,
    "timeLimitMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pca_exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "data" JSONB NOT NULL,
    "correctAnswer" INTEGER NOT NULL,
    "explanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pca_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_exam_sessions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examName" TEXT NOT NULL DEFAULT '',
    "examType" "ExamType" NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "totalTimeSpent" INTEGER,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "incorrectAnswers" INTEGER NOT NULL DEFAULT 0,
    "unansweredQuestions" INTEGER NOT NULL DEFAULT 0,
    "scorePercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracyPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isTimeExpired" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExamStatus" NOT NULL DEFAULT 'InProgress',
    "violations" JSONB,
    "violation_count" INTEGER NOT NULL DEFAULT 0,
    "flag_for_review" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pca_exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pca_exam_answers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "userAnswer" TEXT,
    "correctAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "isAnswered" BOOLEAN NOT NULL DEFAULT false,
    "timeSpent" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pca_exam_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pca_questions_examId_questionNumber_key" ON "pca_questions"("examId", "questionNumber");
CREATE INDEX "pca_questions_examId_idx" ON "pca_questions"("examId");
CREATE INDEX "pca_exam_sessions_examId_idx" ON "pca_exam_sessions"("examId");
CREATE INDEX "pca_exam_sessions_userId_idx" ON "pca_exam_sessions"("userId");
CREATE INDEX "pca_exam_sessions_userId_status_idx" ON "pca_exam_sessions"("userId", "status");
CREATE INDEX "pca_exam_answers_sessionId_idx" ON "pca_exam_answers"("sessionId");

ALTER TABLE "pca_questions" ADD CONSTRAINT "pca_questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "pca_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pca_exam_sessions" ADD CONSTRAINT "pca_exam_sessions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "pca_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pca_exam_answers" ADD CONSTRAINT "pca_exam_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "pca_exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
