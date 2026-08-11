using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Audit;
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
/// </summary>
/// <remarks>
/// formmaps#52 Task 11: the two <c>audit.assessment.pcaexam.*</c> events this class already emitted are
/// now DURABLE as well as logged. Both call sites keep their existing <c>logger.LogInformation</c> line
/// verbatim (log-based alerting still works) and additionally persist a row via
/// <see cref="IAuditEventWriter" />, fired from the same post-commit point the log line already fires
/// from — so a row can never claim a write that did not land. Both go through
/// <see cref="WriteAuditAsync" />, which fixes the subject type and the cancellation contract in one
/// place. This is a LIVE candidate-facing path: the audit write is fail-soft-but-alert inside
/// <c>AuditEventWriter</c> (logged at Error under <c>audit.write_failed</c>, never thrown), so an audit
/// outage cannot fail a candidate's exam start or lose their submitted answers.
/// </remarks>
public sealed class PcaExamWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IAuditEventWriter auditEventWriter,
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

        // Below every gate this method has — the exam lookup AND the retake block — and below the
        // commit, so the durable row exists only for a session that actually exists. An event emitted
        // above the retake block would let a barred candidate manufacture an unbounded trail of
        // "attempts" at an exam they never re-started. The subject is the GENERATED session id, the
        // only handle a later reader has on this attempt; the actor is the caller, since /start is
        // self-scoped (the endpoint passes context.Tenant.UserId as userId).
        await WriteAuditAsync(
            "audit.assessment.pcaexam.started",
            sessionId,
            userId,
            new Dictionary<string, object?> { ["examId"] = examId });

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

        // Same position as the log line, and for the same reason it sits there: below the corpus #18
        // final-session guard, below the conditional UPDATE's fail-closed 0-rows check, and below the
        // commit. A replayed submit is refused before this point, so one graded exam produces exactly
        // one row — a second would misreport a refused answer-key replay as a real submission.
        await WriteAuditAsync(
            "audit.assessment.pcaexam.submitted",
            sessionId,
            context.Tenant?.UserId,
            new Dictionary<string, object?>
            {
                ["score"] = scorePercent,
                ["correct"] = correct,
                ["total"] = totalQuestions,
            });

        return new PcaExamSubmitOutcome(
            PcaExamWriteStatus.Ok,
            new ExamSubmitResult(sessionId, scorePercent, correct, totalQuestions, "Completed"));
    }

    // -------------------------------------------------------------------- audit

    /// <summary>
    /// The durable half of this class's audit (formmaps#52 Task 11). Called immediately after each
    /// existing <c>audit.assessment.pcaexam.*</c> log line, and — like that line — only ever AFTER the
    /// session's own commit has succeeded.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The subject is the exam SESSION, not the candidate: a session id identifies one attempt, which
    /// is what a compliance reader needs to reconcile against the graded row, and it keeps the taker's
    /// identity out of a column that is queried across tenants. <c>ActorRole</c>/<c>SchoolId</c> stay
    /// null, keeping the durable row congruent with the log line rather than reaching into the
    /// <see cref="RequestContext" /> for fields this domain has never audited.
    /// </para>
    /// <para>
    /// Metadata is IDs, counts and one percentage — never a question, an answer, or anything else the
    /// candidate produced. <c>audit_events</c> is append-only and retained indefinitely; an exam
    /// response has no business there, and the answer key least of all.
    /// </para>
    /// <para>
    /// <see cref="CancellationToken.None" /> is passed deliberately, per
    /// <see cref="IAuditEventWriter.WriteAsync" />'s contract: this runs after the caller's commit, and
    /// <c>AuditEventWriter</c> re-throws <see cref="OperationCanceledException" /> rather than
    /// swallowing it — so passing the request token would let a candidate closing the tab in the gap
    /// between commit and audit raise from a submission that had already been graded and stored. Every
    /// other failure is fail-soft-but-alert inside the writer, so this call cannot change what the
    /// candidate sees.
    /// </para>
    /// </remarks>
    private Task WriteAuditAsync(
        string eventType, string sessionId, string? actorUserId, IReadOnlyDictionary<string, object?> metadata) =>
        auditEventWriter.WriteAsync(
            new AuditEvent(
                EventType: eventType,
                ActorUserId: actorUserId,
                ActorRole: null,
                SchoolId: null,
                SubjectType: "pca_exam_session",
                SubjectId: sessionId,
                Metadata: metadata),
            CancellationToken.None);

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
