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
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionWriter.SubmitAnswerAsync"/> and
/// <see cref="LiaSessionWriter.SubmitPracticeAnswerAsync"/> — ported from legacy submitAnswer /
/// submitPracticeAnswer (services/lia/lia-response-service.ts). Pins: resubmit-does-not-advance,
/// timeout-preempts-persistence (sharing Task 3's ExpireIfPastDeadlineAsync/AdvancePastSubtestAsync),
/// subtest-completion advance, practice correctness + next-question serving, practice completion, and
/// uniform IDOR-safe not-found handling. Also pins the correctness-patch behavior (commit e09c8b7/3d5d501):
/// a submitted answer that happens to time out the assessment's LAST subtest must thread the REAL scored
/// LiaCompletionResult into AnswerResult.Completion and audit-log only AFTER the commit succeeds.
/// </summary>
public sealed class LiaAnswerSubmitTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaAnswerSubmitTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
    // Shared, PRE-WARMED question-catalog cache (one per test class, mirroring the process-wide
    // singleton production registers). Warming in InitializeAsync matters for the concurrency tests:
    // the resolver's first-load semaphore would otherwise serialize the racers at the top of
    // StartAsync, letting the first one run to completion (and commit the reentry lock) while the
    // others are still queued — an artificial ordering that is not what those tests pin, and which
    // production never sees after its first request.
    private readonly LiaQuestionCatalogCache _catalogCache = new();

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await new LiaQuestionIdResolver(
                new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
                _catalogCache,
                NullLogger<LiaQuestionIdResolver>.Instance)
            .WarmAsync(Ctx(Guid.NewGuid().ToString()));
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ==============================================================================================
    // SubmitAnswerAsync
    // ==============================================================================================

    [Fact]
    public async Task Submitting_a_new_answer_persists_it_and_advances_current_item()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 1);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "0", 500);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.Equal(1, outcome.Result!.ItemsCompleted);
        Assert.Equal(60, outcome.Result.TotalItems);
        Assert.False(outcome.Result.SubtestComplete);
        Assert.Null(outcome.Result.NextSubtest);
        Assert.False(outcome.Result.AssessmentComplete);

        Assert.True(await ResponseExistsAsync(sessionId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), withRealAnswer: true));
        Assert.Equal(2, await ReadCurrentItemAsync(sessionId));
    }

    [Fact]
    public async Task Resubmitting_an_already_answered_item_updates_the_response_but_does_not_advance()
    {
        var (userId, sessionId) = await SeedInProgressWithOneAnsweredAsync(
            subtest: "pattern_recognition", questionId: _fixture.QuestionId("pattern_recognition", 1, isPractice: false));
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "X", 500);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.Equal(1, outcome.Result!.ItemsCompleted); // unchanged — the resubmit must not increment currentItem.
        Assert.Equal(2, await ReadCurrentItemAsync(sessionId)); // unchanged.
        Assert.Equal("X", await ReadUserAnswerAsync(sessionId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false)));
    }

    [Fact]
    public async Task Submitting_the_last_item_of_a_subtest_advances_to_the_next_subtest()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 60);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 60, isPractice: false), "1", 500);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.SubtestComplete);
        Assert.Equal("verbal_reasoning", outcome.Result.NextSubtest);
        Assert.False(outcome.Result.AssessmentComplete);

        var (status, currentSubtest) = await ReadSessionStatusAsync(sessionId);
        Assert.Equal("practice", status);
        Assert.Equal("verbal_reasoning", currentSubtest);
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Important: the current_item UPDATE used to write a pre-computed absolute value
    // ("row.CurrentItem + 1") from an unlocked read taken earlier in the method — two concurrent
    // submits of two DIFFERENT unanswered items could both read current_item = N and both write
    // N + 1, silently losing one item's advance. The fix makes the upsert report "was this a fresh
    // insert" via the "xmax" = 0 idiom and the current_item write a genuine atomic SQL increment
    // ("current_item" = "current_item" + 1) guarded by status = 'in_progress', with FOR UPDATE on
    // the session SELECT serializing the two concurrent transactions. This must count BOTH
    // advances, not just one.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Concurrent_submits_of_two_different_items_both_advance_current_item_without_losing_one()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 1);
        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();

        await Task.WhenAll(
            writerA.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "0", 100),
            writerB.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 2, isPractice: false), "0", 100));

        // Both items are now answered and current_item must reflect BOTH advances (1 -> 3), never
        // just one (the lost-update bug this fix addresses would land on 2, not 3).
        Assert.Equal(3, await ReadCurrentItemAsync(sessionId));
        Assert.True(await ResponseExistsAsync(sessionId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), withRealAnswer: true));
        Assert.True(await ResponseExistsAsync(sessionId, _fixture.QuestionId("pattern_recognition", 2, isPractice: false), withRealAnswer: true));
    }

    [Fact]
    public async Task Submitting_past_the_deadline_times_out_instead_of_persisting_the_answer()
    {
        var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.TimedOut);
        // The late answer must NOT be persisted as a real response.
        Assert.False(await ResponseExistsAsync(sessionId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), withRealAnswer: true));
    }

    // ------------------------------------------------------------------------------------------
    // Correctness-patch coverage (commit e09c8b7/3d5d501): a submitted answer that happens to time
    // out the LAST subtest must persist REAL scores (not a status flip), thread them into
    // AnswerResult.Completion, and audit-log only after the commit succeeds — mirroring
    // LiaSessionStartTests' "Timeout_on_the_last_subtest_computes_and_persists_real_scores..." but
    // driven through SubmitAnswerAsync's own timeout branch instead of StartAsync's Gate 2.
    // ------------------------------------------------------------------------------------------
    private static readonly IReadOnlyDictionary<string, (int Correct, int Incorrect)> PriorSubtestCounts =
        new Dictionary<string, (int, int)>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (50, 10),
            ["verbal_reasoning"] = (40, 10),
            ["numerical_speed"] = (45, 15),
            ["working_memory"] = (55, 5),
        };

    [Fact]
    public async Task Timeout_on_the_last_subtest_via_submit_answer_threads_real_completion_and_audits_after_commit()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past visual_rotation's 300s + grace.
        var (userId, sessionId) = await SeedLastSubtestExpiredWithFullPriorCoverageAsync(startedAt);
        var (writer, logger) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("visual_rotation", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.TimedOut);
        Assert.True(outcome.Result.AssessmentComplete);
        Assert.Equal("completed", outcome.Result.SessionStatus);

        // The correctness-patch requirement: AnswerResult.Completion must carry the REAL scored result,
        // not stay null, so a client can display final scores immediately.
        var completion = outcome.Result.Completion;
        Assert.NotNull(completion);
        Assert.NotEqual("insufficient", completion!.PerformanceLevel);
        Assert.NotEqual(0d, completion.GlobalPercentile);

        var (status, rawScoresJson, finalScoresJson, percentilesJson) = await ReadScoringColumnsAsync(sessionId);
        Assert.Equal("completed", status);
        AssertHasAllFiveSubtestKeys(rawScoresJson, "raw_scores");
        AssertHasAllFiveSubtestKeys(finalScoresJson, "final_scores");
        AssertHasAllFiveSubtestKeys(percentilesJson, "percentiles");

        // Audit only after the commit — same event CompleteAsync/StartAsync's Gate 2 emit.
        var audit = Assert.Single(
            logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, audit.Level);
        Assert.Contains(sessionId, audit.Message, StringComparison.Ordinal);
        Assert.Contains(userId, audit.Message, StringComparison.Ordinal);

        // ...and the audit-events retrofit (plan Task 8 of formmaps#52): this completion path must
        // persist a durable row too, not just the log line.
        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.lia.completed", sessionId));

        // formmaps#144: SubmitAnswerAsync's timeout branch is a completion path too — it must fire
        // the polyglot insights trigger exactly once, for the owner, alongside that audit event.
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, fire.UserId);
        Assert.Equal("assessment.lia.completed", fire.Source);
    }

    [Fact]
    public async Task Rejects_with_uniform_NotFound_for_a_nonexistent_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), Guid.NewGuid().ToString(), userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Rejects_with_uniform_NotFound_when_the_session_belongs_to_someone_else()
    {
        var (_, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 1);
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(attackerId), sessionId, attackerId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Rejects_when_the_session_is_not_in_progress()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.NotInProgress, outcome.Status);
    }

    [Fact]
    public async Task Rejects_when_the_question_does_not_belong_to_the_current_subtest()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 1);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("verbal_reasoning", 1, isPractice: false), "A", 100);

        Assert.Equal(LiaSubmitAnswerStatus.QuestionNotFound, outcome.Status);
    }

    // ==============================================================================================
    // SubmitPracticeAnswerAsync
    // ==============================================================================================

    [Fact]
    public async Task Practice_answer_reports_correctness_and_serves_the_next_practice_question()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.Ok, outcome.Status);
        Assert.NotNull(outcome.Result);
        Assert.False(outcome.Result!.PracticeComplete);
        Assert.NotNull(outcome.Result.NextQuestion);
        Assert.Equal(2, outcome.Result.NextQuestion!.ItemNumber);
    }

    [Fact]
    public async Task Last_practice_answer_marks_practice_complete_and_serves_no_next_question()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 3, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.PracticeComplete);
        Assert.Null(outcome.Result.NextQuestion);
        Assert.True(await ReadPracticeCompletedAsync(sessionId, "pattern_recognition"));
    }

    [Fact]
    public async Task Practice_answer_rejects_with_uniform_NotFound_for_a_nonexistent_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), Guid.NewGuid().ToString(), userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Practice_answer_rejects_with_uniform_NotFound_when_the_session_belongs_to_someone_else()
    {
        var (_, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(attackerId), sessionId, attackerId, _fixture.QuestionId("pattern_recognition", 1, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Practice_answer_rejects_when_the_session_is_not_in_the_practice_phase()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest: "pattern_recognition", currentItem: 1);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 1, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.NotInPractice, outcome.Status);
    }

    [Fact]
    public async Task Practice_answer_rejects_when_the_question_is_not_found()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, Guid.NewGuid().ToString(), "0");

        Assert.Equal(LiaPracticeAnswerStatus.QuestionNotFound, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Critical: SubmitPracticeAnswerAsync's only validation used to be `question is
    // null` — an ASSESSMENT-shaped id (e.g. "pattern_recognition:7:assessment") resolved just fine
    // via LiaQuestionServing.FindById and leaked the entire timed-subtest answer key through
    // PracticeAnswerResult.CorrectAnswer before the candidate's clock ever started. Must reject with
    // the same uniform QuestionNotFound as every other invalid-question case.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Practice_answer_rejects_an_assessment_shaped_question_id_and_does_not_leak_its_answer_key()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("pattern_recognition", 7, isPractice: false), "0");

        Assert.Equal(LiaPracticeAnswerStatus.QuestionNotFound, outcome.Status);
        Assert.Null(outcome.Result);
        // Must not have leaked practice_completed[pattern_recognition] = true off the back of an
        // assessment-item submission either (the practice-gate-bypass consequence of the same bug).
        Assert.False(await ReadPracticeCompletedAsync(sessionId, "pattern_recognition"));
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Critical (continued): a practice id from a DIFFERENT subtest than the session's
    // current one must also be rejected — otherwise a session sitting on pattern_recognition's
    // practice phase could mark visual_rotation's practice complete (and read ITS keys) by
    // submitting "visual_rotation:3:practice".
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Practice_answer_rejects_a_practice_question_from_a_different_subtest_than_the_sessions_current_one()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.SubmitPracticeAnswerAsync(Ctx(userId), sessionId, userId, _fixture.QuestionId("visual_rotation", 3, isPractice: true), "0");

        Assert.Equal(LiaPracticeAnswerStatus.QuestionNotFound, outcome.Status);
        Assert.False(await ReadPracticeCompletedAsync(sessionId, "visual_rotation"));
    }

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx/SeedUserAsync copied verbatim from LiaSessionStartTests.cs /
    // LiaSubtestStartTests.cs (same fixture, same DI wiring; every test class in this directory
    // sharing LiaWriteDatabaseFixture keeps these identical).
    // ==============================================================================================

    // Shared across every writer a single test creates, so a test can assert on the insights-trigger
    // fires (or their absence) regardless of which writer instance completed the session (formmaps#144).
    private readonly RecordingInsightsTrigger _insightsTrigger = new();

    private (ILiaSessionWriter writer, CapturingLogger logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        var resolver = new LiaQuestionIdResolver(
            factory, _catalogCache, NullLogger<LiaQuestionIdResolver>.Instance);
        return (new LiaSessionWriter(factory, resolver, AuditWriter(factory), _insightsTrigger, logger), logger);
    }

    /// <summary>
    /// The real <see cref="AuditEventWriter"/> (formmaps#52 Task 8), never a fake: the thing under test
    /// is that a completion lands a row in <c>audit_events</c>, and a substituted writer would make that
    /// assertion about the substitute. Its own logger is NullLogger — audit-write failures are fail-soft
    /// and land on that logger, not on this class's CapturingLogger, which asserts the log-line half.
    /// </summary>
    private static AuditEventWriter AuditWriter(NpgsqlFormMapsDatabaseSessionFactory factory) =>
        new(factory, NullLogger<AuditEventWriter>.Instance);

    private static RequestContext Ctx(string userId, string name = "Test User", string email = "test@e.st") =>
        RequestContext.Authenticated(
            new RequestActor(userId, "student", email, name),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    private async Task SeedUserAsync(string userId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            "INSERT INTO users (id, name, email) VALUES (@id, 'Test', 'test@formmaps.dev') ON CONFLICT (id) DO NOTHING", conn);
        cmd.Parameters.AddWithValue("id", userId);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>Seeds an in_progress session mid-subtest with a live (unexpired) clock, at the given current_item.</summary>
    private async Task<(string UserId, string SessionId)> SeedInProgressSessionAsync(
        string subtest, int currentItem, DateTime? subtestStartedAt = null)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        var startedAt = subtestStartedAt ?? DateTime.UtcNow.AddSeconds(-10);
        var subtestTimes = $$$"""{"{{{subtest}}}":{"startedAt":"{{{startedAt:o}}}"}}""";
        var practiceCompleted = $$"""{"{{subtest}}":true}""";

        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times, language, updated_at)
            VALUES (@id, @userId, 'in_progress', @subtest::"LiaSubtest", @currentItem, @practiceCompleted::jsonb,
                    @subtestTimes::jsonb, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        cmd.Parameters.AddWithValue("currentItem", currentItem);
        cmd.Parameters.AddWithValue("practiceCompleted", practiceCompleted);
        cmd.Parameters.AddWithValue("subtestTimes", subtestTimes);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    /// <summary>Seeds an in_progress session whose subtest clock expired long ago (well past any timer + grace).</summary>
    private Task<(string UserId, string SessionId)> SeedInProgressSessionExpiredAsync(string subtest) =>
        SeedInProgressSessionAsync(subtest, currentItem: 1, subtestStartedAt: DateTime.UtcNow.AddHours(-1));

    /// <summary>Seeds an in_progress session with exactly one prior answered item (item 1 of the given subtest).</summary>
    private async Task<(string UserId, string SessionId)> SeedInProgressWithOneAnsweredAsync(string subtest, string questionId)
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(subtest, currentItem: 2);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_responses
                (id, session_id, question_id, subtest, item_number, user_answer, is_correct, answered_at, time_spent_ms, updated_at)
            VALUES (@id, @sessionId, @questionId, @subtest::"LiaSubtest", 1, 'Y', false, now(), 100, now())
            """, conn);
        cmd.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        cmd.Parameters.AddWithValue("sessionId", sessionId);
        cmd.Parameters.AddWithValue("questionId", questionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    /// <summary>Seeds a practice-phase session (status='practice') sitting on the given subtest.</summary>
    private async Task<(string UserId, string SessionId)> SeedPracticePhaseSessionAsync(string subtest)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times, language, updated_at)
            VALUES (@id, @userId, 'practice', @subtest::"LiaSubtest", 0, '{}'::jsonb, '{}'::jsonb, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    /// <summary>
    /// Seeds an in_progress session sitting on visual_rotation (the LAST subtest) with an already-
    /// expired clock, subtest_times already showing the 4 PRIOR subtests ended, and full response
    /// coverage for those 4 prior subtests. visual_rotation itself has NO responses yet — the
    /// submit-driven timeout path is expected to fill all of them as null timeouts and score for real.
    /// Mirrors LiaSessionStartTests' SeedLastSubtestExpiredWithFullPriorCoverageAsync.
    /// </summary>
    private async Task<(string UserId, string SessionId)> SeedLastSubtestExpiredWithFullPriorCoverageAsync(
        DateTime visualRotationStartedAt)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        var priorEndedAt = DateTime.UtcNow.AddHours(-2);
        var subtestTimesEntries = new List<string>();
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            if (subtest == "visual_rotation")
            {
                subtestTimesEntries.Add($$$"""
                    "visual_rotation":{"startedAt":"{{{visualRotationStartedAt:o}}}"}
                    """.Trim());
            }
            else
            {
                subtestTimesEntries.Add($$$"""
                    "{{{subtest}}}":{"startedAt":"{{{priorEndedAt.AddMinutes(-10):o}}}","endedAt":"{{{priorEndedAt:o}}}"}
                    """.Trim());
            }
        }

        var subtestTimesJson = "{" + string.Join(",", subtestTimesEntries) + "}";
        var practiceCompletedJson = JsonSerializer.Serialize(
            LiaScoring.SubtestOrder.ToDictionary(s => s, _ => true));

        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times,
                 "reentryCount", language, updated_at)
            VALUES (@id, @userId, 'in_progress', 'visual_rotation', 1, @practiceCompleted::jsonb,
                    @subtestTimes::jsonb, 0, 'es', now())
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", sessionId);
            cmd.Parameters.AddWithValue("userId", userId);
            cmd.Parameters.AddWithValue("practiceCompleted", practiceCompletedJson);
            cmd.Parameters.AddWithValue("subtestTimes", subtestTimesJson);
            await cmd.ExecuteNonQueryAsync();
        }

        foreach (var (subtest, (correct, incorrect)) in PriorSubtestCounts)
        {
            await SeedFullyAnsweredResponsesAsync(conn, sessionId, subtest, correct, incorrect);
        }

        return (userId, sessionId);
    }

    /// <summary>Inserts exactly `correct + incorrect` fully-answered (no unanswered) response rows for one subtest.</summary>
    private static async Task SeedFullyAnsweredResponsesAsync(
        NpgsqlConnection connection, string sessionId, string subtest, int correct, int incorrect)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO lia_responses
                (id, session_id, question_id, subtest, item_number, user_answer, is_correct, answered_at, time_spent_ms, updated_at)
            SELECT @sid || '-' || @sub || '-' || g, @sid, q.id, @sub::"LiaSubtest", g,
                   'x', CASE WHEN g <= @correct THEN true ELSE false END,
                   now(), 1000, now()
            FROM generate_series(1, @total) g
            -- question_id must be a REAL lia_questions.id: lia_responses now carries the production FK
            -- lia_responses_question_id_fkey, so a synthesized string is rejected here exactly as it
            -- would be in prod. Joining the (subtest, item_number, is_practice) natural key yields one
            -- row per g, preserving the per-session uniqueness lia_responses_session_id_question_id_key needs.
            JOIN lia_questions q
              ON q.subtest = @sub::"LiaSubtest" AND q.item_number = g AND q.is_practice = false
            """,
            connection);
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("sub", subtest);
        cmd.Parameters.AddWithValue("correct", correct);
        cmd.Parameters.AddWithValue("total", correct + incorrect);
        await cmd.ExecuteNonQueryAsync();
    }

    private static void AssertHasAllFiveSubtestKeys(string? json, string columnName)
    {
        Assert.False(string.IsNullOrEmpty(json), $"{columnName} must not be NULL/empty after a timeout-driven completion.");
        using var doc = JsonDocument.Parse(json!);
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            Assert.True(
                doc.RootElement.TryGetProperty(subtest, out _),
                $"{columnName} is missing an entry for '{subtest}'.");
        }
    }

    private async Task<(string Status, string? RawScores, string? FinalScores, string? Percentiles)> ReadScoringColumnsAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "status"::text, "raw_scores"::text, "final_scores"::text, "percentiles"::text
            FROM lia_assessment_sessions WHERE id = @id
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return (
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3));
    }

    private async Task<bool> ResponseExistsAsync(string sessionId, string questionId, bool withRealAnswer)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            withRealAnswer
                ? """SELECT 1 FROM lia_responses WHERE session_id = @sessionId AND question_id = @questionId AND user_answer IS NOT NULL"""
                : """SELECT 1 FROM lia_responses WHERE session_id = @sessionId AND question_id = @questionId""",
            conn);
        cmd.Parameters.AddWithValue("sessionId", sessionId);
        cmd.Parameters.AddWithValue("questionId", questionId);
        return await cmd.ExecuteScalarAsync() is not null;
    }

    private async Task<string?> ReadUserAnswerAsync(string sessionId, string questionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT user_answer FROM lia_responses WHERE session_id = @sessionId AND question_id = @questionId""", conn);
        cmd.Parameters.AddWithValue("sessionId", sessionId);
        cmd.Parameters.AddWithValue("questionId", questionId);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull or null ? null : (string)result;
    }

    private async Task<int> ReadCurrentItemAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT current_item FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<(string Status, string? CurrentSubtest)> ReadSessionStatusAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT status::text, current_subtest::text FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    private async Task<bool> ReadPracticeCompletedAsync(string sessionId, string subtest)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT COALESCE((practice_completed->>@subtest)::boolean, false) FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        return (bool)(await cmd.ExecuteScalarAsync())!;
    }

    /// <summary>Captures log entries (shared pattern with LiaSessionStartTests's/LiaSubtestStartTests's CapturingLogger).</summary>
    private sealed class CapturingLogger : ILogger<LiaSessionWriter>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = new();

        IDisposable? ILogger.BeginScope<TState>(TState state) => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
