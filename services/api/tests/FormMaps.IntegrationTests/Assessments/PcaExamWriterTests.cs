using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Audit;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="PcaExamWriter"/> — the pca-exam take/submit write
/// (legacy startExamSession + submitExam). Pins: start create / exam-404 / retake-block (Completed only,
/// NOT time-expired), submit happy score+persist, and the corpus #18 security guard — a completed OR
/// time-expired session 409s before any write (no answer-key replay to 100%, no duplicate answer rows,
/// no rescore) — plus the TOCTOU one-write-under-concurrency proof.
/// </summary>
public sealed class PcaExamWriterTests : IClassFixture<PcaExamWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly PcaExamWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public PcaExamWriterTests(PcaExamWriteDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // --------------------------------------------------------------------- start

    [Fact]
    public async Task Start_creates_an_in_progress_session_and_serves_answer_key_stripped_questions()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, questionNumber: 1, correctAnswer: 1);
        await SeedQuestionAsync(conn, examId, questionNumber: 2, correctAnswer: 2);
        await SeedQuestionAsync(conn, examId, questionNumber: 3, correctAnswer: 3);

        var (writer, logger) = MakeWriter();
        var outcome = await writer.StartExamAsync(Ctx(userId), examId, userId);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        var payload = outcome.Payload!;
        Assert.Equal("Pattern", payload.ExamName);
        Assert.Equal(5, payload.TimeLimitMinutes);
        Assert.Equal(3, payload.TotalQuestions);
        Assert.Equal(new[] { 1, 2, 3 }, payload.Questions.Select(q => q.QuestionNumber));

        // Answer-key non-leak: the served DTO cannot carry correctAnswer/explanation (compile-enforced),
        // and the serialized payload proves it.
        var payloadJson = JsonSerializer.Serialize(payload);
        Assert.DoesNotContain("correctAnswer", payloadJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("explanation", payloadJson, StringComparison.OrdinalIgnoreCase);

        var row = await ReadSessionAsync(payload.SessionId);
        Assert.Equal("InProgress", row.Status);
        Assert.False(row.IsCompleted);
        Assert.Equal(3, row.TotalQuestions);
        Assert.Equal(examId, row.ExamId);
        Assert.Contains(logger.Entries, e => e.Message.StartsWith("audit.assessment.pcaexam.started", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Start_on_a_nonexistent_exam_is_exam_not_found()
    {
        var userId = await SeedUserId();
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartExamAsync(Ctx(userId), "no-such-exam", userId);

        Assert.Equal(PcaExamWriteStatus.ExamNotFound, outcome.Status);
        Assert.Null(outcome.Payload);
    }

    [Fact]
    public async Task Start_when_a_completed_session_exists_blocks_the_retake()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedSessionAsync(conn, examId, userId, status: "Completed", isCompleted: true);

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartExamAsync(Ctx(userId), examId, userId);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(1, await CountSessionsAsync(userId, examId)); // no new session
    }

    [Fact]
    public async Task Start_is_not_blocked_by_a_time_expired_session()
    {
        // Legacy retake-block filters status='Completed' ONLY; a time-expired session does not block a retake.
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedSessionAsync(conn, examId, userId, status: "TimeExpired", isCompleted: true);

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartExamAsync(Ctx(userId), examId, userId);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        Assert.Equal(2, await CountSessionsAsync(userId, examId)); // a fresh session was created
    }

    /// <summary>
    /// The start half of the audit-events retrofit (plan Task 11 of formmaps#52). Until now "audit
    /// event" here meant one structured log line, which no compliance surface can query and which a
    /// log-retention window eventually deletes; starting an exam must ALSO persist a row in
    /// <c>audit_events</c>. The WHOLE row is asserted rather than a count, because eight of the nine
    /// written columns are TEXT and six are nullable — a count stays green for a writer that swapped
    /// actorUserId with subjectId, or dropped the metadata entirely.
    /// </summary>
    [Fact]
    public async Task Start_persists_a_pii_free_row_to_audit_events()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartExamAsync(
            Ctx(userId, name: "Ada Lovelace", email: "ada@analytical.engine"), examId, userId);

        var sessionId = outcome.Payload!.SessionId;
        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.pcaexam.started", sessionId);
        Assert.Equal("audit.assessment.pcaexam.started", row.EventType);
        Assert.Equal(userId, row.ActorUserId);
        Assert.Equal("pca_exam_session", row.SubjectType);
        Assert.Equal(sessionId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        // Metadata carries the one extra id the log line already carried — which exam was started —
        // and nothing else. Without it the row cannot say WHAT was attempted, only that something was.
        Assert.NotNull(row.MetadataJson);
        using var metadata = JsonDocument.Parse(row.MetadataJson!);
        Assert.Equal(examId, metadata.RootElement.GetProperty("examId").GetString());

        AssertPiiFree(row);
    }

    /// <summary>
    /// Negative control: a start rejected because the exam does not exist creates no session, so it
    /// must persist no audit row. Without this, a writer that emitted the event on entry — before the
    /// exam lookup — would still satisfy the happy-path test above, and the table would report attempts
    /// at exams that were never begun.
    /// </summary>
    [Fact]
    public async Task Start_on_a_nonexistent_exam_persists_no_audit_event()
    {
        var userId = await SeedUserId();
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartExamAsync(Ctx(userId), "no-such-exam", userId);

        Assert.Equal(PcaExamWriteStatus.ExamNotFound, outcome.Status);
        // By ACTOR, not subject: this path never produces a session id to filter on, so "no started
        // event anywhere attributable to this user" is the only form the claim can take.
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(
            "audit.assessment.pcaexam.started", actorUserId: userId));
    }

    /// <summary>
    /// Negative control: a retake blocked by an existing completed session creates nothing, so it
    /// persists nothing. This is the gate-ordering pin for start — an event emitted above the retake
    /// block would let a candidate manufacture an unbounded audit trail of attempts at an exam they
    /// are barred from re-taking.
    /// </summary>
    [Fact]
    public async Task Start_that_is_blocked_as_a_retake_persists_no_audit_event()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "Completed", isCompleted: true);

        var (writer, _) = MakeWriter();
        var outcome = await writer.StartExamAsync(Ctx(userId), examId, userId);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.pcaexam.started", subjectId: sessionId));
        Assert.Equal(0, await _fixture.CountAuditEventsAsync(
            "audit.assessment.pcaexam.started", actorUserId: userId));
    }

    // -------------------------------------------------------------------- submit

    [Fact]
    public async Task Submit_scores_persists_answers_and_completes_the_session()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        await SeedQuestionAsync(conn, examId, 3, 3);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "InProgress", isCompleted: false);

        var answers = new SubmitAnswer[]
        {
            new(1, "1", 30),  // correct
            new(2, "9", 12),  // wrong
            new(3, "3", 0),   // correct
        };

        var (writer, logger) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(userId), sessionId, answers, timeTaken: 42);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        var result = outcome.Result!;
        Assert.Equal(2, result.Correct);
        Assert.Equal(3, result.Total);
        Assert.Equal("Completed", result.Status);
        Assert.Equal((double)2 / 3 * 100, result.Score); // Float, no rounding

        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("Completed", row.Status);
        Assert.True(row.IsCompleted);
        Assert.Equal(2, row.CorrectAnswers);
        Assert.Equal(1, row.IncorrectAnswers);
        Assert.Equal(3, row.QuestionsAnswered);
        Assert.Equal(0, row.UnansweredQuestions);
        Assert.Equal(42, row.TotalTimeSpent);
        Assert.Equal((double)2 / 3 * 100, row.ScorePercentage);
        Assert.Equal((double)2 / 3 * 100, row.AccuracyPercentage);
        Assert.NotNull(row.EndTime);

        // Answer rows persisted with the server-side key + isCorrect.
        Assert.Equal(3, await CountAnswersAsync(sessionId));
        var a1 = await ReadAnswerAsync(sessionId, 1);
        Assert.Equal("1", a1.UserAnswer);
        Assert.Equal("1", a1.CorrectAnswer);
        Assert.True(a1.IsCorrect);
        Assert.Equal(30, a1.TimeSpent);
        var a2 = await ReadAnswerAsync(sessionId, 2);
        Assert.Equal("9", a2.UserAnswer);
        Assert.Equal("2", a2.CorrectAnswer);
        Assert.False(a2.IsCorrect);

        Assert.Contains(logger.Entries, e => e.Message.StartsWith("audit.assessment.pcaexam.submitted", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Submit_with_no_answers_completes_with_zeros_and_writes_no_answer_rows()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "InProgress", isCompleted: false);

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(userId), sessionId, [], timeTaken: 0);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        Assert.Equal(0d, outcome.Result!.Score);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("Completed", row.Status);
        Assert.Equal(0, row.QuestionsAnswered);
        Assert.Equal(2, row.UnansweredQuestions); // total(2) - answered(0)
        Assert.Equal(0, await CountAnswersAsync(sessionId)); // createMany skipped when length == 0
    }

    [Fact]
    public async Task Submit_on_a_completed_session_is_rejected_no_dup_rows_no_rescore()
    {
        // CORPUS #18: a completed session must not be re-submittable — the report-visible answer key
        // cannot be replayed to force 100%, and no duplicate answer rows are appended.
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        await SeedQuestionAsync(conn, examId, 3, 3);
        var sessionId = await SeedSessionAsync(
            conn, examId, userId, status: "Completed", isCompleted: true, scorePercentage: 50, correctAnswers: 1);
        await SeedAnswerAsync(conn, sessionId, questionNumber: 1, userAnswer: "1"); // one pre-existing row

        // A perfect-score replay attempt.
        var replay = new SubmitAnswer[] { new(1, "1", 0), new(2, "2", 0), new(3, "3", 0) };
        var (writer, logger) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(userId), sessionId, replay, timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Null(outcome.Result);
        Assert.Equal(1, await CountAnswersAsync(sessionId));   // NO duplicate rows appended
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("Completed", row.Status);
        Assert.Equal(50, row.ScorePercentage);                 // NOT rescored to 100
        Assert.Equal(1, row.CorrectAnswers);
        Assert.DoesNotContain(logger.Entries, e => e.Message.StartsWith("audit.assessment.pcaexam.submitted", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Submit_on_a_time_expired_session_is_rejected()
    {
        // A time-expired session has isCompleted=true, status='TimeExpired'. Because Node still owns the
        // /complete (timeout) write, guarding on status='Completed' alone would let it be re-submitted;
        // the isCompleted guard blocks that cross-stack race.
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "TimeExpired", isCompleted: true);

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(userId), sessionId, [new(1, "1", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(0, await CountAnswersAsync(sessionId));
        Assert.Equal("TimeExpired", (await ReadSessionAsync(sessionId)).Status); // untouched
    }

    [Fact]
    public async Task Submit_audit_records_the_caller_as_actor_and_the_owner_as_subject()
    {
        // A privileged role may submit another user's session (ownership is at the route). The audit must
        // attribute the write to the actual caller (actorUserId), not the session owner (subjectUserId).
        var ownerId = await SeedUserId();
        var callerId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        var sessionId = await SeedSessionAsync(conn, examId, ownerId, status: "InProgress", isCompleted: false);

        var (writer, logger) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(callerId), sessionId, [new(1, "1", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        var audit = Assert.Single(logger.Entries, e => e.Message.StartsWith("audit.assessment.pcaexam.submitted", StringComparison.Ordinal));
        Assert.Contains($"actorUserId={callerId}", audit.Message, StringComparison.Ordinal);
        Assert.Contains($"subjectUserId={ownerId}", audit.Message, StringComparison.Ordinal);
    }

    /// <summary>
    /// The submit half of the audit-events retrofit (plan Task 11). Same argument as
    /// <see cref="Start_persists_a_pii_free_row_to_audit_events" /> for asserting the whole row, plus
    /// the three scalars the existing log line carries — score/correct/total — which are what make the
    /// durable row reconcilable against the graded session without re-reading the exam data itself.
    /// </summary>
    [Fact]
    public async Task Submit_persists_a_pii_free_row_to_audit_events()
    {
        var ownerId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        await SeedQuestionAsync(conn, examId, 3, 3);
        await SeedQuestionAsync(conn, examId, 4, 4);
        var sessionId = await SeedSessionAsync(conn, examId, ownerId, status: "InProgress", isCompleted: false);

        // 2 of 4 correct -> an exact 50.0, so the metadata assertion is not a float-formatting test.
        var answers = new SubmitAnswer[] { new(1, "1", 0), new(2, "9", 0), new(3, "3", 0), new(4, "9", 0) };

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(
            Ctx(ownerId, name: "Ada Lovelace", email: "ada@analytical.engine"), sessionId, answers, timeTaken: 42);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.pcaexam.submitted", sessionId);
        Assert.Equal("audit.assessment.pcaexam.submitted", row.EventType);
        Assert.Equal(ownerId, row.ActorUserId);
        Assert.Equal("pca_exam_session", row.SubjectType);
        Assert.Equal(sessionId, row.SubjectId);
        Assert.Equal("success", row.Outcome);
        Assert.False(string.IsNullOrWhiteSpace(row.Id));

        Assert.NotNull(row.MetadataJson);
        using var metadata = JsonDocument.Parse(row.MetadataJson!);
        Assert.Equal(50d, metadata.RootElement.GetProperty("score").GetDouble());
        Assert.Equal(2, metadata.RootElement.GetProperty("correct").GetInt32());
        Assert.Equal(4, metadata.RootElement.GetProperty("total").GetInt32());

        AssertPiiFree(row);
    }

    /// <summary>
    /// The durable counterpart of
    /// <see cref="Submit_audit_records_the_caller_as_actor_and_the_owner_as_subject" />: a privileged
    /// role may submit another user's session (ownership is enforced at the route), and the row that
    /// outlives the log line must attribute the write to the CALLER. Recording the session owner
    /// instead would make the audit trail exonerate whoever actually pressed submit — precisely the
    /// question this table exists to answer.
    /// </summary>
    [Fact]
    public async Task Submit_audit_row_records_the_caller_as_actor_not_the_session_owner()
    {
        var ownerId = await SeedUserId();
        var callerId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        var sessionId = await SeedSessionAsync(conn, examId, ownerId, status: "InProgress", isCompleted: false);

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(callerId), sessionId, [new(1, "1", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.Ok, outcome.Status);
        var row = await _fixture.QuerySingleAuditEventAsync("audit.assessment.pcaexam.submitted", sessionId);
        Assert.Equal(callerId, row.ActorUserId);
        Assert.NotEqual(ownerId, row.ActorUserId);
    }

    /// <summary>
    /// CORPUS #18, at the audit layer: a completed session is rejected before any write, so it must
    /// persist no audit row. A row here would be worse than noise — it would record a submission that
    /// never happened against a session whose score was never touched, and a compliance reader would
    /// see two submissions where the answer key was replayed once and refused.
    /// </summary>
    [Fact]
    public async Task Submit_on_a_completed_session_persists_no_audit_event()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        var sessionId = await SeedSessionAsync(
            conn, examId, userId, status: "Completed", isCompleted: true, scorePercentage: 50, correctAnswers: 1);

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(
            Ctx(userId), sessionId, [new(1, "1", 0), new(2, "2", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.pcaexam.submitted", subjectId: sessionId));
    }

    /// <summary>
    /// The same control for the OTHER final state. A time-expired session (isCompleted=true,
    /// status='TimeExpired') is finalized by Node's /complete, not by this writer; a submit against it
    /// is refused, and refusing it must also mean persisting nothing.
    /// </summary>
    [Fact]
    public async Task Submit_on_a_time_expired_session_persists_no_audit_event()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "TimeExpired", isCompleted: true);

        var (writer, _) = MakeWriter();
        var outcome = await writer.SubmitExamAsync(Ctx(userId), sessionId, [new(1, "1", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.AlreadyCompleted, outcome.Status);
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.pcaexam.submitted", subjectId: sessionId));
    }

    /// <summary>
    /// Exactly-once, at the audit layer. Two concurrent submits are serialized by the row lock and only
    /// one scores; the loser 409s. The audit table must show that — one graded exam, one row — or every
    /// double-click during a timed assessment would look like a repeated submission after the fact.
    /// </summary>
    [Fact]
    public async Task Two_concurrent_submits_persist_exactly_one_audit_event()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "InProgress", isCompleted: false);

        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();
        var answers = new SubmitAnswer[] { new(1, "1", 0), new(2, "2", 0) };

        var results = await Task.WhenAll(
            writerA.SubmitExamAsync(Ctx(userId), sessionId, answers, timeTaken: 1),
            writerB.SubmitExamAsync(Ctx(userId), sessionId, answers, timeTaken: 1));

        Assert.Equal(1, results.Count(r => r.Status == PcaExamWriteStatus.Ok));
        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.pcaexam.submitted", subjectId: sessionId));
    }

    [Fact]
    public async Task Submit_on_a_nonexistent_session_is_session_not_found()
    {
        var userId = await SeedUserId();
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitExamAsync(Ctx(userId), "no-such-session", [new(1, "1", 0)], timeTaken: 1);

        Assert.Equal(PcaExamWriteStatus.SessionNotFound, outcome.Status);
    }

    [Fact]
    public async Task Two_concurrent_submits_score_exactly_once()
    {
        var userId = await SeedUserId();
        await using var conn = await _dataSource.OpenConnectionAsync();
        var examId = await SeedExamAsync(conn, name: "Pattern", type: "PatternRecognition", timeLimitMinutes: 5);
        await SeedQuestionAsync(conn, examId, 1, 1);
        await SeedQuestionAsync(conn, examId, 2, 2);
        var sessionId = await SeedSessionAsync(conn, examId, userId, status: "InProgress", isCompleted: false);

        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();
        var answers = new SubmitAnswer[] { new(1, "1", 0), new(2, "2", 0) };

        var results = await Task.WhenAll(
            writerA.SubmitExamAsync(Ctx(userId), sessionId, answers, timeTaken: 1),
            writerB.SubmitExamAsync(Ctx(userId), sessionId, answers, timeTaken: 1));

        // Exactly one submit wins; the loser sees the completed row (FOR UPDATE serialized) and 409s.
        Assert.Equal(1, results.Count(r => r.Status == PcaExamWriteStatus.Ok));
        Assert.Equal(1, results.Count(r => r.Status == PcaExamWriteStatus.AlreadyCompleted));
        Assert.Equal(2, await CountAnswersAsync(sessionId)); // only the winner's rows (no duplicates)
        Assert.Equal("Completed", (await ReadSessionAsync(sessionId)).Status);
    }

    // ========================================================================= helpers

    private (PcaExamWriter Writer, CapturingLogger Logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        return (new PcaExamWriter(factory, AuditWriter(factory), logger), logger);
    }

    /// <summary>
    /// The real <see cref="AuditEventWriter"/> (formmaps#52 Task 11), never a fake: the thing under test
    /// is that a start/submit lands a row in <c>audit_events</c>, and a substituted writer would make
    /// that assertion about the substitute instead. Its own logger is NullLogger — audit-write failures
    /// are fail-soft and land on THAT logger, not on this class's CapturingLogger, which asserts the
    /// log-line half.
    /// </summary>
    private static AuditEventWriter AuditWriter(NpgsqlFormMapsDatabaseSessionFactory factory) =>
        new(factory, NullLogger<AuditEventWriter>.Instance);

    private static RequestContext Ctx(string userId, string? name = null, string? email = null) =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", email ?? $"{userId}@e.st", name ?? "Test User"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    /// <summary>
    /// The persisted row must contain no PII even when the actor in scope carries a real name and
    /// email — <c>audit_events</c> is append-only and retained indefinitely, so a leak here is
    /// permanent. Every written column is concatenated so a leak into ANY of them fails, not just the
    /// one a future reader thought to check.
    /// </summary>
    private static void AssertPiiFree(PcaExamWriteDatabaseFixture.AuditEventRow row)
    {
        var serialized = string.Join("|", row.Id, row.EventType, row.ActorUserId, row.ActorRole,
            row.SchoolId, row.SubjectType, row.SubjectId, row.Outcome, row.MetadataJson);
        Assert.DoesNotContain("Ada Lovelace", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("ada@analytical.engine", serialized, StringComparison.Ordinal);
    }

    private async Task<string> SeedUserId() => await Task.FromResult("u-" + Guid.NewGuid().ToString("N"));

    private static async Task<string> SeedExamAsync(
        NpgsqlConnection conn, string name, string type, int timeLimitMinutes)
    {
        var examId = "e-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exams" ("id", "name", "type", "timeLimitMinutes", "updatedAt")
            VALUES (@id, @name, @type::"ExamType", @tlm, now())
            """,
            conn);
        cmd.Parameters.AddWithValue("id", examId);
        cmd.Parameters.AddWithValue("name", name);
        cmd.Parameters.AddWithValue("type", type);
        cmd.Parameters.AddWithValue("tlm", timeLimitMinutes);
        await cmd.ExecuteNonQueryAsync();
        return examId;
    }

    private static async Task SeedQuestionAsync(
        NpgsqlConnection conn, string examId, int questionNumber, int correctAnswer, bool isActive = true)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_questions"
                ("id", "examId", "questionNumber", "questionText", "type", "data", "correctAnswer", "isActive", "updatedAt")
            VALUES (@id, @examId, @qn, @text, 'PatternRecognition'::"ExamType", '{}'::jsonb, @ca, @active, now())
            """,
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("examId", examId);
        cmd.Parameters.AddWithValue("qn", questionNumber);
        cmd.Parameters.AddWithValue("text", $"Q{questionNumber}");
        cmd.Parameters.AddWithValue("ca", correctAnswer);
        cmd.Parameters.AddWithValue("active", isActive);
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task<string> SeedSessionAsync(
        NpgsqlConnection conn, string examId, string userId, string status, bool isCompleted,
        double scorePercentage = 0, int correctAnswers = 0)
    {
        var sessionId = "s-" + Guid.NewGuid().ToString("N");
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_sessions"
                ("id", "examId", "userId", "examName", "examType", "startTime", "totalQuestions",
                 "correctAnswers", "scorePercentage", "isCompleted", "status", "updatedAt")
            VALUES (@id, @examId, @uid, 'Pattern', 'PatternRecognition'::"ExamType", now(), 0,
                    @correct, @score, @completed, @status::"ExamStatus", now())
            """,
            conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("examId", examId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("correct", correctAnswers);
        cmd.Parameters.AddWithValue("score", scorePercentage);
        cmd.Parameters.AddWithValue("completed", isCompleted);
        cmd.Parameters.AddWithValue("status", status);
        await cmd.ExecuteNonQueryAsync();
        return sessionId;
    }

    private static async Task SeedAnswerAsync(NpgsqlConnection conn, string sessionId, int questionNumber, string userAnswer)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO "pca_exam_answers" ("id", "sessionId", "questionNumber", "userAnswer", "isAnswered", "updatedAt")
            VALUES (@id, @sid, @qn, @ua, true, now())
            """,
            conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("qn", questionNumber);
        cmd.Parameters.AddWithValue("ua", userAnswer);
        await cmd.ExecuteNonQueryAsync();
    }

    private async Task<int> CountSessionsAsync(string userId, string examId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*) FROM "pca_exam_sessions" WHERE "userId" = @uid AND "examId" = @examId""", conn);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("examId", examId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<int> CountAnswersAsync(string sessionId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*) FROM "pca_exam_answers" WHERE "sessionId" = @sid""", conn);
        cmd.Parameters.AddWithValue("sid", sessionId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    private async Task<AnswerRow> ReadAnswerAsync(string sessionId, int questionNumber)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "userAnswer", "correctAnswer", "isCorrect", "isAnswered", "timeSpent"
            FROM "pca_exam_answers" WHERE "sessionId" = @sid AND "questionNumber" = @qn
            """,
            conn);
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("qn", questionNumber);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new AnswerRow(
            UserAnswer: reader.IsDBNull(0) ? null : reader.GetString(0),
            CorrectAnswer: reader.IsDBNull(1) ? null : reader.GetString(1),
            IsCorrect: reader.GetBoolean(2),
            IsAnswered: reader.GetBoolean(3),
            TimeSpent: reader.GetInt32(4));
    }

    private async Task<SessionRow> ReadSessionAsync(string sessionId)
    {
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "examId", "status"::text, "isCompleted", "totalQuestions", "questionsAnswered",
                   "correctAnswers", "incorrectAnswers", "unansweredQuestions", "scorePercentage",
                   "accuracyPercentage", "totalTimeSpent", "endTime", "updatedAt"
            FROM "pca_exam_sessions" WHERE "id" = @id
            """,
            conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new SessionRow(
            ExamId: reader.GetString(0),
            Status: reader.GetString(1),
            IsCompleted: reader.GetBoolean(2),
            TotalQuestions: reader.GetInt32(3),
            QuestionsAnswered: reader.GetInt32(4),
            CorrectAnswers: reader.GetInt32(5),
            IncorrectAnswers: reader.GetInt32(6),
            UnansweredQuestions: reader.GetInt32(7),
            ScorePercentage: reader.GetDouble(8),
            AccuracyPercentage: reader.GetDouble(9),
            TotalTimeSpent: reader.IsDBNull(10) ? null : reader.GetInt32(10),
            EndTime: reader.IsDBNull(11) ? null : reader.GetDateTime(11),
            UpdatedAt: reader.GetDateTime(12));
    }

    private sealed record AnswerRow(string? UserAnswer, string? CorrectAnswer, bool IsCorrect, bool IsAnswered, int TimeSpent);

    private sealed record SessionRow(
        string ExamId, string Status, bool IsCompleted, int TotalQuestions, int QuestionsAnswered,
        int CorrectAnswers, int IncorrectAnswers, int UnansweredQuestions, double ScorePercentage,
        double AccuracyPercentage, int? TotalTimeSpent, DateTime? EndTime, DateTime UpdatedAt);

    private sealed class CapturingLogger : ILogger<PcaExamWriter>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        IDisposable? ILogger.BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
