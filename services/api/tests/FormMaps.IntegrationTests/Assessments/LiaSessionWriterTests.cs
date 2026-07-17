using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionWriter"/> — the first authored write in the
/// .NET backend. These pin the completeSession contract end-to-end against Postgres: the happy path
/// scores + persists, an already-completed session is idempotent (one write, updated_at frozen), the two
/// coverage gates reject partial sessions without writing, ownership mismatch is IDOR-safe, the audit
/// event is PII-free, and two concurrent completions cannot double-score (FOR UPDATE / TOCTOU).
///
/// Regression corpus pins (see formmaps-csharp-port-regression-corpus): #18/#25 idempotent completion —
/// no double-score/double-bill; #19 incomplete-coverage rejected; TOCTOU race safety.
/// </summary>
public sealed class LiaSessionWriterTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    // Every seeded subtest carries this many timeout-marked unanswered responses; the (correct, incorrect)
    // pairs below are chosen so correct + incorrect + Unanswered == itemCount (full coverage).
    private const int Unanswered = 10;

    // A fully-answered legitimate run: (correct, incorrect) per subtest. PR60/VB50/NS60/WM60/VR60 = 290.
    private static readonly IReadOnlyDictionary<string, (int Correct, int Incorrect)> HappyCounts =
        new Dictionary<string, (int, int)>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (40, 10),
            ["verbal_reasoning"] = (30, 10),
            ["numerical_speed"] = (35, 15),
            ["working_memory"] = (45, 5),
            ["visual_rotation"] = (30, 20),
        };

    public LiaSessionWriterTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;

    public Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

    // ----------------------------------------------------------------------------------------------
    // Happy path
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_scores_and_persists_a_fully_answered_session()
    {
        var (userId, sessionId) = await SeedRunAsync(status: "in_progress", allEnded: true, counts: HappyCounts);
        var expectedCounts = ExpectedCounts(HappyCounts);
        var expected = LiaCompletionScorer.ScoreCompletion(expectedCounts);

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(LiaCompleteStatus.Completed, outcome.Status);
        var result = Assert.IsType<LiaCompletionResult>(outcome.Result);
        Assert.Equal(sessionId, result.SessionId);
        Assert.Equal(expected.GlobalPercentile, result.GlobalPercentile);
        Assert.Equal(expected.PerformanceLevel, result.PerformanceLevel);
        Assert.Equal(expected.FinalScores.OrderBy(k => k.Key), result.FinalScores.OrderBy(k => k.Key));
        Assert.Equal(expected.Percentiles.OrderBy(k => k.Key), result.Percentiles.OrderBy(k => k.Key));
        Assert.Equal(expectedCounts["pattern_recognition"].Correct, result.ResponseCounts["pattern_recognition"].Correct);
        Assert.Equal(expectedCounts["pattern_recognition"].Unanswered, result.ResponseCounts["pattern_recognition"].Unanswered);
        // completed_at is an ISO-8601 UTC 'Z' string with millisecond precision.
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$", result.CompletedAt);

        // The durable row reflects the same scored bundle.
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("completed", row.Status);
        Assert.NotNull(row.CompletedAt);
        Assert.Equal(expected.GlobalPercentile, row.GlobalPercentile);
        Assert.Equal(expected.PerformanceLevel, row.PerformanceLevel);
        var persistedFinal = DeserializeDoubles(row.FinalScores);
        Assert.Equal(expected.FinalScores.OrderBy(k => k.Key), persistedFinal.OrderBy(k => k.Key));
    }

    // ----------------------------------------------------------------------------------------------
    // Idempotency — corpus #18/#25: a completed session is never rescored (no double-score / double-bill).
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_twice_is_idempotent_one_write_updated_at_frozen()
    {
        var (userId, sessionId) = await SeedRunAsync(status: "in_progress", allEnded: true, counts: HappyCounts);
        var (writer, _) = MakeWriter();

        var first = await writer.CompleteAsync(Ctx(userId), sessionId, userId);
        var updatedAtAfterFirst = (await ReadSessionAsync(sessionId)).UpdatedAt;

        var second = await writer.CompleteAsync(Ctx(userId), sessionId, userId);
        var updatedAtAfterSecond = (await ReadSessionAsync(sessionId)).UpdatedAt;

        Assert.Equal(LiaCompleteStatus.Completed, first.Status);
        Assert.Equal(LiaCompleteStatus.Completed, second.Status);
        // Identical results — the replay returns the stored scores verbatim.
        Assert.Equal(first.Result!.GlobalPercentile, second.Result!.GlobalPercentile);
        Assert.Equal(first.Result!.PerformanceLevel, second.Result!.PerformanceLevel);
        Assert.Equal(first.Result!.CompletedAt, second.Result!.CompletedAt);
        Assert.Equal(
            first.Result!.FinalScores.OrderBy(k => k.Key),
            second.Result!.FinalScores.OrderBy(k => k.Key));
        // The second call performed NO write: updated_at is byte-identical (a re-UPDATE would bump it).
        Assert.Equal(updatedAtAfterFirst, updatedAtAfterSecond);
    }

    // ----------------------------------------------------------------------------------------------
    // Coverage gate 2 — corpus #19: a partial session (289/290 responses) is rejected, no write.
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_with_incomplete_coverage_is_rejected_without_writing()
    {
        // pattern_recognition one short (59 of 60) — everything else full; all subtests ended.
        var counts = new Dictionary<string, (int, int)>(HappyCounts, StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (39, 10), // 39 + 10 + 10 unanswered = 59, one short of 60
        };
        var (userId, sessionId) = await SeedRunAsync(status: "in_progress", allEnded: true, counts: counts);

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(LiaCompleteStatus.IncompleteCoverage, outcome.Status);
        Assert.Null(outcome.Result);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("in_progress", row.Status); // untouched
        Assert.Null(row.CompletedAt);
        Assert.Null(row.GlobalPercentile);
    }

    // ----------------------------------------------------------------------------------------------
    // Coverage gate 1 — a subtest never ended (subtest_times missing endedAt) → NotInProgress, no write.
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_when_a_subtest_never_ended_is_not_in_progress_without_writing()
    {
        // Fully answered (290 responses) but one subtest has no endedAt marker.
        var (userId, sessionId) = await SeedRunAsync(
            status: "in_progress", allEnded: false, counts: HappyCounts, unendedSubtest: "visual_rotation");

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(LiaCompleteStatus.NotInProgress, outcome.Status);
        Assert.Null(outcome.Result);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("in_progress", row.Status);
        Assert.Null(row.CompletedAt);
    }

    // ----------------------------------------------------------------------------------------------
    // Ownership + existence — both collapse to the uniform IDOR-safe NotFound, no write.
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_by_a_non_owner_is_not_found_without_writing()
    {
        var (ownerId, sessionId) = await SeedRunAsync(status: "in_progress", allEnded: true, counts: HappyCounts);
        var strangerId = "stranger-" + Guid.NewGuid().ToString("N");
        await SeedUserAsync(strangerId);

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(strangerId), sessionId, strangerId);

        Assert.Equal(LiaCompleteStatus.NotFound, outcome.Status);
        Assert.Null(outcome.Result);
        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("in_progress", row.Status); // never scored for the wrong owner
    }

    [Fact]
    public async Task Complete_on_a_missing_session_is_not_found()
    {
        var userId = "u-" + Guid.NewGuid().ToString("N");
        await SeedUserAsync(userId);

        var (writer, _) = MakeWriter();
        var outcome = await writer.CompleteAsync(Ctx(userId), "does-not-exist", userId);

        Assert.Equal(LiaCompleteStatus.NotFound, outcome.Status);
        Assert.Null(outcome.Result);
    }

    // ----------------------------------------------------------------------------------------------
    // Compliance (SOC2 CC7.2 / ISO A.8.15): the durable write emits a PII-free audit event.
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Complete_emits_a_pii_free_audit_event()
    {
        var (userId, sessionId) = await SeedRunAsync(
            status: "in_progress", allEnded: true, counts: HappyCounts,
            userName: "Ada Lovelace", userEmail: "ada@analytical.engine");

        var (writer, logger) = MakeWriter();
        await writer.CompleteAsync(Ctx(userId, name: "Ada Lovelace", email: "ada@analytical.engine"), sessionId, userId);

        var audit = Assert.Single(logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, audit.Level);
        Assert.Contains(sessionId, audit.Message, StringComparison.Ordinal);
        Assert.Contains(userId, audit.Message, StringComparison.Ordinal); // IDs are allowed
        // NO PII in the body — names and emails must never be logged.
        Assert.DoesNotContain("Ada Lovelace", audit.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("ada@analytical.engine", audit.Message, StringComparison.Ordinal);
    }

    // ----------------------------------------------------------------------------------------------
    // TOCTOU — two concurrent completions cannot double-score. FOR UPDATE serializes them; the loser
    // re-reads status='completed' and returns the stored scores. Exactly one write.
    // ----------------------------------------------------------------------------------------------

    [Fact]
    public async Task Two_concurrent_completions_score_exactly_once()
    {
        var (userId, sessionId) = await SeedRunAsync(status: "in_progress", allEnded: true, counts: HappyCounts);
        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();

        var results = await Task.WhenAll(
            writerA.CompleteAsync(Ctx(userId), sessionId, userId),
            writerB.CompleteAsync(Ctx(userId), sessionId, userId));

        // Both succeed with identical scores (one fresh, one idempotent replay) — no exception/deadlock.
        Assert.All(results, r => Assert.Equal(LiaCompleteStatus.Completed, r.Status));
        Assert.Equal(results[0].Result!.GlobalPercentile, results[1].Result!.GlobalPercentile);
        Assert.Equal(results[0].Result!.CompletedAt, results[1].Result!.CompletedAt);

        var row = await ReadSessionAsync(sessionId);
        Assert.Equal("completed", row.Status);
        // completed_at == updated_at proves a single write set both to the same instant.
        Assert.Equal(row.CompletedAt, row.UpdatedAt);
    }

    // ==============================================================================================
    // Helpers
    // ==============================================================================================

    private (LiaSessionWriter Writer, CapturingLogger Logger) MakeWriter()
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

    private static Dictionary<string, ResponseCount> ExpectedCounts(
        IReadOnlyDictionary<string, (int Correct, int Incorrect)> counts)
    {
        var result = new Dictionary<string, ResponseCount>(StringComparer.Ordinal);
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            var (correct, incorrect) = counts[subtest];
            result[subtest] = new ResponseCount(correct, incorrect, Unanswered);
        }

        return result;
    }

    /// <summary>Seed a user + session (with subtest_times) + full per-subtest responses for one run.</summary>
    private async Task<(string UserId, string SessionId)> SeedRunAsync(
        string status,
        bool allEnded,
        IReadOnlyDictionary<string, (int Correct, int Incorrect)> counts,
        string? unendedSubtest = null,
        string userName = "Test User",
        string userEmail = "test@e.st")
    {
        var userId = "u-" + Guid.NewGuid().ToString("N");
        var sessionId = "s-" + Guid.NewGuid().ToString("N");

        await using var connection = await _dataSource.OpenConnectionAsync();
        await SeedUserAsync(userId, userName, userEmail, connection);
        await SeedSessionAsync(connection, sessionId, userId, status, BuildSubtestTimes(allEnded, unendedSubtest));

        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            var (correct, incorrect) = counts[subtest];
            // total = correct + incorrect + Unanswered. For HappyCounts this equals itemCount (full
            // coverage); a caller that lowers a subtest's counts makes it fall short of itemCount.
            await SeedResponsesAsync(connection, sessionId, subtest, correct, incorrect, correct + incorrect + Unanswered);
        }

        return (userId, sessionId);
    }

    private async Task SeedUserAsync(string userId, string name = "Test User", string email = "test@e.st", NpgsqlConnection? connection = null)
    {
        var owned = connection is null;
        connection ??= await _dataSource.OpenConnectionAsync();
        try
        {
            await using var cmd = new NpgsqlCommand(
                "INSERT INTO users (id, name, email) VALUES (@id, @name, @email) ON CONFLICT (id) DO NOTHING",
                connection);
            cmd.Parameters.AddWithValue("id", userId);
            cmd.Parameters.AddWithValue("name", name);
            cmd.Parameters.AddWithValue("email", email);
            await cmd.ExecuteNonQueryAsync();
        }
        finally
        {
            if (owned)
            {
                await connection.DisposeAsync();
            }
        }
    }

    private static async Task SeedSessionAsync(
        NpgsqlConnection connection, string sessionId, string userId, string status, string subtestTimesJson)
    {
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO lia_assessment_sessions (id, user_id, status, subtest_times, started_at, updated_at)
            VALUES (@id, @uid, @status::"LiaSessionStatus", @times::jsonb, now(), @updated)
            """,
            connection);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("uid", userId);
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("times", subtestTimesJson);
        // A baseline distinctly earlier than "now" so a write is detectable if one occurs.
        cmd.Parameters.AddWithValue("updated", DateTime.UtcNow.AddHours(-1));
        await cmd.ExecuteNonQueryAsync();
    }

    private static async Task SeedResponsesAsync(
        NpgsqlConnection connection, string sessionId, string subtest, int correct, int incorrect, int total)
    {
        // Server-side generate_series builds exactly `total` rows: the first `correct` true, the next
        // `incorrect` false, the remainder null (unanswered). question_id is unique within the session.
        await using var cmd = new NpgsqlCommand(
            """
            INSERT INTO lia_responses (id, session_id, question_id, subtest, item_number, is_correct, updated_at)
            SELECT @sid || '-' || @sub || '-' || g, @sid, @sub || '-' || g, @sub::"LiaSubtest", g,
                   CASE WHEN g <= @correct THEN true
                        WHEN g <= @correct + @incorrect THEN false
                        ELSE NULL END,
                   now()
            FROM generate_series(1, @total) g
            """,
            connection);
        cmd.Parameters.AddWithValue("sid", sessionId);
        cmd.Parameters.AddWithValue("sub", subtest);
        cmd.Parameters.AddWithValue("correct", correct);
        cmd.Parameters.AddWithValue("incorrect", incorrect);
        cmd.Parameters.AddWithValue("total", total);
        await cmd.ExecuteNonQueryAsync();
    }

    private static string BuildSubtestTimes(bool allEnded, string? unendedSubtest)
    {
        var entries = new List<string>();
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            var omitEnded = !allEnded && string.Equals(subtest, unendedSubtest, StringComparison.Ordinal);
            entries.Add(omitEnded
                ? $"\"{subtest}\":{{\"startedAt\":\"2026-07-17T10:00:00.000Z\",\"durationMs\":60000}}"
                : $"\"{subtest}\":{{\"startedAt\":\"2026-07-17T10:00:00.000Z\",\"endedAt\":\"2026-07-17T10:01:00.000Z\",\"durationMs\":60000}}");
        }

        return "{" + string.Join(",", entries) + "}";
    }

    private async Task<SessionSnapshot> ReadSessionAsync(string sessionId)
    {
        await using var connection = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT "status"::text, "completed_at", "updated_at",
                   "global_percentile"::double precision, "final_scores"::text,
                   "performance_level", "response_counts"::text
            FROM "lia_assessment_sessions" WHERE "id" = @id
            """,
            connection);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return new SessionSnapshot(
            Status: reader.GetString(0),
            CompletedAt: reader.IsDBNull(1) ? null : reader.GetDateTime(1),
            UpdatedAt: reader.GetDateTime(2),
            GlobalPercentile: reader.IsDBNull(3) ? null : reader.GetDouble(3),
            FinalScores: reader.IsDBNull(4) ? null : reader.GetString(4),
            PerformanceLevel: reader.IsDBNull(5) ? null : reader.GetString(5),
            ResponseCounts: reader.IsDBNull(6) ? null : reader.GetString(6));
    }

    private static Dictionary<string, double> DeserializeDoubles(string? json) =>
        JsonSerializer.Deserialize<Dictionary<string, double>>(json ?? "{}")
        ?? new Dictionary<string, double>(StringComparer.Ordinal);

    private sealed record SessionSnapshot(
        string Status,
        DateTime? CompletedAt,
        DateTime UpdatedAt,
        double? GlobalPercentile,
        string? FinalScores,
        string? PerformanceLevel,
        string? ResponseCounts);

    /// <summary>Captures log entries with their fully-rendered message (to assert the audit event + no PII).</summary>
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
