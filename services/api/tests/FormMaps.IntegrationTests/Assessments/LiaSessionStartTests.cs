using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionWriter.StartAsync"/> — the reentry-lock +
/// resume/timeout gate ported from legacy startSession (services/lia/lia-session-service.ts +
/// lib/proctoring.ts). Pins: the atomic reentry-strike race (Node's own MAX_REENTRIES fix), the
/// lock-before-increment ordering, fresh-session creation, and mid-subtest resume without clock reset.
/// </summary>
public sealed class LiaSessionStartTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaSessionStartTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
    public Task InitializeAsync() { _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString); return Task.CompletedTask; }
    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ------------------------------------------------------------------------------------------
    // Adversarial #1: the atomic-increment race Node's own fix addresses. K concurrent /start
    // calls on the SAME in_progress, unlocked session must count exactly K strikes — not fewer.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Concurrent_starts_on_the_same_session_count_every_strike_atomically()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();

        const int concurrency = 5;
        var tasks = Enumerable.Range(0, concurrency)
            .Select(_ => writer.StartAsync(Ctx(userId), userId, "es"))
            .ToArray();
        await Task.WhenAll(tasks);

        var reentryCount = await ReadReentryCountAsync(sessionId);
        Assert.Equal(concurrency, reentryCount);
    }

    // ------------------------------------------------------------------------------------------
    // Adversarial #2/#3 for StartAsync's OWN gate: exceeding MAX_REENTRIES locks the session and
    // every subsequent start (even a single one) is rejected, not silently allowed through.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Exceeding_max_reentries_locks_the_session()
    {
        const int maxReentries = 3; // legacy MAX_REENTRIES (lib/proctoring.ts).
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: maxReentries);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Locked, outcome.Status);
        Assert.NotNull(await ReadLockedAtAsync(sessionId));
    }

    [Fact]
    public async Task Already_locked_session_rejects_start_without_incrementing_further()
    {
        var (userId, sessionId) = await SeedLockedSessionAsync();
        var (writer, _) = MakeWriter();

        var before = await ReadReentryCountAsync(sessionId);
        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");
        var after = await ReadReentryCountAsync(sessionId);

        Assert.Equal(LiaStartStatus.Locked, outcome.Status);
        Assert.Equal(before, after); // legacy: locked check runs BEFORE the increment.
    }

    [Fact]
    public async Task Fresh_user_with_no_session_gets_a_new_practice_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Equal("pattern_recognition", outcome.Payload!.CurrentSubtest);
        Assert.NotEmpty(outcome.Payload.PracticeQuestions);
        Assert.Null(outcome.Payload.ResumeMode); // fresh start carries no resume metadata.
    }

    [Fact]
    public async Task In_progress_session_with_a_live_clock_resumes_mid_subtest_without_resetting_it()
    {
        var startedAt = DateTime.UtcNow.AddSeconds(-30); // well within any subtest's time limit.
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0, subtestStartedAt: startedAt);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Equal("mid_subtest", outcome.Payload!.ResumeMode);
        Assert.NotNull(outcome.Payload.Questions);
        // The clock must NOT reset: started_at returned must equal what was seeded.
        Assert.Equal(
            startedAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
            DateTime.Parse(outcome.Payload.StartedAt!).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
    }

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx copied verbatim from LiaSessionWriterTests.cs (same fixture, same DI
    // wiring; every test class in this directory sharing LiaWriteDatabaseFixture keeps these identical).
    // ==============================================================================================

    private (ILiaSessionWriter writer, CapturingLogger logger) MakeWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        return (new LiaSessionWriter(factory, logger), logger);
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

    private async Task<int> ReadReentryCountAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "reentryCount" FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        return (int)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<DateTime?> ReadLockedAtAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "lockedAt" FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        var result = await cmd.ExecuteScalarAsync();
        return result is DBNull ? null : (DateTime?)result;
    }

    /// <summary>Captures log entries (shared pattern with LiaSessionWriterTests's CapturingLogger).</summary>
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
