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
/// COMPOSITION tests: the real <see cref="LiaSessionWriter"/> and <see cref="LiaSessionReader"/> driven
/// through multi-method sequences against a real Postgres, rather than one method per test in isolation.
///
/// This file exists because per-method coverage — however thorough — structurally cannot catch defects
/// that only appear when one method's OUTPUT feeds another's input. Three shipped past nine individual
/// task reviews with a fully green suite:
///   * question ids that no <c>lia_questions</c> row carries, so every real /answer would have raised a
///     Postgres FK violation (23503) in production;
///   * <c>durationMs</c> never written into <c>subtest_times</c>, silently zeroing the already-live
///     <c>total_time_seconds</c> that LiaResultsAssembler derives from it;
///   * the normal (non-timeout) last-subtest completion dropping its Completion result and audit event.
/// Each is pinned below, and the full-lifecycle test would have caught all three at once.
/// </summary>
public sealed class LiaEndToEndSessionTests : IClassFixture<LiaWriteDatabaseFixture>, IAsyncLifetime
{
    private readonly LiaWriteDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public LiaEndToEndSessionTests(LiaWriteDatabaseFixture fixture) => _fixture = fixture;
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
    // Full realistic lifecycle across two subtests
    // ==============================================================================================

    /// <summary>
    /// start -> practice x3 -> subtest/start -> answer x60 -> (advance) -> practice x3 -> subtest/start
    /// -> answer x50, driving the REAL writer and reader in sequence with no fakes and no hand-seeded
    /// session rows. Every question id used comes from what the writer itself served, so the whole chain
    /// (serve -> submit -> persist under the production FK) is exercised exactly as production would.
    /// </summary>
    [Fact]
    public async Task Full_session_lifecycle_through_two_subtests_persists_real_ids_timings_and_progress()
    {
        var (reader, writer, _) = MakeReaderAndWriter();
        var userId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);

        // ---- 1. Fresh start: a practice-phase session on the first subtest. -------------------------
        var start = await writer.StartAsync(Ctx(userId), userId, "es");
        Assert.Equal(LiaStartStatus.Started, start.Status);
        var sessionId = start.Payload!.SessionId;
        Assert.Equal("pattern_recognition", start.Payload.CurrentSubtest);
        Assert.NotEmpty(start.Payload.PracticeQuestions);

        // Served ids must be REAL lia_questions rows, not values derived from (subtest, item, kind).
        await AssertEveryIdIsARealCatalogRowAsync(start.Payload.PracticeQuestions);

        // ---- 2. Practice phase of subtest 1. --------------------------------------------------------
        await CompletePracticeAsync(writer, userId, sessionId, start.Payload.PracticeQuestions);
        Assert.True(await ReadPracticeCompletedAsync(sessionId, "pattern_recognition"));

