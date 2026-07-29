using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>completeSession</c> (services/lia/lia-results-service.ts) — the FIRST authored
/// write in the .NET backend. Under one writable RLS transaction: <c>SELECT … FOR UPDATE</c> locks the
/// session (ownership + status), an already-completed session returns its stored scores with NO write
/// (idempotency — the tims fix that stopped double-scoring/double-billing), coverage is gated (every
/// subtest fully answered), the shipped engines score, and a conditional
/// <c>UPDATE … WHERE status &lt;&gt; 'completed'</c> persists — then a PII-free audit event is emitted
/// (SOC2 CC7 / ISO A.8.15). The insights (Bedrock) trigger stays polyglot/out of this path.
/// </summary>
public sealed class LiaSessionWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<LiaSessionWriter> logger) : ILiaSessionWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new();

    private const string SelectForUpdateSql = """
        SELECT s."user_id" AS "userId", s."status"::text AS "status",
               s."subtest_times"::text AS "subtestTimes",
               s."raw_scores"::text AS "rawScores", s."final_scores"::text AS "finalScores",
               s."percentiles"::text AS "percentiles", s."response_counts"::text AS "responseCounts",
               s."global_percentile"::double precision AS "globalPercentile",
               s."performance_level" AS "performanceLevel",
               s."completed_at" AS "completedAt"
        FROM "lia_assessment_sessions" s
        WHERE s."id" = @sessionId
        FOR UPDATE
        """;

    private const string ResponsesSql = """
        SELECT "subtest"::text AS "subtest", "is_correct" AS "isCorrect"
        FROM "lia_responses" WHERE "session_id" = @sessionId
        """;

    private const string UpdateSql = """
        UPDATE "lia_assessment_sessions" SET
            "status" = 'completed'::"LiaSessionStatus",
            "completed_at" = @completedAt,
            "raw_scores" = @rawScores::jsonb,
            "final_scores" = @finalScores::jsonb,
            "percentiles" = @percentiles::jsonb,
            "global_percentile" = @globalPercentile,
            "performance_level" = @performanceLevel,
            "response_counts" = @responseCounts::jsonb,
            "updated_at" = @completedAt
        WHERE "id" = @sessionId AND "status" <> 'completed'
        """;

    public async Task<LiaCompleteOutcome> CompleteAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        SessionRow row;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectForUpdateSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaCompleteOutcome(LiaCompleteStatus.NotFound, null);
            }

            row = ReadSessionRow(reader);
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like legacy session_not_found.
        if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaCompleteOutcome(LiaCompleteStatus.NotFound, null);
        }

        // Idempotency: an already-completed session returns its stored scores, NO write.
        if (row.Status == "completed")
        {
            return new LiaCompleteOutcome(LiaCompleteStatus.Completed, BuildStoredResult(sessionId, row));
        }

        // Coverage gate 1: every subtest must have been closed out (endedAt recorded).
        if (!AllSubtestsEnded(row.SubtestTimes))
        {
            return new LiaCompleteOutcome(LiaCompleteStatus.NotInProgress, null);
        }

        // Read responses -> per-subtest coverage + response tally, all under the locked transaction.
        var counts = InitializeCounts();
        var coverage = LiaScoring.SubtestOrder.ToDictionary(s => s, _ => 0, StringComparer.Ordinal);
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = ResponsesSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var subtest = reader.GetString(0);
                if (!counts.ContainsKey(subtest))
                {
                    continue;
                }

                coverage[subtest]++;
                var isCorrect = reader.IsDBNull(1) ? (bool?)null : reader.GetBoolean(1);
                var current = counts[subtest];
                counts[subtest] = isCorrect switch
                {
                    true => current with { Correct = current.Correct + 1 },
                    false => current with { Incorrect = current.Incorrect + 1 },
                    null => current with { Unanswered = current.Unanswered + 1 },
                };
            }
        }

        // Coverage gate 2: full response coverage per subtest (legacy incomplete_coverage -> 409).
        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            if (coverage[subtest] != LiaScoring.ItemCount(subtest))
            {
                return new LiaCompleteOutcome(LiaCompleteStatus.IncompleteCoverage, null);
            }
        }

        var result = await PersistCompletionAsync(session, sessionId, counts, cancellationToken);
        await session.CommitAsync(cancellationToken);

        // Audit (SOC2 CC7.2 / ISO A.8.15): actor/action/subject/outcome — IDs only, never PII. Emitted
        // only after the durable write commits, so it can never claim a completion that did not persist.
        logger.LogInformation(
            "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
            sessionId, ownerUserId, result.GlobalPercentile, result.PerformanceLevel);

        return new LiaCompleteOutcome(LiaCompleteStatus.Completed, result);
    }

    // ================================================================================================
    // StartAsync — legacy startSession (services/lia/lia-session-service.ts + lib/proctoring.ts): an
    // atomic reentry-strike + lock gate, then resume-in-place / advance-past-timeout / fresh-create.
    // Columns "reentryCount" and "lockedAt" are unmapped camelCase in both prod and the test schema (no
    // @map in schema.prisma) — every other column here is ordinary snake_case.
    // ================================================================================================

    private const string SelectActiveSessionsForUserSql = """
        SELECT s."id", s."status"::text AS "status", s."current_subtest"::text AS "currentSubtest",
               s."current_item" AS "currentItem", s."lockedAt" AS "lockedAt",
               s."subtest_times"::text AS "subtestTimes", s."language"
        FROM "lia_assessment_sessions" s
        WHERE s."user_id" = @userId AND s."is_active" = true
        ORDER BY s."created_date" DESC
        """;

    private const string IncrementReentrySql = """
        UPDATE "lia_assessment_sessions" SET "reentryCount" = "reentryCount" + 1
        WHERE "id" = @sessionId
        RETURNING "reentryCount"
        """;

    // Guarded by "lockedAt" IS NULL — under concurrent strikes, IncrementReentrySql's row lock already
    // serializes callers on this row, so by the time a later caller reaches here an earlier one may have
    // already locked it. 0 rows affected there is a benign race (the desired end state — locked — already
    // holds), not a failure to fail-close on: unlike CompleteAsync's terminal UPDATE, this WHERE clause is
    // an idempotent guard, not an invariant that must hold.
    private const string LockSessionSql = """
        UPDATE "lia_assessment_sessions" SET "lockedAt" = @now, "flag_for_review" = true
        WHERE "id" = @sessionId AND "lockedAt" IS NULL
        """;

    private const string CreateSessionSql = """
        INSERT INTO "lia_assessment_sessions"
            ("id", "user_id", "status", "current_subtest", "current_item", "practice_completed",
             "subtest_times", "language", "updated_at")
        VALUES (@id, @userId, 'practice'::"LiaSessionStatus", @firstSubtest::"LiaSubtest", 0, @practiceCompleted::jsonb,
                '{}'::jsonb, @language, @now)
        """;

    private const int MaxReentries = 3; // legacy MAX_REENTRIES (lib/proctoring.ts).

    public async Task<LiaStartOutcome> StartAsync(
        RequestContext context, string userId, string language, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // legacy checkAccess, inlined: find an existing active session for this user.
        ActiveSessionRow? existing = null;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectActiveSessionsForUserSql;
            AddParameter(command, "userId", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken))
            {
                existing = ReadActiveSessionRow(reader);
            }
        }

        if (existing is { Status: "completed" })
        {
            return new LiaStartOutcome(LiaStartStatus.AlreadyCompleted, null);
        }

        if (existing is { Status: "practice" or "in_progress" } row)
        {
            if (row.LockedAt is not null)
            {
                return new LiaStartOutcome(LiaStartStatus.Locked, null);
            }

            if (row.Status == "practice")
            {
                // legacy: an interrupted practice phase resumes cleanly at its own practice questions.
                var currentSubtest = row.CurrentSubtest ?? LiaSubtestOrder.Order[0];
                return new LiaStartOutcome(LiaStartStatus.Started, new LiaSessionStartPayload(
                    row.Id, currentSubtest, LiaQuestionServing.FetchPracticeQuestions(currentSubtest, language)));
            }

            // status == "in_progress": Gate 1 (strike + lock), atomic. IncrementReentrySql's row-level
            // UPDATE lock is what actually serializes concurrent /start calls on this session — there is
            // no separate SELECT ... FOR UPDATE here.
            int reentryCount;
            await using (var command = session.Connection.CreateCommand())
            {
                command.Transaction = session.Transaction;
                command.CommandText = IncrementReentrySql;
                AddParameter(command, "sessionId", row.Id);
                var result = await command.ExecuteScalarAsync(cancellationToken);
                if (result is null)
                {
                    logger.LogError("lia.session.start reentry increment matched 0 rows sessionId={SessionId}", row.Id);
                    throw new InvalidOperationException($"LIA reentry increment affected 0 rows for session {row.Id}");
                }

                reentryCount = (int)result;
            }

            if (reentryCount > MaxReentries)
            {
                await using (var command = session.Connection.CreateCommand())
                {
                    command.Transaction = session.Transaction;
                    command.CommandText = LockSessionSql;
                    AddParameter(command, "sessionId", row.Id);
                    AddTimestampParameter(command, "now", NowTruncated());
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }

                await session.CommitAsync(cancellationToken);
                return new LiaStartOutcome(LiaStartStatus.Locked, null);
            }

            // Gate 2: expired clock -> shared timeout path.
            var expiry = await ExpireIfPastDeadlineAsync(session, row.Id, row.CurrentSubtest, row.SubtestTimes, cancellationToken);
            if (expiry is not null)
            {
                await session.CommitAsync(cancellationToken);
                if (expiry.AssessmentComplete)
                {
                    if (expiry.Completion is { } completion)
                    {
                        // Audit only after the commit above succeeds, mirroring CompleteAsync's own
                        // ordering — a completion audit can never be emitted for a write that didn't
                        // durably persist.
                        logger.LogInformation(
                            "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
                            row.Id, userId, completion.GlobalPercentile, completion.PerformanceLevel);
                    }

                    return new LiaStartOutcome(LiaStartStatus.AlreadyCompleted, null);
                }

                return new LiaStartOutcome(LiaStartStatus.Started, new LiaSessionStartPayload(
                    row.Id, expiry.NextSubtest!, LiaQuestionServing.FetchPracticeQuestions(expiry.NextSubtest!, language),
                    ResumeMode: "next_subtest"));
            }

            // Gate 3: resume in place, clock untouched.
            await session.CommitAsync(cancellationToken);
            var subtest = row.CurrentSubtest!;
            var startedAt = ReadSubtestStartedAt(row.SubtestTimes, subtest);
            return new LiaStartOutcome(LiaStartStatus.Started, new LiaSessionStartPayload(
                row.Id, subtest, [], ResumeMode: "mid_subtest", CurrentItem: row.CurrentItem,
                StartedAt: startedAt, TimeLimitSeconds: LiaSubtestOrder.TimeSeconds[subtest],
                Questions: LiaQuestionServing.FetchAssessmentQuestions(subtest, language, LiaSubtestOrder.ItemCounts[subtest])));
        }

        // No existing session (or an existing not_started/abandoned row, which never blocks a fresh
        // start): fresh create.
        var newId = Guid.NewGuid().ToString();
        var firstSubtest = LiaSubtestOrder.Order[0];
        var practiceCompletedJson = JsonSerializer.Serialize(
            LiaSubtestOrder.Order.ToDictionary(s => s, _ => false), JsonOptions);
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = CreateSessionSql;
            AddParameter(command, "id", newId);
            AddParameter(command, "userId", userId);
            AddParameter(command, "firstSubtest", firstSubtest);
            AddParameter(command, "practiceCompleted", practiceCompletedJson);
            AddParameter(command, "language", language);
            AddTimestampParameter(command, "now", NowTruncated());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new LiaStartOutcome(LiaStartStatus.Started, new LiaSessionStartPayload(
            newId, firstSubtest, LiaQuestionServing.FetchPracticeQuestions(firstSubtest, language)));
    }

    // legacy expireIfPastDeadline. Returns null if the subtest's clock has not expired.
    private async Task<TimeoutAdvanceResult?> ExpireIfPastDeadlineAsync(
        FormMapsDatabaseSession session, string sessionId, string? currentSubtest, string? subtestTimesJson,
        CancellationToken cancellationToken)
    {
        if (currentSubtest is null)
        {
            return null;
        }

        var startedAt = ReadSubtestStartedAt(subtestTimesJson, currentSubtest);
        if (startedAt is null)
        {
            return null;
        }

        // AssumeUniversal|AdjustToUniversal (not RoundtripKind, which .NET rejects when combined with
        // AdjustToUniversal): a startedAt with no offset info is assumed UTC rather than local server
        // time, and the result Kind is always Utc regardless of whether the source string carried an
        // explicit "Z"/offset.
        var deadline = DateTime.Parse(
                startedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal)
            .AddSeconds(LiaSubtestOrder.TimeSeconds[currentSubtest])
            .AddMilliseconds(LiaSubtestOrder.TimerGraceMs);
        if (DateTime.UtcNow <= deadline)
        {
            return null;
        }

        return await ApplyTimeoutAsync(session, sessionId, currentSubtest, cancellationToken);
    }

    // legacy applyTimeout: fill every unanswered live item with a null response, then advance.
    private async Task<TimeoutAdvanceResult> ApplyTimeoutAsync(
        FormMapsDatabaseSession session, string sessionId, string subtest, CancellationToken cancellationToken)
    {
        var itemCount = LiaSubtestOrder.ItemCounts[subtest];
        var served = LiaQuestionServing.FetchAssessmentQuestions(subtest, "es", itemCount); // language doesn't affect ids/coverage.

        var answeredIds = new HashSet<string>(StringComparer.Ordinal);
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = """SELECT "question_id" FROM "lia_responses" WHERE "session_id" = @sessionId""";
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                answeredIds.Add(reader.GetString(0));
            }
        }

        foreach (var q in served.Where(q => !answeredIds.Contains(q.Id)))
        {
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = """
                INSERT INTO "lia_responses"
                    ("id", "session_id", "question_id", "subtest", "item_number", "user_answer", "is_correct",
                     "answered_at", "time_spent_ms", "updated_at")
                VALUES (@id, @sessionId, @questionId, @subtest::"LiaSubtest", @itemNumber, NULL, NULL, @now, 0, @now)
                ON CONFLICT ("session_id", "question_id") DO NOTHING
                """;
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "questionId", q.Id);
            AddParameter(command, "subtest", subtest);
            AddParameter(command, "itemNumber", q.ItemNumber);
            AddTimestampParameter(command, "now", NowTruncated());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return await AdvancePastSubtestAsync(session, sessionId, subtest, cancellationToken);
    }

    // legacy advancePastSubtest (+ recordSubtestEnd folded in): stamp endedAt on the current subtest,
    // then move to the next subtest's practice phase, or mark full assessment completion.
    private async Task<TimeoutAdvanceResult> AdvancePastSubtestAsync(
        FormMapsDatabaseSession session, string sessionId, string subtest, CancellationToken cancellationToken)
    {
        var idx = LiaSubtestOrder.Order.ToList().IndexOf(subtest);
        var isLast = idx == LiaSubtestOrder.Order.Count - 1;
        var nextSubtest = isLast ? null : LiaSubtestOrder.Order[idx + 1];

        int affected;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            // Build the per-subtest object defensively via jsonb_build_object + COALESCE rather than
            // jsonb_set: jsonb_set silently no-ops (row still matches, "endedAt" never lands) when
            // subtest_times has no object yet under this subtest's key. That's unreachable from
            // StartAsync's own Gate 2 today (it requires startedAt to already exist), but this helper is
            // shared with Task 5's SubmitAnswerAsync where that precondition won't hold.
            if (isLast)
            {
                // Status is deliberately left as-is here (still "in_progress") — PersistCompletionAsync
                // below flips it to "completed" as part of writing REAL scores, matching legacy's
                // applyTimeout, which calls completeSession() inline rather than just flagging status.
                command.CommandText = """
                    UPDATE "lia_assessment_sessions"
                    SET "subtest_times" = "subtest_times" || jsonb_build_object(
                            @subtest, COALESCE("subtest_times"->@subtest, '{}'::jsonb) || jsonb_build_object('endedAt', @now::text))
                    WHERE "id" = @sessionId
                    """;
            }
            else
            {
                command.CommandText = """
                    UPDATE "lia_assessment_sessions"
                    SET "subtest_times" = "subtest_times" || jsonb_build_object(
                            @subtest, COALESCE("subtest_times"->@subtest, '{}'::jsonb) || jsonb_build_object('endedAt', @now::text)),
                        "current_subtest" = @nextSubtest::"LiaSubtest", "current_item" = 0,
                        "status" = 'practice'::"LiaSessionStatus"
                    WHERE "id" = @sessionId
                    """;
                AddParameter(command, "nextSubtest", nextSubtest!);
            }

            AddParameter(command, "subtest", subtest);
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "now", ToIsoZ(NowTruncated()));
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // This UPDATE targets the session by primary key only, inside the same transaction that just
        // confirmed the row exists — 0 rows affected here means the row vanished mid-transaction, which
        // must never pass silently (processing integrity, matches CompleteAsync's UpdateSql rigor).
        if (affected == 0)
        {
            logger.LogError("lia.session.start advance-past-subtest matched 0 rows sessionId={SessionId}", sessionId);
            throw new InvalidOperationException($"LIA advance-past-subtest update affected 0 rows for session {sessionId}");
        }

        if (isLast)
        {
            // legacy applyTimeout calls completeSession() inline the moment the assessment truly
            // finishes. Coverage is trusted via the state-machine invariant: every subtest is only ever
            // advanced-past once ApplyTimeoutAsync (or a real submit) has fully filled it, so — unlike
            // CompleteAsync's own HTTP-driven entry point, which has no such guarantee — no separate
            // coverage-gate re-check is needed here before scoring.
            var counts = await ReadResponseCountsAsync(session, sessionId, cancellationToken);
            var completion = await PersistCompletionAsync(session, sessionId, counts, cancellationToken);
            return new TimeoutAdvanceResult(null, AssessmentComplete: true, completion);
        }

        return new TimeoutAdvanceResult(nextSubtest, isLast);
    }

    // ================================================================================================
    // StartSubtestAsync — legacy startSubtest (services/lia/lia-subtest-service.ts): a one-shot clock
    // guard enforced as an atomic SQL predicate, not a separate read-then-write step. Practice must be
    // marked complete for the subtest, and the subtest's own subtest_times entry must have no
    // "startedAt" yet — live OR ended — or the write is rejected in the SAME statement that would have
    // performed it (no read/write TOCTOU window to race in).
    // ================================================================================================

    private const string SelectSessionForSubtestStartSql = """
        SELECT "user_id" AS "userId", "practice_completed"::text AS "practiceCompleted",
               "subtest_times"::text AS "subtestTimes", "language", "started_at" AS "startedAt"
        FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        """;

    // One-shot guard AS A SQL PREDICATE: reject in the SAME statement that writes subtestTimes if the
    // target subtest already has a startedAt, live or ended — stronger than Node's two-step
    // read-then-conditional-write, since there's no window between the check and the write to race in.
    //
    // Builds the per-subtest object defensively via jsonb_build_object + COALESCE rather than jsonb_set:
    // jsonb_set only auto-creates the FINAL path element, never an intermediate object, so
    // jsonb_set(subtest_times, ARRAY[@subtest, 'startedAt'], ...) silently no-ops — status/current_subtest/
    // current_item update but startedAt never persists — for the COMMON case where subtest_times has no
    // object yet under @subtest (a subtest being started for the very first time). Same defect class
    // Task 3's AdvancePastSubtestAsync guards against with the identical pattern.
    private const string StartSubtestIfNeverStartedSql = """
        UPDATE "lia_assessment_sessions" SET
            "status" = 'in_progress'::"LiaSessionStatus",
            "current_subtest" = @subtest::"LiaSubtest",
            "current_item" = 1,
            "subtest_times" = "subtest_times" || jsonb_build_object(
                @subtest, COALESCE("subtest_times"->@subtest, '{}'::jsonb) || jsonb_build_object('startedAt', @startedAt::text)),
            "started_at" = COALESCE("started_at", @now)
        WHERE "id" = @sessionId
          AND NOT ("subtest_times" ? @subtest AND "subtest_times"->@subtest ? 'startedAt')
        """;

    public async Task<LiaSubtestStartOutcome> StartSubtestAsync(
        RequestContext context, string sessionId, string ownerUserId, string subtest,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        SubtestStartSessionRow row;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionForSubtestStartSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaSubtestStartOutcome(LiaSubtestStartStatus.NotFound, null);
            }

            row = new SubtestStartSessionRow(
                reader.GetString(reader.GetOrdinal("userId")),
                ReadNullableString(reader, "practiceCompleted"),
                ReadNullableString(reader, "subtestTimes"),
                reader.GetString(reader.GetOrdinal("language")),
                ReadNullableDateTime(reader, "startedAt"));
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like every other writer here.
        if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaSubtestStartOutcome(LiaSubtestStartStatus.NotFound, null);
        }

        if (!IsPracticeCompleted(row.PracticeCompleted, subtest))
        {
            return new LiaSubtestStartOutcome(LiaSubtestStartStatus.PracticeIncomplete, null);
        }

        var startedAt = NowTruncated();
        int affected;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = StartSubtestIfNeverStartedSql;
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "subtest", subtest);
            AddParameter(command, "startedAt", ToIsoZ(startedAt));
            AddTimestampParameter(command, "now", startedAt);
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (affected == 0)
        {
            // The WHERE guard rejected: subtestTimes[subtest].startedAt already exists (live or ended).
            return new LiaSubtestStartOutcome(LiaSubtestStartStatus.AlreadyStarted, null);
        }

        await session.CommitAsync(cancellationToken);
        var itemCount = LiaSubtestOrder.ItemCounts[subtest];
        return new LiaSubtestStartOutcome(LiaSubtestStartStatus.Started, new SubtestStartResult(
            sessionId, subtest, LiaQuestionServing.FetchAssessmentQuestions(subtest, row.Language, itemCount),
            LiaSubtestOrder.TimeSeconds[subtest], ToIsoZ(startedAt)));
    }

    private static bool IsPracticeCompleted(string? practiceCompletedJson, string subtest)
    {
        if (string.IsNullOrEmpty(practiceCompletedJson))
        {
            return false;
        }

        using var doc = JsonDocument.Parse(practiceCompletedJson);
        return doc.RootElement.TryGetProperty(subtest, out var value)
            && value.ValueKind == JsonValueKind.True;
    }

    private sealed record SubtestStartSessionRow(
        string UserId, string? PracticeCompleted, string? SubtestTimes, string Language, DateTime? StartedAt);

    private static string? ReadSubtestStartedAt(string? subtestTimesJson, string subtest)
    {
        if (string.IsNullOrEmpty(subtestTimesJson))
        {
            return null;
        }

        using var doc = JsonDocument.Parse(subtestTimesJson);
        return doc.RootElement.TryGetProperty(subtest, out var timing)
            && timing.TryGetProperty("startedAt", out var startedAt)
            ? startedAt.GetString()
            : null;
    }

    // Thin wrapper around the existing TruncateToMilliseconds truncation pattern (see CompleteAsync's
    // completedAt construction) — reused here rather than re-deriving the truncation logic.
    private static DateTime NowTruncated() =>
        TruncateToMilliseconds(DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified));

    private static ActiveSessionRow ReadActiveSessionRow(DbDataReader reader) => new(
        Id: reader.GetString(reader.GetOrdinal("id")),
        Status: reader.GetString(reader.GetOrdinal("status")),
        CurrentSubtest: ReadNullableString(reader, "currentSubtest"),
        CurrentItem: reader.GetInt32(reader.GetOrdinal("currentItem")),
        LockedAt: ReadNullableDateTime(reader, "lockedAt"),
        SubtestTimes: ReadNullableString(reader, "subtestTimes"),
        Language: reader.GetString(reader.GetOrdinal("language")));

    private sealed record ActiveSessionRow(
        string Id, string Status, string? CurrentSubtest, int CurrentItem, DateTime? LockedAt,
        string? SubtestTimes, string Language);

    private static LiaCompletionResult BuildStoredResult(string sessionId, SessionRow row)
    {
        return new LiaCompletionResult(
            SessionId: sessionId,
            RawScores: DeserializeMap<double>(row.RawScores),
            FinalScores: DeserializeMap<double>(row.FinalScores),
            Percentiles: DeserializeMap<int>(row.Percentiles),
            GlobalPercentile: row.GlobalPercentile ?? 0,
            PerformanceLevel: row.PerformanceLevel ?? "insufficient",
            ResponseCounts: DeserializeCounts(row.ResponseCounts),
            // legacy: completedAt?.toISOString() ?? new Date(0).toISOString()
            CompletedAt: row.CompletedAt is { } dt ? ToIsoZ(dt) : "1970-01-01T00:00:00.000Z");
    }

    private static Dictionary<string, ResponseCount> InitializeCounts() =>
        LiaScoring.SubtestOrder.ToDictionary(s => s, _ => new ResponseCount(0, 0, 0), StringComparer.Ordinal);

    // Shared per-subtest correct/incorrect/unanswered tally from lia_responses. CompleteAsync's own
    // coverage-gate loop stays inline and untouched (it also needs a separate per-subtest answered-count
    // for its coverage gate, which this helper doesn't compute) — this is a fresh read for the
    // timeout-driven completion path below, where counts must reflect items ApplyTimeoutAsync just
    // inserted in this SAME open transaction (Postgres sees its own uncommitted writes).
    private static async Task<Dictionary<string, ResponseCount>> ReadResponseCountsAsync(
        FormMapsDatabaseSession session, string sessionId, CancellationToken cancellationToken)
    {
        var counts = InitializeCounts();
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = ResponsesSql;
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var subtest = reader.GetString(0);
            if (!counts.ContainsKey(subtest))
            {
                continue;
            }

            var isCorrect = reader.IsDBNull(1) ? (bool?)null : reader.GetBoolean(1);
            var current = counts[subtest];
            counts[subtest] = isCorrect switch
            {
                true => current with { Correct = current.Correct + 1 },
                false => current with { Incorrect = current.Incorrect + 1 },
                null => current with { Unanswered = current.Unanswered + 1 },
            };
        }

        return counts;
    }

    // Shared scoring+persist tail for BOTH the HTTP-driven CompleteAsync path and the timeout-driven
    // completion inside AdvancePastSubtestAsync's isLast branch (legacy: both call completeSession()).
    // Deliberately does NOT commit or audit-log — callers own the transaction's commit boundary
    // (CompleteAsync commits immediately after; the timeout-driven path batches this into a larger
    // transaction the top-level caller commits later) and must audit-log ONLY after their own commit
    // succeeds, so a completion audit can never be emitted for a write that didn't durably persist.
    private async Task<LiaCompletionResult> PersistCompletionAsync(
        FormMapsDatabaseSession session, string sessionId,
        Dictionary<string, ResponseCount> counts, CancellationToken cancellationToken)
    {
        var scored = LiaCompletionScorer.ScoreCompletion(counts);
        var completedAt = NowTruncated();

        int affected;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = UpdateSql;
            AddParameter(command, "sessionId", sessionId);
            AddTimestampParameter(command, "completedAt", completedAt);
            AddParameter(command, "rawScores", Serialize(scored.RawScores));
            AddParameter(command, "finalScores", Serialize(scored.FinalScores));
            AddParameter(command, "percentiles", Serialize(scored.Percentiles));
            AddParameter(command, "globalPercentile", (decimal)scored.GlobalPercentile);
            AddParameter(command, "performanceLevel", scored.PerformanceLevel);
            AddParameter(command, "responseCounts", Serialize(counts));
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        if (affected == 0)
        {
            logger.LogError("lia.session.complete conditional update matched 0 rows sessionId={SessionId}", sessionId);
            throw new InvalidOperationException($"LIA completion update affected 0 rows for session {sessionId}");
        }

        return new LiaCompletionResult(
            SessionId: sessionId,
            RawScores: scored.RawScores,
            FinalScores: scored.FinalScores,
            Percentiles: scored.Percentiles,
            GlobalPercentile: scored.GlobalPercentile,
            PerformanceLevel: scored.PerformanceLevel,
            ResponseCounts: counts,
            CompletedAt: ToIsoZ(completedAt));
    }

    private static bool AllSubtestsEnded(string? subtestTimesJson)
    {
        using var document = JsonDocument.Parse(string.IsNullOrEmpty(subtestTimesJson) ? "{}" : subtestTimesJson);
        if (document.RootElement.ValueKind != JsonValueKind.Object)
        {
            return false;
        }

        foreach (var subtest in LiaScoring.SubtestOrder)
        {
            if (!document.RootElement.TryGetProperty(subtest, out var timing)
                || timing.ValueKind != JsonValueKind.Object
                || !timing.TryGetProperty("endedAt", out var endedAt)
                || endedAt.ValueKind != JsonValueKind.String
                || string.IsNullOrEmpty(endedAt.GetString()))
            {
                return false; // !!times[s]?.endedAt -> false
            }
        }

        return true;
    }

    private static SessionRow ReadSessionRow(DbDataReader reader) => new(
        UserId: reader.GetString(reader.GetOrdinal("userId")),
        Status: reader.GetString(reader.GetOrdinal("status")),
        SubtestTimes: ReadNullableString(reader, "subtestTimes"),
        RawScores: ReadNullableString(reader, "rawScores"),
        FinalScores: ReadNullableString(reader, "finalScores"),
        Percentiles: ReadNullableString(reader, "percentiles"),
        ResponseCounts: ReadNullableString(reader, "responseCounts"),
        GlobalPercentile: ReadNullableDouble(reader, "globalPercentile"),
        PerformanceLevel: ReadNullableString(reader, "performanceLevel"),
        CompletedAt: ReadNullableDateTime(reader, "completedAt"));

    private static string Serialize(object value) => JsonSerializer.Serialize(value, JsonOptions);

    private static Dictionary<string, T> DeserializeMap<T>(string? json) =>
        string.IsNullOrEmpty(json) || json == "null"
            ? new Dictionary<string, T>(StringComparer.Ordinal)
            : JsonSerializer.Deserialize<Dictionary<string, T>>(json, JsonOptions) ?? new Dictionary<string, T>(StringComparer.Ordinal);

    private static Dictionary<string, ResponseCount> DeserializeCounts(string? json) =>
        string.IsNullOrEmpty(json) || json == "null"
            ? new Dictionary<string, ResponseCount>(StringComparer.Ordinal)
            : JsonSerializer.Deserialize<Dictionary<string, ResponseCount>>(json, JsonOptions) ?? new Dictionary<string, ResponseCount>(StringComparer.Ordinal);

    private static string ToIsoZ(DateTime value) =>
        value.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    // Drop sub-millisecond ticks so the value round-trips a Postgres timestamp(3) column unchanged.
    private static DateTime TruncateToMilliseconds(DateTime value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Kind);

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // Bind a `timestamp` (without time zone) value tz-independently — DbType.DateTime2 maps to Postgres
    // `timestamp`, matching the Prisma @db.Timestamp(3) columns and never applying a TimeZone cast.
    private static void AddTimestampParameter(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static double? ReadNullableDouble(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetDouble(ordinal);
    }

    private static DateTime? ReadNullableDateTime(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);
    }

    private sealed record SessionRow(
        string UserId,
        string Status,
        string? SubtestTimes,
        string? RawScores,
        string? FinalScores,
        string? Percentiles,
        string? ResponseCounts,
        double? GlobalPercentile,
        string? PerformanceLevel,
        DateTime? CompletedAt);
}
