using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Assessments;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
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

    // ------------------------------------------------------------------------------------------
    // Adversarial #1: the atomic-increment race Node's own fix addresses. K concurrent /start
    // calls on the SAME in_progress, unlocked session must count exactly K strikes — not fewer.
    //
    // Concurrency is deliberately MAX_REENTRIES (3), not 5. At 5 this assertion is not something the
    // implementation guarantees: StartAsync checks lockedAt and returns Locked BEFORE it reaches the
    // reentry increment, so once the 4th strike locks the session, a 5th caller that reads its
    // snapshot after that commit legitimately never increments — making `== 5` true only when all
    // five happen to read before any of them commits. It passed on timing luck and became visibly
    // flaky once unrelated work shifted the interleaving. At 3 no caller can short-circuit (lockedAt
    // stays NULL, status stays in_progress), so exactly-K holds for every possible interleaving,
    // which is precisely the atomic-increment property this test exists to pin. The lock-on-overflow
    // behaviour is covered separately by Exceeding_max_reentries_locks_the_session and by
    // Concurrent_starts_past_the_reentry_limit_lock_the_session_and_lose_no_unlocked_strike below.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Concurrent_starts_on_the_same_session_count_every_strike_atomically()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();

        const int concurrency = 3; // == MAX_REENTRIES: every caller reaches the increment.
        var tasks = Enumerable.Range(0, concurrency)
            .Select(_ => writer.StartAsync(Ctx(userId), userId, "es"))
            .ToArray();
        await Task.WhenAll(tasks);

        var reentryCount = await ReadReentryCountAsync(sessionId);
        Assert.Equal(concurrency, reentryCount);
    }

    /// <summary>
    /// The over-limit race, asserted only on what is actually invariant under every interleaving: the
    /// session ends LOCKED, at least one caller is told so, and no strike is lost while the session is
    /// still unlocked (so the count lands in [MAX_REENTRIES+1, K] and never below). Replaces the
    /// exact-count assertion the 5-way race used to make, which was timing-dependent.
    /// </summary>
    [Fact]
    public async Task Concurrent_starts_past_the_reentry_limit_lock_the_session_and_lose_no_unlocked_strike()
    {
        const int maxReentries = 3;
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0);
        var (writer, _) = MakeWriter();

        const int concurrency = 5;
        var outcomes = await Task.WhenAll(Enumerable.Range(0, concurrency)
            .Select(_ => writer.StartAsync(Ctx(userId), userId, "es")));

        // Someone crossed the limit, so the session must be locked and say so.
        Assert.Contains(outcomes, o => o.Status == LiaStartStatus.Locked);
        Assert.True(await ReadLockedAtAsync(sessionId) is not null, "the session should be locked");

        // Every strike taken while the session was unlocked was counted: enough to cross the limit,
        // never more than the number of callers, and never silently dropped below the threshold.
        var reentryCount = await ReadReentryCountAsync(sessionId);
        Assert.InRange(reentryCount, maxReentries + 1, concurrency);
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
    public async Task Fresh_start_with_device_info_persists_it_verbatim()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();
        var deviceInfo = new LiaDeviceInfo("Mozilla/5.0 (Test)", 1920, 1080);

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es", deviceInfo);

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        var persisted = await ReadDeviceInfoAsync(outcome.Payload!.SessionId);
        Assert.NotNull(persisted);
        Assert.Equal("Mozilla/5.0 (Test)", persisted!.Value.GetProperty("userAgent").GetString());
        Assert.Equal(1920, persisted.Value.GetProperty("screenWidth").GetInt32());
        Assert.Equal(1080, persisted.Value.GetProperty("screenHeight").GetInt32());
    }

    [Fact]
    public async Task Fresh_start_without_device_info_leaves_the_column_null()
    {
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Null(await ReadDeviceInfoAsync(outcome.Payload!.SessionId));
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

    // ------------------------------------------------------------------------------------------
    // Gate 2 coverage: a subtest whose clock expired an hour ago (well past pattern_recognition's
    // 180s + 5s grace) must be timed out on the NEXT /start — filling every unanswered live item with
    // a null response, stamping endedAt, and advancing current_subtest/status — not silently resumed
    // as if the clock were still live. This is the shared helper path (ExpireIfPastDeadlineAsync ->
    // ApplyTimeoutAsync -> AdvancePastSubtestAsync) Tasks 5/6 build on, so it needs its own coverage
    // here rather than relying on Gate 3's live-clock test to exercise it incidentally.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Expired_subtest_clock_advances_past_the_subtest_and_fills_unanswered_items_on_next_start()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past any subtest's time limit + grace.
        var (userId, sessionId) = await SeedInProgressSessionAsync(reentryCount: 0, subtestStartedAt: startedAt);
        var (writer, _) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.Started, outcome.Status);
        Assert.Equal("next_subtest", outcome.Payload!.ResumeMode);
        Assert.Equal("verbal_reasoning", outcome.Payload.CurrentSubtest);

        var (status, currentSubtest) = await ReadSessionStatusAsync(sessionId);
        Assert.Equal("practice", status);
        Assert.Equal("verbal_reasoning", currentSubtest);

        // pattern_recognition has 60 items; none were answered, so all 60 must land as null responses.
        var nullResponseCount = await CountNullResponsesAsync(sessionId, "pattern_recognition");
        Assert.Equal(60, nullResponseCount);
    }

    // ------------------------------------------------------------------------------------------
    // Task 3b regression: legacy applyTimeout calls the REAL completeSession() the instant the
    // assessment's LAST subtest times out — it does not just flip status to "completed". Before this
    // fix, AdvancePastSubtestAsync's isLast branch set status='completed' directly without ever
    // computing/persisting raw_scores/final_scores/percentiles/etc, so CompleteAsync's own idempotency
    // check (status=='completed' -> return stored values) would hand back a fake zero-score
    // "insufficient" completion for a session that was never actually scored. This test seeds the
    // LAST subtest (visual_rotation) with an expired clock and the 4 PRIOR subtests fully answered,
    // drives it through Gate 2, and asserts real scores landed — then proves it via a second /complete
    // call that must return the real (non-fallback) values, not BuildStoredResult's defaults.
    // ------------------------------------------------------------------------------------------

    // Fully-answered (no unanswered) correct/incorrect split for each of the 4 subtests PRIOR to
    // visual_rotation. Values are arbitrary but chosen (verified via LiaCompletionScorer directly) to
    // produce a comfortably non-insufficient, non-zero global completion even though visual_rotation
    // itself will land 0 correct / 0 incorrect / all-unanswered (auto-filled by the timeout path).
    private static readonly IReadOnlyDictionary<string, (int Correct, int Incorrect)> PriorSubtestCounts =
        new Dictionary<string, (int, int)>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (50, 10),
            ["verbal_reasoning"] = (40, 10),
            ["numerical_speed"] = (45, 15),
            ["working_memory"] = (55, 5),
        };

    [Fact]
    public async Task Timeout_on_the_last_subtest_computes_and_persists_real_scores_not_just_status()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past visual_rotation's 300s + grace.
        var (userId, sessionId) = await SeedLastSubtestExpiredWithFullPriorCoverageAsync(startedAt);
        var (writer, logger) = MakeWriter();

        var outcome = await writer.StartAsync(Ctx(userId), userId, "es");

        Assert.Equal(LiaStartStatus.AlreadyCompleted, outcome.Status);

        var (status, rawScoresJson, finalScoresJson, percentilesJson) = await ReadScoringColumnsAsync(sessionId);
        Assert.Equal("completed", status);
        AssertHasAllFiveSubtestKeys(rawScoresJson, "raw_scores");
        AssertHasAllFiveSubtestKeys(finalScoresJson, "final_scores");
        AssertHasAllFiveSubtestKeys(percentilesJson, "percentiles");

        // The timeout-driven completion must emit exactly the same PII-free audit event CompleteAsync
        // emits on its own commit — StartAsync's Gate 2 logs it only after its own commit succeeds.
        var audit = Assert.Single(
            logger.Entries, e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, audit.Level);
        Assert.Contains(sessionId, audit.Message, StringComparison.Ordinal);
        Assert.Contains(userId, audit.Message, StringComparison.Ordinal);

        // formmaps#144: StartAsync's Gate 2 completion fires the polyglot insights trigger exactly
        // once, for the owner, alongside that audit event.
        var gateFire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, gateFire.UserId);
        Assert.Equal("assessment.lia.completed", gateFire.Source);

        // Strongest check (would have failed before this fix): a subsequent /complete call hits
        // CompleteAsync's idempotent status=='completed' branch (BuildStoredResult) — before the fix
        // that would return the fallback defaults (0 / "insufficient" / epoch) because nothing had
        // actually been scored. After the fix, it must return the REAL persisted values.
        var (completeWriter, _) = MakeWriter();
        var completeOutcome = await completeWriter.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(LiaCompleteStatus.Completed, completeOutcome.Status);
        var result = completeOutcome.Result!;
        Assert.NotEqual("insufficient", result.PerformanceLevel);
        Assert.NotEqual(0d, result.GlobalPercentile);
        Assert.NotEqual("1970-01-01T00:00:00.000Z", result.CompletedAt);
    }

    // ------------------------------------------------------------------------------------------
    // Fix round 1, Important #1: two concurrent /start calls racing through Gate 2's timeout path on
    // the SAME last-subtest-expired session. Both read the session via the UNLOCKED
    // SelectActiveSessionsForUserSql before Gate 1, so whichever call loses the race to Gate 1's
    // reentry-increment row lock still carries a STALE in-memory snapshot (status still "in_progress")
    // by the time it reaches AdvancePastSubtestAsync's isLast branch — even though the winner has, by
    // then, already scored and committed status='completed'. Before this fix, the loser's
    // PersistCompletionAsync would attempt its own status-guarded UPDATE, match 0 rows, and FAIL
    // CLOSED (throw InvalidOperationException -> 500), because the isLast branch had no way to tell
    // "someone else already completed it" apart from "the row vanished". The fix adds a
    // SELECT ... FOR UPDATE status re-check immediately before scoring: it blocks until the winner's
    // transaction commits, then sees 'completed' and returns AlreadyCompleted cleanly instead of
    // re-scoring or throwing. This mirrors the existing "Two_concurrent_completions_score_exactly_once"
    // (LiaSessionWriterTests) and "Concurrent_starts_..." (this file) precedent for exercising a real
    // Postgres row-lock race via genuine Task.WhenAll concurrency rather than a mocked/sequential stand-in.
    // ------------------------------------------------------------------------------------------
    [Fact]
    public async Task Two_concurrent_starts_racing_the_last_subtest_timeout_do_not_throw_and_both_report_complete()
    {
        var startedAt = DateTime.UtcNow.AddHours(-1); // well past visual_rotation's 300s + grace.
        var (userId, sessionId) = await SeedLastSubtestExpiredWithFullPriorCoverageAsync(startedAt);
        var (writerA, _) = MakeWriter();
        var (writerB, _) = MakeWriter();

        // Task.WhenAll would propagate any exception from either call — a 500 from the pre-fix bug
        // would surface here as a thrown InvalidOperationException, failing this test outright.
        var results = await Task.WhenAll(
            writerA.StartAsync(Ctx(userId), userId, "es"),
            writerB.StartAsync(Ctx(userId), userId, "es"));

        // Whichever call scored it fresh and whichever lost the race and found it already completed,
        // BOTH must resolve to AlreadyCompleted — never a throw, never a Started/mid-scoring result.
        Assert.All(results, r => Assert.Equal(LiaStartStatus.AlreadyCompleted, r.Status));

        // Exactly one real scoring occurred: the session carries real (non-null) scores, not a
        // half-scored or double-scored state.
        var (status, rawScoresJson, finalScoresJson, percentilesJson) = await ReadScoringColumnsAsync(sessionId);
        Assert.Equal("completed", status);
        AssertHasAllFiveSubtestKeys(rawScoresJson, "raw_scores");
        AssertHasAllFiveSubtestKeys(finalScoresJson, "final_scores");
        AssertHasAllFiveSubtestKeys(percentilesJson, "percentiles");
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

    /// <summary>
    /// Seeds an in_progress session sitting on visual_rotation (the LAST subtest) with an already-
    /// expired clock, subtest_times already showing the 4 PRIOR subtests ended, and full response
    /// coverage (correct+incorrect, no unanswered) for those 4 prior subtests. visual_rotation itself
    /// has NO responses yet — StartAsync's Gate 2 is expected to fill all of them as null timeouts.
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

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx copied verbatim from LiaSessionWriterTests.cs (same fixture, same DI
    // wiring; every test class in this directory sharing LiaWriteDatabaseFixture keeps these identical).
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
        return (new LiaSessionWriter(factory, resolver, _insightsTrigger, logger), logger);
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

    private async Task<JsonElement?> ReadDeviceInfoAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT "device_info" FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        var result = await cmd.ExecuteScalarAsync();
        return result is null or DBNull ? null : JsonDocument.Parse((string)result).RootElement;
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

    private async Task<int> CountNullResponsesAsync(string sessionId, string subtest)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT COUNT(*) FROM lia_responses
            WHERE session_id = @sessionId AND subtest::text = @subtest AND user_answer IS NULL
            """, conn);
        cmd.Parameters.AddWithValue("sessionId", sessionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
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
