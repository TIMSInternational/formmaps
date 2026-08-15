using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionWriter.StartSubtestAsync"/> — the one-shot
/// clock guard ported from legacy startSubtest (services/lia/lia-subtest-service.ts). Pins: the atomic
/// SQL-predicate guard rejecting BOTH a still-live and an already-ended subtest restart, the
/// practice-completed gate, and — critically — that a successful start actually PERSISTS startedAt in
/// subtest_times (not just returns it), which is exactly the class of bug jsonb_set's intermediate-path
/// no-op silently produces and which a return-value-only assertion would never catch.
/// </summary>
public sealed class LiaSubtestStartTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaSubtestStartTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
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

    [Fact]
    public async Task Rejects_restarting_a_STILL_LIVE_subtest()
    {
        var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(
            subtest: "pattern_recognition", subtestStartedAt: DateTime.UtcNow.AddSeconds(-10));
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.AlreadyStarted, outcome.Status);
    }

    [Fact]
    public async Task Rejects_restarting_an_ALREADY_ENDED_subtest()
    {
        // The bug Node's own fix initially missed: rejecting only the live case let an ENDED subtest
        // be restarted, rewinding state and destroying its endedAt/durationMs.
        var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(
            subtest: "pattern_recognition", subtestStartedAt: DateTime.UtcNow.AddMinutes(-20), subtestEnded: true);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.AlreadyStarted, outcome.Status);
    }

    [Fact]
    public async Task Starts_cleanly_when_practice_is_complete_and_the_subtest_never_started()
    {
        var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.Started, outcome.Status);
        Assert.Equal(60, outcome.Result!.Questions.Count);
    }

    [Fact]
    public async Task Rejects_when_practice_is_not_yet_marked_complete()
    {
        var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition", practiceComplete: false);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.PracticeIncomplete, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // CRITICAL: the verified jsonb_set bug this task's brief shipped with. jsonb_set only
    // auto-creates the FINAL path element, never an intermediate object, so
    // jsonb_set('{}', ARRAY[subtest, 'startedAt'], ...) silently no-ops when subtest_times has no
    // object yet under the subtest key — the COMMON case for a subtest's very first start. A test
    // that only checks outcome.Result.StartedAt would never catch this (the in-memory DTO value is
    // always correct); only a DB readback proves the write actually landed. Without this fix, a
    // second /start-subtest call would find no persisted startedAt and incorrectly succeed again,
    // and ExpireIfPastDeadlineAsync's clock check would never see a start time to expire against.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Successful_start_persists_startedAt_in_subtest_times_not_just_in_the_response()
    {
        var (userId, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.Started, outcome.Status);
        var persistedStartedAt = await ReadSubtestStartedAtAsync(sessionId, "pattern_recognition");
        Assert.NotNull(persistedStartedAt);
        Assert.Equal(outcome.Result!.StartedAt, persistedStartedAt);

        // A second call must now see the persisted startedAt and reject — proving the guard's WHERE
        // predicate actually reads what the first call wrote (the entire point of the fix).
        var second = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");
        Assert.Equal(LiaSubtestStartStatus.AlreadyStarted, second.Status);
    }

    [Fact]
    public async Task Rejects_with_uniform_NotFound_when_the_session_belongs_to_someone_else()
    {
        var (_, sessionId) = await SeedSessionWithPracticeCompletedAsync(subtest: "pattern_recognition");
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(attackerId), sessionId, attackerId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Rejects_with_uniform_NotFound_for_a_nonexistent_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartSubtestAsync(Ctx(userId), Guid.NewGuid().ToString(), userId, "pattern_recognition");

        Assert.Equal(LiaSubtestStartStatus.NotFound, outcome.Status);
    }

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx/SeedUserAsync copied verbatim from LiaSessionStartTests.cs (same
    // fixture, same DI wiring; every test class in this directory sharing LiaWriteDatabaseFixture
    // keeps these identical).
    // ==============================================================================================

    private (ILiaSessionWriter writer, CapturingLogger logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        var resolver = new LiaQuestionIdResolver(
            factory, _catalogCache, NullLogger<LiaQuestionIdResolver>.Instance);
        return (new LiaSessionWriter(factory, resolver, new RecordingInsightsTrigger(), logger), logger);
    }

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

    // mirrors SeedInProgressSessionAsync from LiaSessionStartTests.cs: seeds a "practice" session with
    // practice_completed[subtest] set as requested, and optionally a subtest_times entry for the target
    // subtest carrying startedAt (and endedAt, if subtestEnded).
    private async Task<(string UserId, string SessionId)> SeedSessionWithPracticeCompletedAsync(
        string subtest, bool practiceComplete = true, DateTime? subtestStartedAt = null, bool subtestEnded = false)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        var practiceCompletedJson = practiceComplete
            ? $$"""{"{{subtest}}":true}"""
            : "{}";

        var subtestTimes = subtestStartedAt is { } st
            ? subtestEnded
                ? $$$"""{"{{{subtest}}}":{"startedAt":"{{{st:o}}}","endedAt":"{{{st.AddMinutes(15):o}}}"}}"""
                : $$$"""{"{{{subtest}}}":{"startedAt":"{{{st:o}}}"}}"""
            : "{}";

        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times,
                 language, updated_at)
            VALUES (@id, @userId, 'practice', @subtest::"LiaSubtest", 0, @practiceCompleted::jsonb,
                    @subtestTimes::jsonb, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        cmd.Parameters.AddWithValue("practiceCompleted", practiceCompletedJson);
        cmd.Parameters.AddWithValue("subtestTimes", subtestTimes);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    private async Task<string?> ReadSubtestStartedAtAsync(string sessionId, string subtest)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT subtest_times->@subtest->>'startedAt' FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull or null ? null : (string)result;
    }

    /// <summary>Captures log entries (shared pattern with LiaSessionStartTests's CapturingLogger).</summary>
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
