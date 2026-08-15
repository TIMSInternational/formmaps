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
/// Real-DB (Testcontainers) tests for <see cref="LiaSessionWriter.HandleTimeoutAsync"/> (legacy explicit
/// <c>handleTimeout</c> / <c>/timeout</c> endpoint) and <see cref="LiaSessionWriter.SaveViolationsAsync"/>
/// (legacy proctoring violation persistence). Pins: HandleTimeoutAsync shares Task 3/5's
/// ExpireIfPastDeadlineAsync-less direct ApplyTimeoutAsync call, separates ownership-mismatch (uniform
/// IDOR-safe NotFound) from a legitimate state-precondition failure for the real owner (NotInProgress),
/// and — like SubmitAnswerAsync's own timeout branch — threads a real <see cref="LiaCompletionResult"/>
/// into <see cref="LiaAnswerResult.Completion"/> and audit-logs only after the commit succeeds when the
/// explicit timeout call happens to close out the assessment's LAST subtest. SaveViolationsAsync pins:
/// cumulative flag-for-review threshold, unconditional flag overwrite (legacy design, not a bug), and
/// case-sensitive lowercase-key JSON round-tripping through the shared (case-sensitive) JsonOptions.
/// </summary>
public sealed class LiaTimeoutViolationsTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaTimeoutViolationsTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
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
    // HandleTimeoutAsync
    // ==============================================================================================

    [Fact]
    public async Task Timeout_fills_unanswered_items_and_advances_the_subtest()
    {
        var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.SubtestComplete);
        Assert.Equal("verbal_reasoning", outcome.Result.NextSubtest);
        Assert.False(outcome.Result.AssessmentComplete);

        var (status, currentSubtest) = await ReadSessionStatusAsync(sessionId);
        Assert.Equal("practice", status);
        Assert.Equal("verbal_reasoning", currentSubtest);
    }

    [Fact]
    public async Task Handle_timeout_rejects_with_uniform_NotFound_for_a_nonexistent_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), Guid.NewGuid().ToString(), userId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.NotFound, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // Correction 4 (Critical): an ownership mismatch must return the uniform IDOR-safe NotFound —
    // never a status (e.g. NotInProgress) that would confirm the session exists but belongs to
    // someone else.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Handle_timeout_rejects_with_uniform_NotFound_when_the_session_belongs_to_someone_else()
    {
        var (_, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(attackerId), sessionId, attackerId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.NotFound, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // Correction 4 (continued): a legitimate state-precondition failure FOR THE ACTUAL OWNER
    // (wrong status, or wrong subtest) must still return NotInProgress, not be folded into NotFound.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Handle_timeout_rejects_when_the_session_is_not_in_progress()
    {
        var (userId, sessionId) = await SeedPracticePhaseSessionAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.NotInProgress, outcome.Status);
    }

    [Fact]
    public async Task Handle_timeout_rejects_when_the_subtest_does_not_match_the_sessions_current_subtest()
    {
        var (userId, sessionId) = await SeedInProgressSessionExpiredAsync(subtest: "pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "verbal_reasoning");

        Assert.Equal(LiaSubmitAnswerStatus.NotInProgress, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // Correction 3 (Critical): an explicit /timeout call that happens to close out the assessment's
    // LAST subtest must thread the REAL scored LiaCompletionResult into LiaAnswerResult.Completion
    // and audit-log only AFTER the commit succeeds — mirroring LiaAnswerSubmitTests' equivalent test
    // for SubmitAnswerAsync's own timeout branch, and StartAsync's Gate 2.
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
    public async Task Handle_timeout_on_the_last_subtest_threads_real_completion_and_audits_after_commit()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past visual_rotation's 300s + grace.
        var (userId, sessionId) = await SeedLastSubtestExpiredWithFullPriorCoverageAsync(startedAt);
        var (writer, logger) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "visual_rotation");

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.SubtestComplete);
        Assert.True(outcome.Result.AssessmentComplete);

        var completion = outcome.Result.Completion;
        Assert.NotNull(completion);
        Assert.NotEqual("insufficient", completion!.PerformanceLevel);
        Assert.NotEqual(0d, completion.GlobalPercentile);

        var (status, _) = await ReadSessionStatusAsync(sessionId);
        Assert.Equal("completed", status);

        // Audit only after the commit — same event CompleteAsync/StartAsync/SubmitAnswerAsync emit.
        var audit = Assert.Single(
            logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, audit.Level);
        Assert.Contains(sessionId, audit.Message, StringComparison.Ordinal);
        Assert.Contains(userId, audit.Message, StringComparison.Ordinal);

        // ...and the audit-events retrofit (plan Task 8 of formmaps#52): the explicit POST /timeout
        // completion path must persist a durable row too, not just the log line.
        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.lia.completed", sessionId));

        // formmaps#144: the explicit POST /timeout completion fires the polyglot insights trigger
        // exactly once, for the owner, alongside that audit event.
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, fire.UserId);
        Assert.Equal("assessment.lia.completed", fire.Source);
    }

    // ==============================================================================================
    // SaveViolationsAsync
    // ==============================================================================================

    [Fact]
    public async Task Saving_violations_appends_and_flags_for_review_past_the_threshold()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();
        var violations = Enumerable.Range(0, 5)
            .Select(i => new ViolationEntry("fullscreen_exit", DateTime.UtcNow.ToString("o"), $"violation {i}"))
            .ToList();

        var outcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, violations);

        Assert.Equal(LiaSaveViolationsStatus.Ok, outcome.Status);
        Assert.Equal(5, outcome.SavedCount);

        var (json, flag) = await ReadViolationsAsync(sessionId);
        Assert.True(flag);
        Assert.False(string.IsNullOrEmpty(json));
        using var doc = JsonDocument.Parse(json!);
        Assert.Equal(5, doc.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Saving_violations_below_the_threshold_does_not_flag_for_review()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();
        var violations = new List<ViolationEntry> { new("tab_switch", DateTime.UtcNow.ToString("o"), null) };

        var outcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, violations);

        Assert.Equal(LiaSaveViolationsStatus.Ok, outcome.Status);
        Assert.Equal(1, outcome.SavedCount);

        var (_, flag) = await ReadViolationsAsync(sessionId);
        Assert.False(flag);
    }

    // legacy mergeViolations: the threshold is checked against the CUMULATIVE count (prior + new),
    // not just the size of this one batch.
    [Fact]
    public async Task Saving_violations_appends_to_existing_violations_and_flags_on_cumulative_count()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();

        var first = new List<ViolationEntry>
        {
            new("tab_switch", DateTime.UtcNow.ToString("o"), null),
            new("tab_switch", DateTime.UtcNow.ToString("o"), null),
        };
        var firstOutcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, first);
        Assert.Equal(2, firstOutcome.SavedCount);
        var (_, flagAfterFirst) = await ReadViolationsAsync(sessionId);
        Assert.False(flagAfterFirst);

        var second = new List<ViolationEntry> { new("fullscreen_exit", DateTime.UtcNow.ToString("o"), "left fullscreen") };
        var secondOutcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, second);
        Assert.Equal(LiaSaveViolationsStatus.Ok, secondOutcome.Status);
        Assert.Equal(1, secondOutcome.SavedCount);

        var (json, flagAfterSecond) = await ReadViolationsAsync(sessionId);
        Assert.True(flagAfterSecond); // cumulative count 3 >= PROCTORING_FLAG_THRESHOLD (3).
        using var doc = JsonDocument.Parse(json!);
        Assert.Equal(3, doc.RootElement.GetArrayLength());
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Important: SaveViolationsAsync's session SELECT is now FOR UPDATE — without it,
    // two concurrent violation flushes for the same session (a plausible normal shape: the lockdown
    // client flushes batches on a timer and typically retries on failure) both read the same
    // `existing` array, both compute `all`, and the second commit silently overwrites the first's
    // batch — losing proctoring evidence AND computing `flag` from a stale, too-small count. Mirrors
    // Task 5's "Concurrent_submits_of_two_different_items_both_advance_current_item_without_losing_one"
    // pattern: two concurrent SaveViolationsAsync calls on the SAME session must both survive, and the
    // final stored count must be the SUM of both batches, never just one.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Concurrent_violation_saves_for_the_same_session_both_persist_without_losing_one()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();

        var batchA = new List<ViolationEntry> { new("tab_switch", DateTime.UtcNow.ToString("o"), "batch A") };
        var batchB = new List<ViolationEntry> { new("fullscreen_exit", DateTime.UtcNow.ToString("o"), "batch B") };

        var results = await Task.WhenAll(
            writerA.SaveViolationsAsync(Ctx(userId), sessionId, userId, batchA),
            writerB.SaveViolationsAsync(Ctx(userId), sessionId, userId, batchB));

        Assert.All(results, r => Assert.Equal(LiaSaveViolationsStatus.Ok, r.Status));

        // Both batches must be reflected in the final stored array — a lost update (the bug this fix
        // addresses) would land on 1, not 2.
        var (json, _) = await ReadViolationsAsync(sessionId);
        using var doc = JsonDocument.Parse(json!);
        Assert.Equal(2, doc.RootElement.GetArrayLength());

        var details = doc.RootElement.EnumerateArray()
            .Select(e => e.GetProperty("details").GetString())
            .ToList();
        Assert.Contains("batch A", details);
        Assert.Contains("batch B", details);
    }

    [Fact]
    public async Task Saving_violations_rejects_with_uniform_NotFound_for_a_nonexistent_session()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SaveViolationsAsync(Ctx(userId), Guid.NewGuid().ToString(), userId, new List<ViolationEntry>());

        Assert.Equal(LiaSaveViolationsStatus.NotFound, outcome.Status);
    }

    [Fact]
    public async Task Saving_violations_rejects_with_uniform_NotFound_when_the_session_belongs_to_someone_else()
    {
        var (_, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var attackerId = Guid.NewGuid().ToString();
        await SeedUserAsync(attackerId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.SaveViolationsAsync(Ctx(attackerId), sessionId, attackerId, new List<ViolationEntry>());

        Assert.Equal(LiaSaveViolationsStatus.NotFound, outcome.Status);
    }

    // ------------------------------------------------------------------------------------------
    // Correction 5 (Critical): ViolationEntry must round-trip with lowercase JSON keys
    // ("type"/"timestamp"/"details"), matching legacy's on-disk shape, via the shared (case-sensitive)
    // JsonSerializerOptions — read the RAW lockdown_violations column text back from Postgres and
    // assert on it literally, not just through a re-deserialize (which would hide the defect since
    // reader/writer would use the same broken casing consistently).
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Violation_entries_round_trip_with_lowercase_json_keys_matching_legacy_shape()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();
        var violations = new List<ViolationEntry> { new("fullscreen_exit", "2026-07-29T12:00:00.000Z", "left fullscreen") };

        var outcome = await writer.SaveViolationsAsync(Ctx(userId), sessionId, userId, violations);
        Assert.Equal(LiaSaveViolationsStatus.Ok, outcome.Status);

        var (json, _) = await ReadViolationsAsync(sessionId);
        Assert.False(string.IsNullOrEmpty(json));
        Assert.Contains("\"type\"", json, StringComparison.Ordinal);
        Assert.Contains("\"timestamp\"", json, StringComparison.Ordinal);
        Assert.Contains("\"details\"", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"Type\"", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"Timestamp\"", json, StringComparison.Ordinal);
        Assert.DoesNotContain("\"Details\"", json, StringComparison.Ordinal);

        // Deserialize the RAW column text back through the exact same case-sensitive options the
        // production code uses, proving a previously-written row reads back correctly rather than
        // silently defaulting every field.
        var reParsed = JsonSerializer.Deserialize<List<ViolationEntry>>(json!, new JsonSerializerOptions());
        var entry = Assert.Single(reParsed!);
        Assert.Equal("fullscreen_exit", entry.Type);
        Assert.Equal("2026-07-29T12:00:00.000Z", entry.Timestamp);
        Assert.Equal("left fullscreen", entry.Details);
    }

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx/SeedUserAsync copied verbatim from LiaAnswerSubmitTests.cs (same
    // fixture, same DI wiring; every test class in this directory sharing LiaWriteDatabaseFixture
    // keeps these identical). Session-seeding helpers likewise copied from LiaAnswerSubmitTests.cs /
    // LiaSessionStartTests.cs as noted per-helper.
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

    /// <summary>Seeds an in_progress session mid-subtest with a live (unexpired) clock, at the given current_item.
    /// Copied from LiaAnswerSubmitTests.cs.</summary>
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

    /// <summary>Seeds an in_progress session whose subtest clock expired long ago (well past any timer + grace).
    /// Copied from LiaAnswerSubmitTests.cs.</summary>
    private Task<(string UserId, string SessionId)> SeedInProgressSessionExpiredAsync(string subtest) =>
        SeedInProgressSessionAsync(subtest, currentItem: 1, subtestStartedAt: DateTime.UtcNow.AddHours(-1));

    /// <summary>Seeds a practice-phase session (status='practice') sitting on the given subtest.
    /// Copied from LiaAnswerSubmitTests.cs.</summary>
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

    /// <summary>Seeds an in_progress session with a fixed reentryCount, sitting on pattern_recognition with a
    /// live (unexpired) clock. Copied from LiaSessionStartTests.cs (used there for the reentry/lock-gate
    /// tests; reused here only for its "give me an ordinary in_progress session" shape).</summary>
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

    /// <summary>
    /// Seeds an in_progress session sitting on visual_rotation (the LAST subtest) with an already-
    /// expired clock, subtest_times already showing the 4 PRIOR subtests ended, and full response
    /// coverage for those 4 prior subtests. visual_rotation itself has NO responses yet.
    /// Copied from LiaAnswerSubmitTests.cs.
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

    /// <summary>Inserts exactly `correct + incorrect` fully-answered (no unanswered) response rows for one
    /// subtest. Copied from LiaAnswerSubmitTests.cs.</summary>
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

    private async Task<(string? Json, bool Flag)> ReadViolationsAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT lockdown_violations::text, flag_for_review FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.GetBoolean(1));
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
