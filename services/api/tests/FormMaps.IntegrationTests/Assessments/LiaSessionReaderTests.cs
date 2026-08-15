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
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionReader"/> — ported from legacy checkAccess /
/// getSession / the practice-questions fetch inside getSession (services/lia/lia-session-service.ts).
/// Pins: locked-session reporting, fresh-user full access with no existing session, lazy expiry via
/// <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/> (including the correctness-patch behavior
/// where a lazily-expired LAST subtest computes/persists real scores and audit-logs only after the
/// commit succeeds — mirroring LiaSessionStartTests'/LiaAnswerSubmitTests' equivalent coverage), and
/// uniform IDOR-safe null for practice-questions on a nonexistent/not-owned session.
/// </summary>
public sealed class LiaSessionReaderTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaSessionReaderTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
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
    // GetAccessAsync
    // ==============================================================================================

    [Fact]
    public async Task Access_reports_locked_true_for_a_locked_in_progress_session()
    {
        var (userId, _) = await SeedLockedSessionAsync(); // reuse Task 3's helper.
        var (reader, _, _) = MakeReaderAndWriter();

        var access = await reader.GetAccessAsync(Ctx(userId), userId);

        Assert.True(access.HasAccess);
        Assert.True(access.Locked);
    }

    [Fact]
    public async Task Access_reports_full_access_with_no_existing_session_for_a_fresh_user()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (reader, _, _) = MakeReaderAndWriter();

        var access = await reader.GetAccessAsync(Ctx(userId), userId);

        Assert.True(access.HasAccess);
        Assert.False(access.HasCompleted);
        Assert.Null(access.ExistingSessionId);
    }

    // ==============================================================================================
    // GetSessionAsync (lazy expiry, delegated to ILiaSessionWriter.ReadWithLazyExpiryAsync)
    // ==============================================================================================

    [Fact]
    public async Task Get_session_lazily_applies_expiry_before_returning()
    {
        var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
        var (reader, _, _) = MakeReaderAndWriter();

        var detail = await reader.GetSessionAsync(Ctx(userId), sessionId, userId);

        Assert.NotNull(detail);
        Assert.NotEqual("pattern_recognition", detail!.CurrentSubtest); // advanced past the expired subtest.
    }

    // ------------------------------------------------------------------------------------------
    // Correctness-patch coverage (mirrors LiaSessionStartTests'/LiaAnswerSubmitTests' equivalent
    // "timeout on the last subtest" tests): a lazy expiry discovered by a plain GET can genuinely
    // complete the assessment when it happens to close out the LAST subtest — legacy getSession calls
    // expireIfPastDeadline, which calls applyTimeout -> advancePastSubtest, and if that finishes the
    // assessment, legacy calls completeSession() inline. Must persist REAL scores (not just a status
    // flip) and emit the SAME audit-log format every other completion call site uses, only AFTER the
    // commit succeeds.
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
    public async Task GetSession_completing_the_last_subtest_via_lazy_expiry_persists_real_scores_and_audits_after_commit()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past visual_rotation's 300s + grace.
        var (userId, sessionId) = await SeedLastSubtestExpiredWithFullPriorCoverageAsync(startedAt);
        var (reader, _, logger) = MakeReaderAndWriter();

        var detail = await reader.GetSessionAsync(Ctx(userId), sessionId, userId);

        Assert.NotNull(detail);
        Assert.Equal("completed", detail!.Status);

        var (status, rawScoresJson, finalScoresJson, percentilesJson) = await ReadScoringColumnsAsync(sessionId);
        Assert.Equal("completed", status);
        AssertHasAllFiveSubtestKeys(rawScoresJson, "raw_scores");
        AssertHasAllFiveSubtestKeys(finalScoresJson, "final_scores");
        AssertHasAllFiveSubtestKeys(percentilesJson, "percentiles");

        // Same PII-free audit event CompleteAsync/StartAsync/SubmitAnswerAsync/HandleTimeoutAsync emit,
        // fired only after the commit succeeds.
        var audit = Assert.Single(
            logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, audit.Level);
        Assert.Contains(sessionId, audit.Message, StringComparison.Ordinal);
        Assert.Contains(userId, audit.Message, StringComparison.Ordinal);

        // ...and the audit-events retrofit (plan Task 8 of formmaps#52): a completion discovered by a
        // plain GET is still a completion, and must persist a durable row like every other path.
        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.lia.completed", sessionId));

        // formmaps#144: a lazy expiry that completes the assessment fires the polyglot insights
        // trigger exactly once, for the session OWNER (a plain GET still completes on their behalf).
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, fire.UserId);
        Assert.Equal("assessment.lia.completed", fire.Source);
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Important #2: ReadWithLazyExpiryAsync's ownership check (nonexistent-session -> null,
    // wrong-owner -> null) is new, IDOR-relevant code that had zero coverage — every other GetSessionAsync
    // test uses the owning user. Mirrors GetPracticeQuestions_returns_null_for_a_nonexistent_or_not_owned_session.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task GetSession_returns_null_for_a_nonexistent_or_not_owned_session()
    {
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (_, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition"); // owned by a different user.
        var (reader, _, _) = MakeReaderAndWriter();

        Assert.Null(await reader.GetSessionAsync(Ctx(attackerId), Guid.NewGuid().ToString(), attackerId));
        Assert.Null(await reader.GetSessionAsync(Ctx(attackerId), sessionId, attackerId));
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Important #3: pins the invariant that a plain GET against a session whose clock has
    // NOT expired never emits a completion audit log — the audit-log call is correctly nested inside
    // the expiry-detected branch today, but nothing proved it; a future refactor could accidentally move
    // it out and fire a spurious "completed" audit on every read.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task GetSession_on_a_session_with_a_live_clock_never_emits_a_completion_audit_log()
    {
        var startedAt = DateTime.UtcNow.AddSeconds(-10); // well within pattern_recognition's 180s + grace.
        var (userId, sessionId) = await SeedInProgressSubtestSessionAsync(
            subtest: "pattern_recognition", currentItem: 1, subtestStartedAt: startedAt);
        var (reader, _, logger) = MakeReaderAndWriter();

        var detail = await reader.GetSessionAsync(Ctx(userId), sessionId, userId);

        Assert.NotNull(detail);
        Assert.Equal("pattern_recognition", detail!.CurrentSubtest); // untouched — the clock has not expired.
        Assert.DoesNotContain(
            logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));

        // Negative control for the retrofit: no log line AND no persisted row. A durable audit table is
        // strictly worse than none if a plain read can append a spurious "completed" to it.
        Assert.Equal(0, await _fixture.CountAuditEventsAsync("audit.assessment.lia.completed", sessionId));
    }

    // ==============================================================================================
    // GetPracticeQuestionsAsync
    // ==============================================================================================

    [Fact]
    public async Task GetPracticeQuestions_returns_null_for_a_nonexistent_or_not_owned_session()
    {
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (_, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition"); // owned by a different user.
        var (reader, _, _) = MakeReaderAndWriter();

        Assert.Null(await reader.GetPracticeQuestionsAsync(Ctx(attackerId), Guid.NewGuid().ToString(), attackerId));
        Assert.Null(await reader.GetPracticeQuestionsAsync(Ctx(attackerId), sessionId, attackerId));
    }

    // ==============================================================================================
    // Helpers — MakeReaderAndWriter/Ctx/SeedUserAsync/SeedInProgressSessionAsync/SeedLockedSessionAsync
    // copied verbatim from LiaSessionStartTests.cs; SeedInProgressSessionExpiredAsync copied verbatim
    // from LiaAnswerSubmitTests.cs; SeedLastSubtestExpiredWithFullPriorCoverageAsync/
    // SeedFullyAnsweredResponsesAsync/ReadScoringColumnsAsync/AssertHasAllFiveSubtestKeys copied
    // verbatim from LiaSessionStartTests.cs (same fixture, same DI wiring; every test class in this
    // directory sharing LiaWriteDatabaseFixture keeps these identical).
    // ==============================================================================================

    // Shared across every writer a single test creates, so a test can assert on the insights-trigger
    // fires (or their absence) regardless of which writer instance completed the session (formmaps#144).
    private readonly RecordingInsightsTrigger _insightsTrigger = new();

    private (ILiaSessionReader reader, ILiaSessionWriter writer, CapturingLogger logger) MakeReaderAndWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        var resolver = new LiaQuestionIdResolver(
            factory, _catalogCache, NullLogger<LiaQuestionIdResolver>.Instance);
        var writer = new LiaSessionWriter(factory, resolver, AuditWriter(factory), _insightsTrigger, logger);
        var reader = new LiaSessionReader(factory, writer, resolver);
        return (reader, writer, logger);
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

    private async Task<(string UserId, string SessionId)> SeedInProgressSessionAsync(
        int reentryCount, DateTime? subtestStartedAt = null)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        var subtestTimes = subtestStartedAt is { } st
            ? $$$"""{"pattern_recognition":{"startedAt":"{{{st:o}}}"}}"""
            : "{}";
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times,
                 "reentryCount", language, updated_at)
            VALUES (@id, @userId, 'in_progress', 'pattern_recognition', 1, '{"pattern_recognition":true}'::jsonb,
                    @subtestTimes::jsonb, @reentryCount, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtestTimes", subtestTimes);
        cmd.Parameters.AddWithValue("reentryCount", reentryCount);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    private async Task<(string UserId, string SessionId)> SeedLockedSessionAsync()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 4);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """UPDATE lia_assessment_sessions SET "lockedAt" = now() WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    /// <summary>Seeds an in_progress session mid-subtest with a live (unexpired) clock, at the given current_item.</summary>
    private async Task<(string UserId, string SessionId)> SeedInProgressSubtestSessionAsync(
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
        SeedInProgressSubtestSessionAsync(subtest, currentItem: 1, subtestStartedAt: DateTime.UtcNow.AddHours(-1));

    /// <summary>
    /// Seeds an in_progress session sitting on visual_rotation (the LAST subtest) with an already-
    /// expired clock, subtest_times already showing the 4 PRIOR subtests ended, and full response
    /// coverage (correct+incorrect, no unanswered) for those 4 prior subtests. visual_rotation itself
    /// has NO responses yet — the lazy-expiry path is expected to fill all of them as null timeouts.
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

    /// <summary>Captures log entries (shared pattern with LiaSessionStartTests's/LiaAnswerSubmitTests's CapturingLogger).</summary>
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