        // ---- 3. Start subtest 1's clock and answer every item. --------------------------------------
        var beforeFirstSubtest = DateTime.UtcNow;
        var subtest1 = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "pattern_recognition");
        Assert.Equal(LiaSubtestStartStatus.Started, subtest1.Status);
        Assert.Equal(60, subtest1.Result!.Questions.Count);
        await AssertEveryIdIsARealCatalogRowAsync(subtest1.Result.Questions);
        Assert.Equal(("in_progress", "pattern_recognition"), await ReadSessionStateAsync(sessionId));

        var last1 = await AnswerEveryItemAsync(writer, userId, sessionId, subtest1.Result.Questions);

        // The final answer closes the subtest out and hands back the next one — it does NOT complete the
        // assessment (three subtests still to go).
        Assert.True(last1.Result!.SubtestComplete);
        Assert.Equal("verbal_reasoning", last1.Result.NextSubtest);
        Assert.False(last1.Result.AssessmentComplete);
        Assert.Null(last1.Result.Completion);

        // Progress advanced into the next subtest's practice phase, clock reset.
        Assert.Equal(("practice", "verbal_reasoning"), await ReadSessionStateAsync(sessionId));
        Assert.Equal(0, await ReadCurrentItemAsync(sessionId));

        // All 60 responses landed, every one against a real catalog id (the FK proves it).
        Assert.Equal(60, await CountResponsesAsync(sessionId, "pattern_recognition"));

        // Critical #2: BOTH endedAt and durationMs, and durationMs is a real elapsed measurement.
        var timing1 = await ReadSubtestTimingAsync(sessionId, "pattern_recognition");
        Assert.NotNull(timing1.EndedAt);
        Assert.NotNull(timing1.DurationMs);
        Assert.True(timing1.DurationMs > 0, $"durationMs should be a positive elapsed time, was {timing1.DurationMs}.");
        Assert.True(
            timing1.DurationMs <= (long)(DateTime.UtcNow - beforeFirstSubtest).TotalMilliseconds + 1000,
            $"durationMs {timing1.DurationMs} exceeds the wall-clock time this subtest could possibly have taken.");

        // ---- 4. Subtest 2, via the READER's practice-question serving this time. ---------------------
        var practice2 = await reader.GetPracticeQuestionsAsync(Ctx(userId), sessionId, userId);
        Assert.NotNull(practice2);
        Assert.NotEmpty(practice2);
        Assert.All(practice2, q => Assert.Equal("verbal_reasoning", q.Subtest));
        await AssertEveryIdIsARealCatalogRowAsync(practice2);

        await CompletePracticeAsync(writer, userId, sessionId, practice2);
        Assert.True(await ReadPracticeCompletedAsync(sessionId, "verbal_reasoning"));

        var subtest2 = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "verbal_reasoning");
        Assert.Equal(LiaSubtestStartStatus.Started, subtest2.Status);
        Assert.Equal(50, subtest2.Result!.Questions.Count);

        var last2 = await AnswerEveryItemAsync(writer, userId, sessionId, subtest2.Result.Questions);
        Assert.True(last2.Result!.SubtestComplete);
        Assert.Equal("numerical_speed", last2.Result.NextSubtest);
        Assert.Equal(("practice", "numerical_speed"), await ReadSessionStateAsync(sessionId));
        Assert.Equal(50, await CountResponsesAsync(sessionId, "verbal_reasoning"));

        var timing2 = await ReadSubtestTimingAsync(sessionId, "verbal_reasoning");
        Assert.NotNull(timing2.EndedAt);
        Assert.True(timing2.DurationMs > 0);

        // ---- 5. The read path sees a coherent session throughout. -----------------------------------
        var detail = await reader.GetSessionAsync(Ctx(userId), sessionId, userId);
        Assert.NotNull(detail);
        Assert.Equal("practice", detail.Status);
        Assert.Equal("numerical_speed", detail.CurrentSubtest);
        // Both finished subtests carry durationMs, which is what total_time_seconds is summed from.
        foreach (var finished in new[] { "pattern_recognition", "verbal_reasoning" })
        {
            var timing = detail.SubtestTimes.GetProperty(finished);
            Assert.True(timing.TryGetProperty("durationMs", out var duration));
            Assert.Equal(JsonValueKind.Number, duration.ValueKind);
            Assert.True(duration.GetInt64() > 0);
        }
    }

    // ==============================================================================================
    // Critical #3 — normal (non-timeout) completion of the last item of the LAST subtest
    // ==============================================================================================

    /// <summary>
    /// The dominant way an assessment finishes — the candidate simply answers the final item — and the
    /// one path of the five reaching AdvancePastSubtestAsync's completion branch that used to discard
    /// <c>advanced.Completion</c> and emit no audit event. Scores were persisted either way, so nothing
    /// went visibly wrong; the frontend's follow-up POST /complete then hit CompleteAsync's idempotent
    /// replay (early return, no write, no audit), leaving the audit trail with ZERO completion events for
    /// the most common completion path. Nothing covered this at all before.
    /// </summary>
    [Fact]
    public async Task Answering_the_last_item_of_the_last_subtest_returns_real_scores_and_audits_exactly_once()
    {
        var (userId, sessionId) = await SeedLastSubtestOnFinalItemAsync(startedSecondsAgo: 40);
        var (writer, logger) = MakeWriter();
        var finalItemId = _fixture.QuestionId("visual_rotation", 60, isPractice: false);

        var outcome = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, finalItemId, "R", 900);

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.True(outcome.Result!.SubtestComplete);
        Assert.True(outcome.Result.AssessmentComplete);
        Assert.Null(outcome.Result.NextSubtest);

        // The Completion DTO is populated (this is the field that was dropped) with REAL scores.
        var completion = outcome.Result.Completion;
        Assert.NotNull(completion);
        Assert.Equal(sessionId, completion.SessionId);
        Assert.NotEqual("insufficient", completion.PerformanceLevel);
        Assert.True(completion.GlobalPercentile > 0);
        Assert.Equal(LiaScoring.SubtestOrder.Count, completion.FinalScores.Count);

        // The audit event fires exactly once, after the commit.
        var audits = logger.Entries
            .Where(e => e.Message.StartsWith("audit.assessment.lia.completed", StringComparison.Ordinal))
            .ToList();
        Assert.Single(audits);
        Assert.Contains($"sessionId={sessionId}", audits[0].Message, StringComparison.Ordinal);
        Assert.Contains($"actorUserId={userId}", audits[0].Message, StringComparison.Ordinal);

        // ...and exactly once durably (audit-events retrofit, plan Task 8 of formmaps#52). This is the
        // DOMINANT completion path — the candidate answering the last item of the last subtest — so a
        // missing row here would mean the audit table recorded zero completions for most real runs.
        Assert.Equal(1, await _fixture.CountAuditEventsAsync("audit.assessment.lia.completed", sessionId));

        // Persisted state matches what was reported.
        var (status, rawScores, finalScores, percentiles) = await ReadScoringColumnsAsync(sessionId);
        Assert.Equal("completed", status);
        Assert.NotNull(rawScores);
        Assert.NotNull(finalScores);
        Assert.NotNull(percentiles);

        // Critical #2 on this same path: the last subtest's timing is complete.
        var timing = await ReadSubtestTimingAsync(sessionId, "visual_rotation");
        Assert.NotNull(timing.EndedAt);
        Assert.True(timing.DurationMs >= 30_000, $"durationMs should reflect the ~40s clock, was {timing.DurationMs}.");

        // formmaps#144: the dominant completion path fires the polyglot insights trigger exactly once,
        // for the owner, alongside the audit event it shares an emit point with.
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, fire.UserId);
        Assert.Equal("assessment.lia.completed", fire.Source);
    }

    /// <summary>
    /// A follow-up POST /complete after the above is still an idempotent replay returning the SAME stored
    /// scores — the audit event belongs to the /answer that actually completed it, not to the replay.
    /// </summary>
    [Fact]
    public async Task A_follow_up_complete_call_replays_the_same_scores_without_rescoring()
    {
        var (userId, sessionId) = await SeedLastSubtestOnFinalItemAsync(startedSecondsAgo: 20);
        var (writer, _) = MakeWriter();
        var finalItemId = _fixture.QuestionId("visual_rotation", 60, isPractice: false);

        var answered = await writer.SubmitAnswerAsync(Ctx(userId), sessionId, userId, finalItemId, "R", 900);
        var replayed = await writer.CompleteAsync(Ctx(userId), sessionId, userId);

        Assert.Equal(LiaCompleteStatus.Completed, replayed.Status);
        Assert.Equal(answered.Result!.Completion!.GlobalPercentile, replayed.Result!.GlobalPercentile);
        Assert.Equal(answered.Result.Completion.PerformanceLevel, replayed.Result.PerformanceLevel);
        Assert.Equal(answered.Result.Completion.CompletedAt, replayed.Result.CompletedAt);

        // formmaps#144: the frontend's routine follow-up /complete is the everyday retry case — the
        // insights trigger belongs to the /answer that actually completed the session, exactly once.
        var fire = Assert.Single(_insightsTrigger.Fires);
        Assert.Equal(userId, fire.UserId);
    }

    // ==============================================================================================
    // Critical #2 — durationMs on the timeout-driven path
    // ==============================================================================================

    /// <summary>
    /// legacy recordSubtestEnd writes endedAt AND durationMs; only endedAt was being written, so
    /// LiaResultsAssembler's total_time_seconds (an already-live read surface) reported 0 for every
    /// .NET-written session — permanently, since a wall-clock delta cannot be reconstructed afterwards.
    /// This pins the explicit POST /timeout path; the lifecycle test above pins the answer-driven one.
    /// </summary>
    [Fact]
    public async Task Timeout_driven_advance_records_both_endedAt_and_a_real_durationMs()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(
            "pattern_recognition", currentItem: 5, subtestStartedAt: DateTime.UtcNow.AddSeconds(-45));
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        Assert.Equal("verbal_reasoning", outcome.Result!.NextSubtest);

        var timing = await ReadSubtestTimingAsync(sessionId, "pattern_recognition");
        Assert.NotNull(timing.EndedAt);
        Assert.NotNull(timing.DurationMs);
        Assert.True(
            timing.DurationMs is >= 40_000 and <= 120_000,
            $"durationMs should be ~45s (the seeded clock), was {timing.DurationMs}.");
    }

    /// <summary>
    /// A subtest closed out with no recorded startedAt still gets a durationMs KEY holding 0, mirroring
    /// legacy's `startedAt ?? new Date()` fallback. Absent-vs-zero matters: LiaResultsAssembler only sums
    /// entries whose durationMs is a JSON number, so an absent key and a 0 behave the same for the sum,
    /// but a present key keeps the shape identical to legacy-written rows.
    /// </summary>
    [Fact]
    public async Task A_subtest_with_no_startedAt_still_records_a_zero_durationMs()
    {
        var (userId, sessionId) = await SeedInProgressSessionWithoutSubtestTimesAsync("pattern_recognition");
        var (writer, _) = MakeWriter();

        var outcome = await writer.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition");

        Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
        var timing = await ReadSubtestTimingAsync(sessionId, "pattern_recognition");
        Assert.NotNull(timing.EndedAt);
        Assert.Equal(0L, timing.DurationMs);
    }

    // ==============================================================================================
    // Important #1 — concurrent advance past the same subtest must not wedge the session
    // ==============================================================================================

    /// <summary>
    /// COHERENCE CHECK ONLY — deliberately NOT claimed as the regression pin for Important #1. All three
    /// racers pass the same subtest, so they all compute the same next subtest and repeated advances
    /// converge on an identical final state; this test consequently still passes with the I1 fix
    /// reverted (verified). The discriminating pin is
    /// <see cref="A_stale_advance_landing_after_the_next_subtest_started_does_not_rewind_the_session"/>,
    /// which forces the interleaving Task.WhenAll cannot schedule. Kept because it does prove the
    /// happy-path race yields one coherent advance with no duplicated response coverage.
    /// </summary>
    [Fact]
    public async Task Concurrent_start_and_timeout_on_an_expired_clock_advance_exactly_once_and_leave_the_session_usable()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(
            "pattern_recognition", currentItem: 12, subtestStartedAt: DateTime.UtcNow.AddHours(-1));
        var (startWriter, _) = MakeWriter();
        var (timeoutWriter, _) = MakeWriter();
        var (secondStartWriter, _) = MakeWriter();

        // All three race to close out pattern_recognition off the same expired clock.
        await Task.WhenAll(
            startWriter.StartAsync(Ctx(userId), userId, "es"),
            timeoutWriter.HandleTimeoutAsync(Ctx(userId), sessionId, userId, "pattern_recognition"),
            secondStartWriter.StartAsync(Ctx(userId), userId, "es"));

        // Advanced exactly one step: verbal_reasoning's practice phase, item counter reset.
        Assert.Equal(("practice", "verbal_reasoning"), await ReadSessionStateAsync(sessionId));
        Assert.Equal(0, await ReadCurrentItemAsync(sessionId));

        // pattern_recognition is closed out once, with complete timing.
        var timing = await ReadSubtestTimingAsync(sessionId, "pattern_recognition");
        Assert.NotNull(timing.EndedAt);
        Assert.NotNull(timing.DurationMs);

        // verbal_reasoning's clock was never touched by the race — its one-shot start guard is intact.
        Assert.Null((await ReadSubtestTimingAsync(sessionId, "verbal_reasoning")).EndedAt);

        // Coverage for the timed-out subtest is complete and unduplicated (60 items, not 120).
        Assert.Equal(60, await CountResponsesAsync(sessionId, "pattern_recognition"));

        // THE anti-wedge assertion: the candidate can still proceed. A double-advance used to consume
        // verbal_reasoning's one-shot clock guard, making this return AlreadyStarted forever.
        var (writer, _) = MakeWriter();
        var practice = await writer.StartAsync(Ctx(userId), userId, "es");
        Assert.Equal(LiaStartStatus.Started, practice.Status);
        await CompletePracticeAsync(
            writer, userId, sessionId,
            await MakeReaderAndWriter().reader.GetPracticeQuestionsAsync(Ctx(userId), sessionId, userId)
                ?? throw new InvalidOperationException("practice questions unavailable"));

        var next = await writer.StartSubtestAsync(Ctx(userId), sessionId, userId, "verbal_reasoning");
        Assert.Equal(LiaSubtestStartStatus.Started, next.Status);
        Assert.Equal(50, next.Result!.Questions.Count);
    }

    /// <summary>
    /// THE regression pin for Important #1 — the actual wedge, forced deterministically.
    ///
    /// The dangerous interleaving is a stale-snapshot advance landing AFTER the next subtest's clock has
    /// already started. `StartAsync` reads its session snapshot WITHOUT `FOR UPDATE`, then blocks on
    /// Gate 1's reentry UPDATE; if the session moves on while it is blocked, it resumes holding a stale
    /// view and (pre-fix, with no state precondition on the advance UPDATE) rewrites
    /// `current_subtest`/`current_item`/`status` from that stale view. That RESETS a live subtest back to
    /// its practice phase — but its one-shot start guard is already consumed, so `/subtest/start` returns
    /// AlreadyStarted forever and `/answer` returns NotInProgress forever. Permanently wedged.
    ///
    /// Forced without any production seam: a raw transaction holds `FOR UPDATE` on the session row, which
    /// lets `StartAsync`'s unlocked snapshot read succeed (MVCC) but blocks it at Gate 1. While it is
    /// parked there, that transaction advances the session and starts the next subtest's clock, then
    /// commits — so `StartAsync` provably resumes with a stale snapshot.
    /// </summary>
    [Fact]
    public async Task A_stale_advance_landing_after_the_next_subtest_started_does_not_rewind_the_session()
    {
        var (userId, sessionId) = await SeedInProgressSessionAsync(
            "pattern_recognition", currentItem: 12, subtestStartedAt: DateTime.UtcNow.AddHours(-1));
        var (writer, _) = MakeWriter();

        Task<LiaStartOutcome> startTask;
        await using (var blocker = new NpgsqlConnection(_fixture.ConnectionString))
        {
            await blocker.OpenAsync();
            await using var lockTx = await blocker.BeginTransactionAsync();

            // Hold the session row. A plain SELECT is unaffected by this (MVCC), so StartAsync's
            // snapshot read still sees the pre-advance state — which is the whole point.
            await using (var lockCmd = new NpgsqlCommand(
                """SELECT "id" FROM lia_assessment_sessions WHERE id = @id FOR UPDATE""", blocker, lockTx))
            {
                lockCmd.Parameters.AddWithValue("id", sessionId);
                await lockCmd.ExecuteScalarAsync();
            }

            // StartAsync now reads its (soon-to-be-stale) snapshot, then parks on Gate 1's UPDATE.
            startTask = writer.StartAsync(Ctx(userId), userId, "es");
            await WaitUntilSomeoneIsBlockedOnALockAsync();

            // The "winner": pattern_recognition closed out, advanced to verbal_reasoning, ITS practice
            // finished and ITS CLOCK ALREADY STARTED (in_progress, item 1). This is the state a stale
            // advance must not touch.
            var winnerTimes = JsonSerializer.Serialize(new Dictionary<string, Dictionary<string, object>>
            {
                ["pattern_recognition"] = new()
                {
                    ["startedAt"] = DateTime.UtcNow.AddHours(-1).ToString("o"),
                    ["endedAt"] = DateTime.UtcNow.AddMinutes(-5).ToString("o"),
                    ["durationMs"] = 180_000,
                },
                ["verbal_reasoning"] = new() { ["startedAt"] = DateTime.UtcNow.ToString("o") },
            });
            await using (var advanceCmd = new NpgsqlCommand(
                """
                UPDATE lia_assessment_sessions SET
                    status = 'in_progress'::"LiaSessionStatus",
                    current_subtest = 'verbal_reasoning'::"LiaSubtest",
                    current_item = 1,
                    subtest_times = @times::jsonb
                WHERE id = @id
                """, blocker, lockTx))
            {
                advanceCmd.Parameters.AddWithValue("id", sessionId);
                advanceCmd.Parameters.AddWithValue("times", winnerTimes);
                await advanceCmd.ExecuteNonQueryAsync();
            }

            await lockTx.CommitAsync();
        }

        // StartAsync resumes here, holding its stale pattern_recognition snapshot, and reaches the
        // advance path for a subtest the session has already left.
        await startTask;

        // Nothing was rewound: verbal_reasoning is still LIVE at item 1.
        Assert.Equal(("in_progress", "verbal_reasoning"), await ReadSessionStateAsync(sessionId));
        Assert.Equal(1, await ReadCurrentItemAsync(sessionId));

        // verbal_reasoning's clock survived, and it was NOT closed out by the stale advance.
        var verbalTiming = await ReadSubtestTimingAsync(sessionId, "verbal_reasoning");
        Assert.Null(verbalTiming.EndedAt);

        // pattern_recognition keeps the WINNER's timing — the stale advance must not restamp it.
        var patternTiming = await ReadSubtestTimingAsync(sessionId, "pattern_recognition");
        Assert.NotNull(patternTiming.EndedAt);
        Assert.Equal(180_000L, patternTiming.DurationMs);

        // The anti-wedge assertion, and the one that actually discriminates: the candidate can still
        // answer verbal_reasoning. Pre-fix the session was sitting in 'practice' at item 0, so this
        // returned NotInProgress — forever, since verbal_reasoning's one-shot clock guard was spent.
        var answered = await writer.SubmitAnswerAsync(
            Ctx(userId), sessionId, userId,
            _fixture.QuestionId("verbal_reasoning", 1, isPractice: false), "A", 500);
        Assert.Equal(LiaSubmitAnswerStatus.Ok, answered.Status);
        Assert.Equal(1, answered.Result!.ItemsCompleted);
    }

    /// <summary>
    /// Polls until at least one backend is waiting on a lock, so the test does not race the moment
    /// StartAsync parks on Gate 1's UPDATE. Throws rather than proceeding on a state that would make the
    /// assertions meaningless.
    /// </summary>
    private async Task WaitUntilSomeoneIsBlockedOnALockAsync()
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        for (var attempt = 0; attempt < 200; attempt++)
        {
            await using var cmd = new NpgsqlCommand(
                """
                SELECT count(*) FROM pg_stat_activity
                WHERE datname = current_database() AND wait_event_type = 'Lock'
                """, conn);
            if ((long)(await cmd.ExecuteScalarAsync())! > 0)
            {
                return;
            }

            await Task.Delay(25);
        }

        throw new InvalidOperationException(
            "StartAsync never blocked on the held row lock — the interleaving this test depends on did not occur.");
    }

    // ==============================================================================================
    // Sequence helpers
    // ==============================================================================================

    /// <summary>Answers every practice item in order; the last one flips practice_completed.</summary>
    private static async Task CompletePracticeAsync(
        ILiaSessionWriter writer, string userId, string sessionId, IReadOnlyList<ClientQuestion> practiceQuestions)
    {
        for (var i = 0; i < practiceQuestions.Count; i++)
        {
            var outcome = await writer.SubmitPracticeAnswerAsync(
                Ctx(userId), sessionId, userId, practiceQuestions[i].Id, "A");
            Assert.Equal(LiaPracticeAnswerStatus.Ok, outcome.Status);
            Assert.Equal(i == practiceQuestions.Count - 1, outcome.Result!.PracticeComplete);
        }
    }

    /// <summary>
    /// Submits an answer for every served item in order, asserting each intermediate submit is Ok and
    /// only the final one reports the subtest complete. Returns the final outcome.
    /// </summary>
    private static async Task<LiaSubmitAnswerOutcome> AnswerEveryItemAsync(
        ILiaSessionWriter writer, string userId, string sessionId, IReadOnlyList<ClientQuestion> questions)
    {
        LiaSubmitAnswerOutcome outcome = null!;
        for (var i = 0; i < questions.Count; i++)
        {
            outcome = await writer.SubmitAnswerAsync(
                Ctx(userId), sessionId, userId, questions[i].Id, "A", 500);
            Assert.Equal(LiaSubmitAnswerStatus.Ok, outcome.Status);
            Assert.Equal(i + 1, outcome.Result!.ItemsCompleted);
            Assert.Equal(i == questions.Count - 1, outcome.Result.SubtestComplete);
        }

        return outcome;
    }

    /// <summary>
    /// Every served id must correspond to an actual lia_questions row. This is the assertion that fails
    /// if question ids ever regress to being synthesized from the natural key instead of resolved.
    /// </summary>
    private async Task AssertEveryIdIsARealCatalogRowAsync(IReadOnlyList<ClientQuestion> questions)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        foreach (var q in questions)
        {
            await using var cmd = new NpgsqlCommand(
                """
                SELECT "subtest"::text, "item_number", "is_practice" FROM "lia_questions" WHERE "id" = @id
                """, conn);
            cmd.Parameters.AddWithValue("id", q.Id);
            await using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(
                await reader.ReadAsync(),
                $"Served question id '{q.Id}' has no lia_questions row — it would violate lia_responses' FK.");
            Assert.Equal(q.Subtest, reader.GetString(0));
            Assert.Equal(q.ItemNumber, reader.GetInt32(1));
            Assert.Equal(q.IsPractice, reader.GetBoolean(2));
        }
    }

    // ==============================================================================================
    // Helpers — MakeWriter/Ctx/SeedUserAsync/CapturingLogger follow this directory's established
    // per-class copy convention (every LIA test class sharing LiaWriteDatabaseFixture keeps these
    // identical rather than sharing a base class).
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

    private (ILiaSessionReader reader, ILiaSessionWriter writer, CapturingLogger logger) MakeReaderAndWriter()
    {
        var factory = new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier());
        var logger = new CapturingLogger();
        var resolver = new LiaQuestionIdResolver(
            factory, _catalogCache, NullLogger<LiaQuestionIdResolver>.Instance);
        var writer = new LiaSessionWriter(factory, resolver, AuditWriter(factory), _insightsTrigger, logger);
        return (new LiaSessionReader(factory, writer, resolver), writer, logger);
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

    /// <summary>Seeds an in_progress session mid-subtest at the given current_item and clock.</summary>
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
        var practiceCompleted = JsonSerializer.Serialize(
            LiaScoring.SubtestOrder.ToDictionary(s => s, _ => true));

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

    /// <summary>Seeds an in_progress session whose subtest_times has NO entry for the current subtest.</summary>
    private async Task<(string UserId, string SessionId)> SeedInProgressSessionWithoutSubtestTimesAsync(string subtest)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times, language, updated_at)
            VALUES (@id, @userId, 'in_progress', @subtest::"LiaSubtest", 3, '{}'::jsonb, '{}'::jsonb, 'es', now())
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("userId", userId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        await cmd.ExecuteNonQueryAsync();
        return (userId, sessionId);
    }

    /// <summary>
    /// Seeds a session sitting on the FINAL item of the FINAL subtest with everything before it already
    /// answered: the four prior subtests fully covered and ended, and visual_rotation items 1..59
    /// answered with a live clock. Answering item 60 completes the whole assessment normally.
    /// </summary>
    private async Task<(string UserId, string SessionId)> SeedLastSubtestOnFinalItemAsync(int startedSecondsAgo)
    {
        var userId = Guid.NewGuid().ToString();
        var sessionId = Guid.NewGuid().ToString();
        await SeedUserAsync(userId);

        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();

        var priorEndedAt = DateTime.UtcNow.AddHours(-2);
        var visualRotationStartedAt = DateTime.UtcNow.AddSeconds(-startedSecondsAgo);
        var subtestTimes = LiaScoring.SubtestOrder.ToDictionary(
            subtest => subtest,
            subtest => subtest == "visual_rotation"
                // The last subtest is live: startedAt only, no endedAt/durationMs yet.
                ? new Dictionary<string, object> { ["startedAt"] = visualRotationStartedAt.ToString("o") }
                : new Dictionary<string, object>
                {
                    ["startedAt"] = priorEndedAt.AddMinutes(-10).ToString("o"),
                    ["endedAt"] = priorEndedAt.ToString("o"),
                    ["durationMs"] = 600_000,
                },
            StringComparer.Ordinal);
        var subtestTimesJson = JsonSerializer.Serialize(subtestTimes);
        var practiceCompletedJson = JsonSerializer.Serialize(
            LiaScoring.SubtestOrder.ToDictionary(s => s, _ => true));

        await using (var cmd = new NpgsqlCommand("""
            INSERT INTO lia_assessment_sessions
                (id, user_id, status, current_subtest, current_item, practice_completed, subtest_times,
                 "reentryCount", language, updated_at)
            VALUES (@id, @userId, 'in_progress', 'visual_rotation', 60, @practiceCompleted::jsonb,
                    @subtestTimes::jsonb, 0, 'es', now())
            """, conn))
        {
            cmd.Parameters.AddWithValue("id", sessionId);
            cmd.Parameters.AddWithValue("userId", userId);
            cmd.Parameters.AddWithValue("practiceCompleted", practiceCompletedJson);
            cmd.Parameters.AddWithValue("subtestTimes", subtestTimesJson);
            await cmd.ExecuteNonQueryAsync();
        }

        // Four prior subtests: full coverage, a realistic correct/incorrect split.
        foreach (var (subtest, counts) in new Dictionary<string, (int Correct, int Incorrect)>(StringComparer.Ordinal)
        {
            ["pattern_recognition"] = (50, 10),
            ["verbal_reasoning"] = (40, 10),
            ["numerical_speed"] = (45, 15),
            ["working_memory"] = (55, 5),
        })
        {
            await SeedAnsweredResponsesAsync(conn, sessionId, subtest, counts.Correct, counts.Incorrect);
        }

        // visual_rotation: items 1..59 answered, item 60 left for the test itself.
        await SeedAnsweredResponsesAsync(conn, sessionId, "visual_rotation", correct: 40, incorrect: 19);

        return (userId, sessionId);
    }

    /// <summary>
    /// Inserts `correct + incorrect` fully-answered response rows for one subtest. question_id is looked
    /// up from the REAL seeded lia_questions catalog — lia_responses carries the production FK
    /// lia_responses_question_id_fkey, so a synthesized string would be rejected here exactly as in prod.
    /// </summary>
    private static async Task SeedAnsweredResponsesAsync(
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

    // ==============================================================================================
    // Read-back helpers
    // ==============================================================================================

    private async Task<(string? EndedAt, long? DurationMs)> ReadSubtestTimingAsync(string sessionId, string subtest)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """
            SELECT subtest_times->@subtest->>'endedAt',
                   (subtest_times->@subtest->>'durationMs')::bigint,
                   jsonb_typeof(subtest_times->@subtest->'durationMs')
            FROM lia_assessment_sessions WHERE id = @id
            """, conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        var endedAt = reader.IsDBNull(0) ? null : reader.GetString(0);
        var durationMs = reader.IsDBNull(1) ? (long?)null : reader.GetInt64(1);
        // LiaResultsAssembler only sums durationMs when it is a JSON *number* — a string would be
        // silently ignored and total_time_seconds would stay 0, so pin the JSON type, not just the value.
        if (durationMs is not null)
        {
            Assert.Equal("number", reader.GetString(2));
        }

        return (endedAt, durationMs);
    }

    private async Task<(string Status, string? CurrentSubtest)> ReadSessionStateAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT status::text, current_subtest::text FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        return (reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    private async Task<int> ReadCurrentItemAsync(string sessionId)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("""SELECT current_item FROM lia_assessment_sessions WHERE id = @id""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        return (int)(await cmd.ExecuteScalarAsync())!;
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

    private async Task<int> CountResponsesAsync(string sessionId, string subtest)
    {
        await using var conn = new NpgsqlConnection(_fixture.ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT count(*) FROM lia_responses WHERE session_id = @id AND subtest::text = @subtest""", conn);
        cmd.Parameters.AddWithValue("id", sessionId);
        cmd.Parameters.AddWithValue("subtest", subtest);
        return (int)(long)(await cmd.ExecuteScalarAsync())!;
    }

    private async Task<(string Status, string? RawScores, string? FinalScores, string? Percentiles)> ReadScoringColumnsAsync(
        string sessionId)
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

    /// <summary>Captures log entries (shared pattern with the other LIA test classes).</summary>
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
