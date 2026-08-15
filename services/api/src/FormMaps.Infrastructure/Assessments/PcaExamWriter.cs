using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Write-owner for the pca-exam take/submit path (legacy assessmentService.ts startExamSession + submitExam).
/// Reuses the FM-029 write rail (OpenWritableAsync + CommitAsync). Submit is TOCTOU-safe: it locks the
/// session <c>FOR UPDATE</c>, rejects an already-final session (<c>isCompleted || status='Completed'</c>)
/// BEFORE any write, and lands the completion via a conditional <c>UPDATE … WHERE "isCompleted"=false AND
/// "status" &lt;&gt; 'Completed'</c> that fails closed on 0 rows. This blocks corpus #18: replaying the
/// report-visible answer key to force 100% and appending duplicate answer rows. Durable writes emit a
/// PII-free audit event (IDs + scores only) after commit.
///
/// A <b>time-expired</b> session has <c>isCompleted=true, status='TimeExpired'</c>: because Node still owns
/// the <c>/complete</c> (timeout) write, guarding on <c>status='Completed'</c> alone would let a timed-out
/// session be re-submitted — so both the pre-check and the UPDATE guard test <c>isCompleted</c> too.
///
/// A durable submit completes a pca_exam_sessions row, which advances the LIA/cognitive leg of the
/// completion gate (5 distinct completed examTypes), so it also fires the polyglot insights trigger
/// (formmaps#144) — the same fire legacy's examRouter POST /submit performs. See
/// <see cref="SubmitExamAsync"/>.
/// </summary>
public sealed class PcaExamWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IInsightsTrigger insightsTrigger,
    ILogger<PcaExamWriter> logger) : IPcaExamWriter
{
    // -------------------------------------------------------------------- start

    public async Task<PcaExamStartOutcome> StartExamAsync(
        RequestContext context,
        string examId,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique exam by id (NO isActive filter — legacy startExamSession).
        string examName, examType;
        int timeLimitMinutes;
        await using (var command = Command(session, """
            SELECT "name", "type"::text AS "type", "timeLimitMinutes"
            FROM "pca_exams" WHERE "id" = @examId
            """))
        {
            AddParameter(command, "examId", examId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new PcaExamStartOutcome(PcaExamWriteStatus.ExamNotFound, null);
            }

            examName = reader.GetString(0);
            examType = reader.GetString(1);
            timeLimitMinutes = reader.GetInt32(2);
        }

        // Retake block: a COMPLETED (status='Completed') active session for this exam denies a new attempt.
        // (Legacy checks status only — a time-expired session does NOT block a retake here.)
        await using (var command = Command(session, """
            SELECT 1 FROM "pca_exam_sessions"
            WHERE "examId" = @examId AND "userId" = @userId
              AND "status" = 'Completed'::"ExamStatus" AND "isActive" = true
            LIMIT 1
            """))
        {
            AddParameter(command, "examId", examId);
            AddParameter(command, "userId", userId);
            var existing = await command.ExecuteScalarAsync(cancellationToken);
            if (existing is not null)
            {
                return new PcaExamStartOutcome(PcaExamWriteStatus.AlreadyCompleted, null);
            }
        }

        // Active questions, ordered. Answer-key stripped: correctAnswer/explanation are never selected.
        var served = new List<ServedExamQuestion>();
        await using (var command = Command(session, """
            SELECT "questionNumber", "questionText", "type"::text AS "type", "data"::text AS "data"
            FROM "pca_questions"
            WHERE "examId" = @examId AND "isActive" = true
            ORDER BY "questionNumber" ASC
            """))
        {
            AddParameter(command, "examId", examId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                served.Add(new ServedExamQuestion(
                    reader.GetInt32(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    ParseJson(reader.GetString(3))));
            }
        }

        // NOTE (deferred divergence — PROD-CUTOVER BLOCKER for /start): legacy resolves the user's language
        // and rebuilds VerbalReasoning question text via buildQuestionRows when language == "es". That
        // authored-bank rebuild (numerica/deteccion/memoria/verbal banks + verbalAnswer) is display-only —
        // scoring uses the DB answer key, so submit is unaffected — and is a separate slice; v1 serves the
        // DB rows unchanged for all languages. Close this before flipping /start to .NET in prod (a Spanish
        // VerbalReasoning taker would otherwise see DB text instead of the es-rebuilt passage).

        var sessionId = Guid.NewGuid().ToString();
        var now = Now();
        var totalQuestions = served.Count;
        await using (var command = Command(session, """
            INSERT INTO "pca_exam_sessions"
                ("id", "examId", "userId", "examName", "examType", "startTime", "totalQuestions", "status", "updatedAt")
            VALUES (@id, @examId, @userId, @examName, @examType::"ExamType", @startTime, @totalQuestions, 'InProgress'::"ExamStatus", @updatedAt)
            """))
        {
            AddParameter(command, "id", sessionId);
            AddParameter(command, "examId", examId);
            AddParameter(command, "userId", userId);
            AddParameter(command, "examName", examName);
            AddParameter(command, "examType", examType);
            AddTimestamp(command, "startTime", now);
            AddParameter(command, "totalQuestions", totalQuestions);
            AddTimestamp(command, "updatedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation(
            "audit.assessment.pcaexam.started sessionId={SessionId} actorUserId={ActorUserId} examId={ExamId}",
            sessionId, userId, examId);

        var payload = new ExamStartPayload(
            SessionId: sessionId,
            ExamId: examId,
            ExamName: examName,
            TimeLimitMinutes: timeLimitMinutes,
            TotalQuestions: totalQuestions,
            Questions: served);
        return new PcaExamStartOutcome(PcaExamWriteStatus.Ok, payload);
    }

    // ------------------------------------------------------------------- submit

    public async Task<PcaExamSubmitOutcome> SubmitExamAsync(
        RequestContext context,
        string sessionId,
        IReadOnlyList<SubmitAnswer> answers,
        int timeTaken,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Lock the session row: the completed/time-expired guard and the write are one atomic step.
        string ownerUserId, examId, status;
        bool isCompleted;
        await using (var command = Command(session, """
            SELECT "userId", "examId", "isCompleted", "status"::text AS "status"
            FROM "pca_exam_sessions" WHERE "id" = @sessionId
            FOR UPDATE
            """))
        {
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new PcaExamSubmitOutcome(PcaExamWriteStatus.SessionNotFound, null);
            }

            ownerUserId = reader.GetString(0);
            examId = reader.GetString(1);
            isCompleted = reader.GetBoolean(2);
            status = reader.GetString(3);
        }

        // Corpus #18: a final session (completed OR time-expired) is never re-scored and never appends
        // answer rows — the report-visible answer key cannot be replayed to force 100%.
        if (isCompleted || status == "Completed")
        {
            return new PcaExamSubmitOutcome(PcaExamWriteStatus.AlreadyCompleted, null);
        }

        // Exam must exist (legacy findUnique exam) — independent of the active-question set.
        await using (var command = Command(session, """SELECT 1 FROM "pca_exams" WHERE "id" = @examId"""))
        {
            AddParameter(command, "examId", examId);
            if (await command.ExecuteScalarAsync(cancellationToken) is null)
            {
                return new PcaExamSubmitOutcome(PcaExamWriteStatus.ExamNotFound, null);
            }
        }

        // Answer key (server-side only): questionNumber -> correctAnswer (Int).
        var answerKey = new Dictionary<int, int>();
        await using (var command = Command(session, """
            SELECT "questionNumber", "correctAnswer" FROM "pca_questions"
            WHERE "examId" = @examId AND "isActive" = true
            """))
        {
            AddParameter(command, "examId", examId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                answerKey[reader.GetInt32(0)] = reader.GetInt32(1);
            }
        }

        var totalQuestions = answerKey.Count;
        var correct = 0;
        var now = Now();

        foreach (var ans in answers)
        {
            var hasKey = answerKey.TryGetValue(ans.QuestionNumber, out var correctAnswer);
            var isCorrect = hasKey && ExamScoring.IsCorrect(correctAnswer, ans.UserAnswer);
            if (isCorrect)
            {
                correct++;
            }

            await using var command = Command(session, """
                INSERT INTO "pca_exam_answers"
                    ("id", "sessionId", "questionNumber", "userAnswer", "correctAnswer", "isCorrect", "isAnswered", "timeSpent", "updatedAt")
                VALUES (@id, @sessionId, @questionNumber, @userAnswer, @correctAnswer, @isCorrect, true, @timeSpent, @updatedAt)
                """);
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "questionNumber", ans.QuestionNumber);
            AddParameter(command, "userAnswer", ans.UserAnswer);
            AddParameter(command, "correctAnswer", hasKey ? correctAnswer.ToString(System.Globalization.CultureInfo.InvariantCulture) : (object)DBNull.Value);
            AddParameter(command, "isCorrect", isCorrect);
            AddParameter(command, "timeSpent", ans.TimeSpent);
            AddTimestamp(command, "updatedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        var answered = answers.Count;
        var scorePercent = ExamScoring.ScorePercent(correct, totalQuestions);
        var accuracy = ExamScoring.AccuracyPercent(correct, answered);

        int affected;
        await using (var command = Command(session, """
            UPDATE "pca_exam_sessions" SET
                "endTime" = @now,
                "totalTimeSpent" = @timeTaken,
                "questionsAnswered" = @answered,
                "correctAnswers" = @correct,
                "incorrectAnswers" = @incorrect,
                "unansweredQuestions" = @unanswered,
                "scorePercentage" = @scorePercent,
                "accuracyPercentage" = @accuracy,
                "isCompleted" = true,
                "status" = 'Completed'::"ExamStatus",
                "updatedAt" = @now
            WHERE "id" = @sessionId AND "isCompleted" = false AND "status" <> 'Completed'::"ExamStatus"
            """))
        {
            AddParameter(command, "sessionId", sessionId);
            AddTimestamp(command, "now", now);
            AddParameter(command, "timeTaken", timeTaken);
            AddParameter(command, "answered", answered);
            AddParameter(command, "correct", correct);
            AddParameter(command, "incorrect", answered - correct);
            AddParameter(command, "unanswered", totalQuestions - answered);
            AddParameter(command, "scorePercent", scorePercent);
            AddParameter(command, "accuracy", accuracy);
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // Unreachable under the FOR UPDATE lock (the pre-check already rejected a final session); fail
        // closed rather than emit a submission audit for a write that did not land (SOC2 PI).
        if (affected == 0)
        {
            logger.LogError("pcaexam.submit conditional update matched 0 rows sessionId={SessionId}", sessionId);
            throw new InvalidOperationException($"PCA exam submit update affected 0 rows for session {sessionId}");
        }

        await session.CommitAsync(cancellationToken);
        // Actor = the caller who performed the write (a privileged role may submit another user's
        // session); subject = the session owner. Both are IDs (PII-free); accountability trail for SOC2.
        logger.LogInformation(
            "audit.assessment.pcaexam.submitted sessionId={SessionId} actorUserId={ActorUserId} subjectUserId={SubjectUserId} examId={ExamId} score={Score} correct={Correct} total={Total}",
            sessionId, context.Tenant?.UserId, ownerUserId, examId, scorePercent, correct, totalQuestions);

        // formmaps#144: the UPDATE above set pca_exam_sessions."isCompleted" = true, which feeds the
        // LIA/cognitive leg of the completion gate — `liaCompleted >= 5` counted as DISTINCT "examType"
        // over `WHERE "userId" = @u AND "isActive" = true AND "isCompleted" = true`
        // (CoursePlanComputeReader.cs; StudentCompletion.Compute). The 5th distinct exam type submitted
        // by a student closes that leg, so this is a genuine gate event, not just a score write.
        //
        // This mirrors legacy examRouter POST /submit, which fires the SAME trigger after responding
        // (routes/assessment.ts:85-89 — checkAssessmentCompletion → generateInsightsBackground). So
        // unlike the VocationalTakeService fire, this one is strict legacy parity, not a divergence.
        // It was missing here only because /api/pcaexam/submit has no next.config.ts rewrite yet and
        // Node still serves it in production — i.e. this is a LATENT gap that becomes a live silent
        // funnel break the moment a PCAEXAM submit flag is added. Wiring it now keeps the flag flip a
        // pure routing change.
        //
        // Subject, not actor: the trigger is about whose gate moved, and a privileged role may submit
        // another user's session (hence the distinct ids in the audit line above) — so it fires for
        // ownerUserId. Exactly-once: the isCompleted/status pre-check and the conditional UPDATE (which
        // throws on 0 rows) mean only the call that durably completed the session reaches here; a
        // replay returned AlreadyCompleted long before. Ordering: strictly after CommitAsync.
        // IInsightsTrigger never throws (fail-soft-BUT-LOUD): a failed fire logs at Error with
        // userId+source for backfill and the student's submission still succeeds.
        await insightsTrigger.TriggerAsync(ownerUserId, "assessment.pcaexam.submitted", cancellationToken);

        return new PcaExamSubmitOutcome(
            PcaExamWriteStatus.Ok,
            new ExamSubmitResult(sessionId, scorePercent, correct, totalQuestions, "Completed"));
    }

    // ------------------------------------------------------------------ helpers

    private static JsonElement ParseJson(string text)
    {
        using var document = JsonDocument.Parse(text);
        return document.RootElement.Clone();
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // Bind a `timestamp` (without time zone) tz-independently (matches the Prisma DateTime columns).
    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // UTC wall-clock, Kind=Unspecified (→ `timestamp` binding) at ms precision (Postgres timestamp(3)).
    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
