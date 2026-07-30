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
    ILiaQuestionIdResolver questionIdResolver,
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

        var result = await PersistCompletionAsync(session, sessionId, counts, "complete", cancellationToken);
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
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

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
                    row.Id, currentSubtest,
                    await LiaQuestionServing.FetchPracticeQuestionsAsync(
                        questionIdResolver, context, currentSubtest, language, cancellationToken)));
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
            var expiry = await ExpireIfPastDeadlineAsync(
                context, session, row.Id, row.CurrentSubtest, row.SubtestTimes, cancellationToken);
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
                    row.Id, expiry.NextSubtest!,
                    await LiaQuestionServing.FetchPracticeQuestionsAsync(
                        questionIdResolver, context, expiry.NextSubtest!, language, cancellationToken),
                    ResumeMode: "next_subtest"));
            }

            // Gate 3: resume in place, clock untouched.
            await session.CommitAsync(cancellationToken);
            var subtest = row.CurrentSubtest!;
            var startedAt = ReadSubtestStartedAt(row.SubtestTimes, subtest);
            return new LiaStartOutcome(LiaStartStatus.Started, new LiaSessionStartPayload(
                row.Id, subtest, [], ResumeMode: "mid_subtest", CurrentItem: row.CurrentItem,
                StartedAt: startedAt, TimeLimitSeconds: LiaSubtestOrder.TimeSeconds[subtest],
                Questions: await LiaQuestionServing.FetchAssessmentQuestionsAsync(
                    questionIdResolver, context, subtest, language, LiaSubtestOrder.ItemCounts[subtest], cancellationToken)));
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
            newId, firstSubtest,
            await LiaQuestionServing.FetchPracticeQuestionsAsync(
                questionIdResolver, context, firstSubtest, language, cancellationToken)));
    }

    // legacy expireIfPastDeadline. Returns null if the subtest's clock has not expired.
    private async Task<TimeoutAdvanceResult?> ExpireIfPastDeadlineAsync(
        RequestContext context, FormMapsDatabaseSession session, string sessionId, string? currentSubtest,
        string? subtestTimesJson, CancellationToken cancellationToken)
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

        var deadline = ParseIsoAsUnspecifiedUtc(startedAt)
            .AddSeconds(LiaSubtestOrder.TimeSeconds[currentSubtest])
            .AddMilliseconds(LiaSubtestOrder.TimerGraceMs);
        if (NowTruncated() <= deadline)
        {
            return null;
        }

        return await ApplyTimeoutAsync(context, session, sessionId, currentSubtest, cancellationToken);
    }

    // legacy applyTimeout: fill every unanswered live item with a null response, then advance.
    private async Task<TimeoutAdvanceResult> ApplyTimeoutAsync(
        RequestContext context, FormMapsDatabaseSession session, string sessionId, string subtest,
        CancellationToken cancellationToken)
    {
        var itemCount = LiaSubtestOrder.ItemCounts[subtest];
        // language doesn't affect ids/coverage — only the question text this path never reads.
        var served = await LiaQuestionServing.FetchAssessmentQuestionsAsync(
            questionIdResolver, context, subtest, "es", itemCount, cancellationToken);

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

        var unanswered = served.Where(q => !answeredIds.Contains(q.Id)).ToList();
        if (unanswered.Count > 0)
        {
            // ONE round-trip for all (up to 60) unanswered items via unnest over parameter arrays,
            // rather than a loop of individual INSERTs. This whole method runs while HOLDING the
            // session row's FOR UPDATE lock, and since Task 7 every GET /session/{id} takes that same
            // lock — so 60 sequential round-trips here directly serialize against the candidate's own
            // polling. ON CONFLICT DO NOTHING keeps the same idempotency the per-item version had.
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = """
                INSERT INTO "lia_responses"
                    ("id", "session_id", "question_id", "subtest", "item_number", "user_answer", "is_correct",
                     "answered_at", "time_spent_ms", "updated_at")
                SELECT u."id", @sessionId, u."questionId", @subtest::"LiaSubtest", u."itemNumber",
                       NULL, NULL, @now, 0, @now
                FROM unnest(@ids, @questionIds, @itemNumbers) AS u("id", "questionId", "itemNumber")
                ON CONFLICT ("session_id", "question_id") DO NOTHING
                """;
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "subtest", subtest);
            AddParameter(command, "ids", unanswered.Select(_ => Guid.NewGuid().ToString()).ToArray());
            AddParameter(command, "questionIds", unanswered.Select(q => q.Id).ToArray());
            AddParameter(command, "itemNumbers", unanswered.Select(q => q.ItemNumber).ToArray());
            AddTimestampParameter(command, "now", NowTruncated());
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        return await AdvancePastSubtestAsync(context, session, sessionId, subtest, cancellationToken);
    }

    // Locking re-read used by AdvancePastSubtestAsync before it decides anything: the snapshot its
    // callers hand it can be stale (StartAsync's Gate 2 in particular reads WITHOUT FOR UPDATE), and
    // this method both stamps timing into subtest_times and moves the state machine forward, so it must
    // observe the CURRENT row. FOR UPDATE blocks until any concurrent advancer/completer commits.
    private const string SelectAdvanceStateForUpdateSql = """
        SELECT "status"::text AS "status", "current_subtest"::text AS "currentSubtest",
               "subtest_times"::text AS "subtestTimes"
        FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        FOR UPDATE
        """;

    // legacy advancePastSubtest (+ recordSubtestEnd folded in): stamp endedAt AND durationMs on the
    // current subtest, then move to the next subtest's practice phase, or mark full assessment
    // completion.
    private async Task<TimeoutAdvanceResult> AdvancePastSubtestAsync(
        RequestContext context, FormMapsDatabaseSession session, string sessionId, string subtest,
        CancellationToken cancellationToken)
    {
        var idx = LiaSubtestOrder.Order.ToList().IndexOf(subtest);
        if (idx < 0)
        {
            // Guard an unrecognized subtest explicitly. Left unguarded, idx == -1 made the "next
            // subtest" expression Order[idx + 1] evaluate to Order[0] — silently REWINDING the session
            // to the first subtest (and re-opening its practice phase) instead of failing. This helper
            // now has five callers, so an unrecognized value must fail loudly rather than corrupt state.
            logger.LogError(
                "lia.session.advance-past-subtest unrecognized subtest={Subtest} sessionId={SessionId}", subtest, sessionId);
            throw new InvalidOperationException(
                $"LIA advance-past-subtest: '{subtest}' is not a known LIA subtest (session {sessionId}).");
        }

        var isLast = idx == LiaSubtestOrder.Order.Count - 1;
        var nextSubtest = isLast ? null : LiaSubtestOrder.Order[idx + 1];

        // Re-read the row under a lock FIRST. This serves three purposes at once: it supplies the
        // authoritative subtest_times (needed for durationMs below), it detects the benign
        // "someone else already advanced/completed this" races before any write, and it replaces the
        // narrower post-UPDATE status re-check the isLast branch used to do on its own.
        string lockedStatus;
        string? lockedCurrentSubtest;
        string? lockedSubtestTimes;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectAdvanceStateForUpdateSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                logger.LogError(
                    "lia.session.advance-past-subtest state re-check found no row sessionId={SessionId}", sessionId);
                throw new InvalidOperationException(
                    $"LIA advance-past-subtest state re-check found no row for session {sessionId}");
            }

            lockedStatus = reader.GetString(0);
            lockedCurrentSubtest = ReadNullableString(reader, "currentSubtest");
            lockedSubtestTimes = ReadNullableString(reader, "subtestTimes");
        }

        if (lockedStatus == "completed")
        {
            // Someone else already completed this session first — AlreadyCompleted with NO Completion.
            // Every caller treats a null Completion as "no audit, still complete" (the transaction that
            // actually completed it emitted its own audit on its own commit). Returning here also
            // avoids overwriting that transaction's endedAt/durationMs with our own later timestamps.
            return new TimeoutAdvanceResult(null, AssessmentComplete: true);
        }

        if (lockedStatus != "in_progress" || !string.Equals(lockedCurrentSubtest, subtest, StringComparison.Ordinal))
        {
            // Benign race, NOT an invariant violation: a concurrent /start, /answer, /timeout or lazy-
            // expiry GET already advanced past this exact subtest. Without this check (and the matching
            // WHERE precondition below) both callers would advance, the second overwriting the first's
            // progress and rewinding current_subtest/current_item/status — permanently wedging the
            // session, since the one-shot subtest-start guard has already been consumed. Report the
            // state the winner left behind rather than re-doing its work.
            logger.LogInformation(
                "lia.session.advance-past-subtest already advanced by a concurrent caller sessionId={SessionId} subtest={Subtest} status={Status} currentSubtest={CurrentSubtest}",
                sessionId, subtest, lockedStatus, lockedCurrentSubtest);
            return new TimeoutAdvanceResult(lockedCurrentSubtest, AssessmentComplete: false);
        }

        // legacy recordSubtestEnd writes BOTH endedAt and durationMs. durationMs is a wall-clock delta
        // that cannot be reconstructed once this transaction ends, and LiaResultsAssembler (an
        // already-live read path) sums it to produce total_time_seconds — so omitting it silently and
        // permanently reports 0 time spent on every already-shipped results surface. legacy falls back
        // to `new Date()` when startedAt is missing, which yields ~0 rather than an absent key; mirrored
        // here as a literal 0 so the key is always present and always a JSON number.
        var endedAt = NowTruncated();
        var startedAtIso = ReadSubtestStartedAt(lockedSubtestTimes, subtest);
        var durationMs = startedAtIso is null
            ? 0L
            : (long)Math.Max(0, (endedAt - ParseIsoAsUnspecifiedUtc(startedAtIso)).TotalMilliseconds);

        int affected;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            // Build the per-subtest object defensively via jsonb_build_object + COALESCE rather than
            // jsonb_set: jsonb_set silently no-ops (row still matches, "endedAt" never lands) when
            // subtest_times has no object yet under this subtest's key — the NORMAL case when
            // SubmitAnswerAsync closes out a subtest.
            //
            // Both branches carry the state precondition (status + current_subtest) as part of the
            // WHERE clause, so the conditional UPDATE itself — not just the read above — enforces
            // "advance past this subtest exactly once".
            if (isLast)
            {
                // Status is deliberately left as-is here (still "in_progress") — PersistCompletionAsync
                // below flips it to "completed" as part of writing REAL scores, matching legacy's
                // applyTimeout, which calls completeSession() inline rather than just flagging status.
                command.CommandText = """
                    UPDATE "lia_assessment_sessions"
                    SET "subtest_times" = "subtest_times" || jsonb_build_object(
                            @subtest, COALESCE("subtest_times"->@subtest, '{}'::jsonb)
                                || jsonb_build_object('endedAt', @now::text, 'durationMs', @durationMs))
                    WHERE "id" = @sessionId
                      AND "status" = 'in_progress'::"LiaSessionStatus"
                      AND "current_subtest" = @subtest::"LiaSubtest"
                    """;
            }
            else
            {
                command.CommandText = """
                    UPDATE "lia_assessment_sessions"
                    SET "subtest_times" = "subtest_times" || jsonb_build_object(
                            @subtest, COALESCE("subtest_times"->@subtest, '{}'::jsonb)
                                || jsonb_build_object('endedAt', @now::text, 'durationMs', @durationMs)),
                        "current_subtest" = @nextSubtest::"LiaSubtest", "current_item" = 0,
                        "status" = 'practice'::"LiaSessionStatus"
                    WHERE "id" = @sessionId
                      AND "status" = 'in_progress'::"LiaSessionStatus"
                      AND "current_subtest" = @subtest::"LiaSubtest"
                    """;
                AddParameter(command, "nextSubtest", nextSubtest!);
            }

            AddParameter(command, "subtest", subtest);
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "now", ToIsoZ(endedAt));
            AddParameter(command, "durationMs", durationMs);
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // 0 rows is now a BENIGN outcome for this specific UPDATE, not a fail-closed violation: the
        // WHERE clause is an idempotent "only if still on this subtest" guard (like StartAsync's
        // LockSessionSql), not an invariant that must hold. We hold FOR UPDATE from the read above, so
        // reaching here should be impossible — but if it happens, someone else advanced and re-doing
        // their work is the wrong response. Every OTHER 0-row check in this file stays fail-closed.
        if (affected == 0)
        {
            logger.LogWarning(
                "lia.session.advance-past-subtest conditional update matched 0 rows (already advanced) sessionId={SessionId} subtest={Subtest}",
                sessionId, subtest);
            // Report what the winner's advance actually means rather than a self-contradictory shape: on
            // the LAST subtest "someone else advanced past it" IS assessment completion (with no
            // Completion of our own to hand back — theirs was audited on their own commit); anywhere
            // else it is simply the next subtest. Returning here also skips the scoring below, which
            // would otherwise double-score work another transaction already committed.
            return isLast
                ? new TimeoutAdvanceResult(null, AssessmentComplete: true)
                : new TimeoutAdvanceResult(nextSubtest, AssessmentComplete: false);
        }

        if (isLast)
        {
            // legacy applyTimeout calls completeSession() inline the moment the assessment truly
            // finishes. Coverage is trusted via the state-machine invariant: every subtest is only ever
            // advanced-past once ApplyTimeoutAsync (or a real submit) has fully filled it, so — unlike
            // CompleteAsync's own HTTP-driven entry point, which has no such guarantee — no separate
            // coverage-gate re-check is needed here before scoring. The status re-check that used to
            // live here now happens BEFORE the UPDATE (see the locking read above), which is strictly
            // stronger: it also stops a concurrent completer's timing data being overwritten.
            var counts = await ReadResponseCountsAsync(session, sessionId, cancellationToken);
            var completion = await PersistCompletionAsync(
                session, sessionId, counts, "advance-past-subtest", cancellationToken);
            return new TimeoutAdvanceResult(null, AssessmentComplete: true, completion);
        }

        return new TimeoutAdvanceResult(nextSubtest, AssessmentComplete: false);
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
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

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
            sessionId, subtest,
            await LiaQuestionServing.FetchAssessmentQuestionsAsync(
                questionIdResolver, context, subtest, row.Language, itemCount, cancellationToken),
            LiaSubtestOrder.TimeSeconds[subtest], ToIsoZ(startedAt)));
    }

    // ================================================================================================
    // SubmitAnswerAsync / SubmitPracticeAnswerAsync — legacy submitAnswer / submitPracticeAnswer
    // (services/lia/lia-response-service.ts). SubmitAnswerAsync shares Task 3's
    // ExpireIfPastDeadlineAsync/AdvancePastSubtestAsync timeout-advance machinery: a submitted answer
    // past the subtest's deadline is discarded (never persisted) and instead runs the SAME
    // timeout-advance path StartAsync's Gate 2 uses — including, when it happens to close out the
    // assessment's LAST subtest, computing and persisting REAL scores and threading them into
    // LiaAnswerResult.Completion, then audit-logging only after that commit succeeds (identical
    // ordering/guard to StartAsync's own Gate 2, so a completion audit can never be emitted for a
    // write that did not durably persist).
    // ================================================================================================

    // FOR UPDATE (fix round 1, Important): closes the same race class CompleteAsync's own
    // SelectForUpdateSql already guards against — without it, a concurrent /complete could score +
    // commit this exact session between this read and the response upsert below, and this method
    // would have no way to detect that. Locking here also makes the current_item UPDATE below
    // (itself now a proper atomic increment) race-free against a second concurrent submit.
    private const string SelectSessionForAnswerSql = """
        SELECT "user_id" AS "userId", "status"::text AS "status", "current_subtest"::text AS "currentSubtest",
               "current_item" AS "currentItem", "subtest_times"::text AS "subtestTimes", "language"
        FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        FOR UPDATE
        """;

    public async Task<LiaSubmitAnswerOutcome> SubmitAnswerAsync(
        RequestContext context, string sessionId, string ownerUserId, string questionId, string? answer,
        int timeSpentMs, CancellationToken cancellationToken = default)
    {
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        AnswerSessionRow row;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionForAnswerSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
            }

            row = new AnswerSessionRow(
                reader.GetString(reader.GetOrdinal("userId")), reader.GetString(reader.GetOrdinal("status")),
                ReadNullableString(reader, "currentSubtest"), reader.GetInt32(reader.GetOrdinal("currentItem")),
                ReadNullableString(reader, "subtestTimes"), reader.GetString(reader.GetOrdinal("language")));
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like every other writer here.
        if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
        }

        if (row.Status != "in_progress")
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotInProgress, null);
        }

        var currentSubtest = row.CurrentSubtest!;
        var itemCount = LiaSubtestOrder.ItemCounts[currentSubtest];

        // Shared timeout-advance gate (Task 3): a late submit is discarded, never persisted as a real
        // response — the subtest is instead closed out via the SAME path StartAsync's Gate 2 uses.
        var expiry = await ExpireIfPastDeadlineAsync(
            context, session, sessionId, currentSubtest, row.SubtestTimes, cancellationToken);
        if (expiry is not null)
        {
            await session.CommitAsync(cancellationToken);

            if (expiry.Completion is { } completion)
            {
                // Audit only after the commit above succeeds, mirroring CompleteAsync's / StartAsync's
                // own ordering — a completion audit can never be emitted for a write that did not
                // durably persist.
                logger.LogInformation(
                    "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
                    sessionId, ownerUserId, completion.GlobalPercentile, completion.PerformanceLevel);
            }

            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new LiaAnswerResult(
                sessionId, itemCount, itemCount, 0, true, expiry.NextSubtest, expiry.AssessmentComplete,
                Completion: expiry.Completion, TimedOut: true,
                SessionStatus: expiry.AssessmentComplete ? "completed" : "practice"));
        }

        var question = await LiaQuestionServing.FindByIdAsync(
            questionIdResolver, context, questionId, cancellationToken);
        if (question is null || question.Subtest != currentSubtest || question.IsPractice)
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.QuestionNotFound, null);
        }

        var effectiveAnswer = currentSubtest == "verbal_reasoning"
            ? LiaAnswerScoring.GetVerbalAnswerForLanguage(question.CorrectAnswer, question.ItemNumber, isPractice: false, row.Language)
            : question.CorrectAnswer;
        bool? isCorrect = answer is null ? null : LiaAnswerScoring.IsAnswerCorrect(currentSubtest, answer, effectiveAnswer);

        // Fix round 1 (Critical/Important review): determine "was this a fresh insert, not a
        // resubmit" ATOMICALLY from the upsert itself via the "xmax" = 0 Postgres idiom (the row's
        // xmax is 0 iff it was just INSERTed, never touched by an UPDATE — including this statement's
        // own ON CONFLICT DO UPDATE branch) rather than a separate read-then-write SELECT probe,
        // which raced with a concurrent submit of a DIFFERENT item on the same session: both could
        // read "not yet answered" before either wrote, then both computed current_item+1 as an
        // absolute value below, silently losing one advance.
        bool wasFreshInsert;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = """
                INSERT INTO "lia_responses"
                    ("id", "session_id", "question_id", "subtest", "item_number", "user_answer", "is_correct",
                     "answered_at", "time_spent_ms", "updated_at")
                VALUES (@id, @sessionId, @questionId, @subtest::"LiaSubtest", @itemNumber, @answer, @isCorrect, @now, @timeSpentMs, @now)
                ON CONFLICT ("session_id", "question_id") DO UPDATE SET
                    "user_answer" = @answer, "is_correct" = @isCorrect, "answered_at" = @now, "time_spent_ms" = @timeSpentMs
                RETURNING ("xmax" = 0) AS "inserted"
                """;
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "questionId", questionId);
            AddParameter(command, "subtest", currentSubtest);
            AddParameter(command, "itemNumber", question.ItemNumber);
            AddParameter(command, "answer", (object?)answer ?? DBNull.Value);
            AddParameter(command, "isCorrect", (object?)isCorrect ?? DBNull.Value);
            AddTimestampParameter(command, "now", NowTruncated());
            AddParameter(command, "timeSpentMs", timeSpentMs);
            wasFreshInsert = (bool)(await command.ExecuteScalarAsync(cancellationToken))!;
        }

        var newCurrentItem = row.CurrentItem;
        if (wasFreshInsert)
        {
            // Atomic conditional increment (both halves of the binding constraint: a WHERE guard
            // matching the exact state precondition, AND fail-closed on 0 rows) instead of writing a
            // pre-computed absolute value — two concurrent submits of two different unanswered items
            // both incrementing via SQL can never lose one's advance the way two absolute writes of
            // "row.CurrentItem + 1" could. 0 rows now genuinely means "the session left in_progress
            // under us" (this row IS locked via SelectSessionForAnswerSql's FOR UPDATE, so that is
            // only reachable if this same transaction itself changed status earlier — unreachable
            // today, but still a real invariant worth failing closed on, matching
            // AdvancePastSubtestAsync's/CompleteAsync's rigor), not "can never happen".
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = """
                UPDATE "lia_assessment_sessions"
                SET "current_item" = "current_item" + 1
                WHERE "id" = @sessionId AND "status" = 'in_progress'::"LiaSessionStatus"
                RETURNING "current_item"
                """;
            AddParameter(command, "sessionId", sessionId);
            var result = await command.ExecuteScalarAsync(cancellationToken);
            if (result is null)
            {
                logger.LogError("lia.answer.submit current_item update matched 0 rows sessionId={SessionId}", sessionId);
                throw new InvalidOperationException($"LIA current_item update affected 0 rows for session {sessionId}");
            }

            newCurrentItem = (int)result;
        }

        var subtestComplete = newCurrentItem > itemCount;
        var startedAt = ReadSubtestStartedAt(row.SubtestTimes, currentSubtest);
        var elapsedSeconds = startedAt is null
            ? 0
            : (NowTruncated() - ParseIsoAsUnspecifiedUtc(startedAt)).TotalSeconds;
        var timeRemaining = Math.Max(0, LiaSubtestOrder.TimeSeconds[currentSubtest] - elapsedSeconds);

        string? nextSubtest = null;
        var assessmentComplete = false;
        LiaCompletionResult? answerDrivenCompletion = null;
        if (subtestComplete)
        {
            var advanced = await AdvancePastSubtestAsync(
                context, session, sessionId, currentSubtest, cancellationToken);
            nextSubtest = advanced.NextSubtest;
            assessmentComplete = advanced.AssessmentComplete;
            // This is the DOMINANT completion path — the candidate's own answer to the last item of the
            // last subtest — and it was the one call site of the five that dropped advanced.Completion
            // on the floor. Scores were still computed and persisted (PersistCompletionAsync runs
            // regardless of caller), but the DTO returned no completion and NO audit event was emitted;
            // the frontend's follow-up POST /complete then hit CompleteAsync's idempotent-replay branch,
            // which returns early with no write and no audit either — so the audit trail recorded zero
            // completions for the most common way an assessment finishes.
            answerDrivenCompletion = advanced.Completion;
        }

        await session.CommitAsync(cancellationToken);

        if (answerDrivenCompletion is { } committedCompletion)
        {
            // Audit only after the commit above succeeds, mirroring this method's own expiry branch and
            // every other completion call site — a completion audit can never be emitted for a write
            // that did not durably persist.
            logger.LogInformation(
                "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
                sessionId, ownerUserId, committedCompletion.GlobalPercentile, committedCompletion.PerformanceLevel);
        }

        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new LiaAnswerResult(
            sessionId, newCurrentItem - 1, itemCount, (int)Math.Round(timeRemaining), subtestComplete, nextSubtest,
            assessmentComplete, Completion: answerDrivenCompletion));
    }

    private const string SelectSessionForPracticeAnswerSql = """
        SELECT "user_id", "status"::text, "practice_completed"::text, "language", "current_subtest"::text
        FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        """;

    public async Task<LiaPracticeAnswerOutcome> SubmitPracticeAnswerAsync(
        RequestContext context, string sessionId, string ownerUserId, string questionId, string answer,
        CancellationToken cancellationToken = default)
    {
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string userId;
        string status;
        string? practiceCompletedJson;
        string language;
        string? currentSubtest;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionForPracticeAnswerSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotFound, null);
            }

            userId = reader.GetString(0);
            status = reader.GetString(1);
            practiceCompletedJson = reader.IsDBNull(2) ? null : reader.GetString(2);
            language = reader.GetString(3);
            currentSubtest = reader.IsDBNull(4) ? null : reader.GetString(4);
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like every other writer here.
        if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotFound, null);
        }

        if (status != "practice")
        {
            return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.NotInPractice, null);
        }

        // Critical fix (review round 1): the ONLY question validation used to be `question is null`,
        // which let a candidate submit an ASSESSMENT-shaped id (e.g. "pattern_recognition:7:assessment")
        // through this endpoint and harvest the entire timed-subtest answer key via
        // PracticeAnswerResult.CorrectAnswer before the clock ever started — SubmitAnswerAsync already
        // rejects the mirror-image case (question.IsPractice -> QuestionNotFound), so this was a
        // one-sided oversight, not intentional. The missing question.Subtest check separately let a
        // session mark a DIFFERENT subtest's practice complete (and read ITS keys) by submitting e.g.
        // "visual_rotation:3:practice" while sitting on pattern_recognition — both are folded into the
        // same uniform QuestionNotFound outcome used everywhere else in this class.
        var question = await LiaQuestionServing.FindByIdAsync(
            questionIdResolver, context, questionId, cancellationToken);
        if (question is null || !question.IsPractice || question.Subtest != currentSubtest)
        {
            return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.QuestionNotFound, null);
        }

        var effectiveAnswer = question.Subtest == "verbal_reasoning"
            ? LiaAnswerScoring.GetVerbalAnswerForLanguage(question.CorrectAnswer, question.ItemNumber, isPractice: true, language)
            : question.CorrectAnswer;
        var isCorrect = LiaAnswerScoring.IsAnswerCorrect(question.Subtest, answer, effectiveAnswer);

        var practiceItems = await LiaQuestionServing.FetchPracticeQuestionsAsync(
            questionIdResolver, context, question.Subtest, language, cancellationToken);
        var next = practiceItems.FirstOrDefault(q => q.ItemNumber > question.ItemNumber);
        var practiceComplete = next is null;

        if (practiceComplete)
        {
            var updated = MergePracticeCompleted(practiceCompletedJson, question.Subtest);
            int practiceAffected;
            await using (var command = session.Connection.CreateCommand())
            {
                command.Transaction = session.Transaction;
                // "AND status = 'practice'" (fix round 1, Important): the missing WHERE-guard half of
                // the binding "conditional UPDATE" constraint — matches the exact state precondition
                // just checked above, not just the primary key.
                command.CommandText = """
                    UPDATE "lia_assessment_sessions" SET "practice_completed" = @pc::jsonb
                    WHERE "id" = @sessionId AND "status" = 'practice'::"LiaSessionStatus"
                    """;
                AddParameter(command, "pc", updated);
                AddParameter(command, "sessionId", sessionId);
                practiceAffected = await command.ExecuteNonQueryAsync(cancellationToken);
            }

            // Same processing-integrity rigor as SubmitAnswerAsync's current_item update above.
            if (practiceAffected == 0)
            {
                logger.LogError("lia.practice.answer practice_completed update matched 0 rows sessionId={SessionId}", sessionId);
                throw new InvalidOperationException($"LIA practice_completed update affected 0 rows for session {sessionId}");
            }
        }

        await session.CommitAsync(cancellationToken);
        return new LiaPracticeAnswerOutcome(LiaPracticeAnswerStatus.Ok, new PracticeAnswerResult(
            isCorrect, effectiveAnswer, practiceComplete, next));
    }

    // ================================================================================================
    // HandleTimeoutAsync — legacy handleTimeout (services/lia/lia-response-service.ts), the explicit
    // POST /timeout endpoint's write: unlike ExpireIfPastDeadlineAsync (which only fires implicitly, as
    // a side effect of /start or /submit-answer discovering an expired clock), this is invoked directly
    // by the candidate's client when its own countdown reaches zero. It shares Task 3/5's
    // ApplyTimeoutAsync (fill unanswered items -> AdvancePastSubtestAsync) rather than duplicating it,
    // and — because that machinery can complete the assessment's LAST subtest here exactly as it can
    // from SubmitAnswerAsync's timeout branch or StartAsync's Gate 2 — threads a real
    // LiaCompletionResult into LiaAnswerResult.Completion and audit-logs only after the commit succeeds.
    // ================================================================================================

    // FOR UPDATE (same reasoning as SubmitAnswerAsync's SelectSessionForAnswerSql): this method calls
    // ApplyTimeoutAsync directly, off of this read, with no other serializing write in between — without
    // the lock, a concurrent /complete could score + commit this exact session between this read and
    // ApplyTimeoutAsync's writes, and this method would have no way to detect that.
    private const string SelectSessionForTimeoutSql = """
        SELECT "user_id" AS "userId", "status"::text AS "status", "current_subtest"::text AS "currentSubtest"
        FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        FOR UPDATE
        """;

    public async Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(
        RequestContext context, string sessionId, string ownerUserId, string subtest,
        CancellationToken cancellationToken = default)
    {
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string userId, status, currentSubtest;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionForTimeoutSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
            }

            userId = reader.GetString(0);
            status = reader.GetString(1);
            currentSubtest = reader.IsDBNull(2) ? "" : reader.GetString(2);
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like every other writer here.
        // Kept as its own check, separate from the state-precondition check below: an ownership
        // mismatch must never be conflated with "wrong status/subtest for the real owner" — the latter
        // legitimately returns NotInProgress, but folding both into one branch would let an attacker
        // learn (from a NotInProgress response) that the session exists and is simply in some other
        // state, defeating the uniform not-found contract every other method in this class upholds.
        if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotFound, null);
        }

        if (status != "in_progress" || currentSubtest != subtest)
        {
            return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.NotInProgress, null);
        }

        var itemCount = LiaSubtestOrder.ItemCounts[subtest];
        var advanced = await ApplyTimeoutAsync(context, session, sessionId, subtest, cancellationToken);
        await session.CommitAsync(cancellationToken);

        if (advanced.Completion is { } completion)
        {
            // Audit only after the commit above succeeds, mirroring CompleteAsync's / StartAsync's /
            // SubmitAnswerAsync's own ordering — a completion audit can never be emitted for a write
            // that did not durably persist.
            logger.LogInformation(
                "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
                sessionId, ownerUserId, completion.GlobalPercentile, completion.PerformanceLevel);
        }

        return new LiaSubmitAnswerOutcome(LiaSubmitAnswerStatus.Ok, new LiaAnswerResult(
            sessionId, itemCount, itemCount, 0, true, advanced.NextSubtest, advanced.AssessmentComplete,
            Completion: advanced.Completion));
    }

    // ================================================================================================
    // SaveViolationsAsync — legacy saveViolations / mergeViolations (lib/proctoring.ts): appends
    // incoming lockdown-proctoring violation events to the session's existing lockdown_violations
    // JSONB array and unconditionally overwrites flag_for_review based on the CUMULATIVE count
    // (existing + new) crossing PROCTORING_FLAG_THRESHOLD — legacy's own design (lia-session-
    // service.ts:659 `flagForReview: flag`), not a defect to correct.
    //
    // Fix round 1 (Important): the session SELECT is now FOR UPDATE. This is a genuine
    // read-modify-write of a JSONB array — the lockdown client flushes violation batches on a timer
    // and typically retries on failure, so an overlapping retry + timer flush for the SAME session is
    // a plausible normal failure mode, not an exotic race. Without a lock, two concurrent calls both
    // read `existing`, both compute `all`, and the second commit silently discards the first batch's
    // violations AND computes `flag` from a stale (too-small) count — a session that should be flagged
    // for review might not be. Same lock Task 5 already established for current_item's fix and
    // HandleTimeoutAsync's own read above; same session row by primary key, so no new lock-ordering
    // risk.
    // ================================================================================================

    private const int ProctoringFlagThreshold = 3; // legacy PROCTORING_FLAG_THRESHOLD (lib/proctoring.ts).

    private const string SelectSessionForViolationsSql = """
        SELECT "user_id", "lockdown_violations"::text FROM "lia_assessment_sessions" WHERE "id" = @sessionId
        FOR UPDATE
        """;

    public async Task<LiaSaveViolationsOutcome> SaveViolationsAsync(
        RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string userId;
        string? existingJson;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionForViolationsSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.NotFound, 0);
            }

            userId = reader.GetString(0);
            existingJson = reader.IsDBNull(1) ? null : reader.GetString(1);
        }

        // Ownership: missing == denied -> uniform NotFound (IDOR-safe), like every other writer here.
        if (!string.Equals(userId, ownerUserId, StringComparison.Ordinal))
        {
            return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.NotFound, 0);
        }

        var existing = string.IsNullOrEmpty(existingJson)
            ? new List<ViolationEntry>()
            : JsonSerializer.Deserialize<List<ViolationEntry>>(existingJson, JsonOptions)!;
        var all = existing.Concat(violations).Take(500).ToList();
        var flag = all.Count >= ProctoringFlagThreshold;

        int affected;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = """
                UPDATE "lia_assessment_sessions" SET "lockdown_violations" = @all::jsonb, "flag_for_review" = @flag
                WHERE "id" = @sessionId
                """;
            AddParameter(command, "all", JsonSerializer.Serialize(all, JsonOptions));
            AddParameter(command, "flag", flag);
            AddParameter(command, "sessionId", sessionId);
            affected = await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // Fix round 1 (Important, plan-mandated fail-closed constraint): this UPDATE targets the
        // session by primary key only, inside the same transaction that just confirmed (under FOR
        // UPDATE, above) the row exists — 0 rows affected here means the row vanished mid-transaction
        // or an RLS UPDATE policy silently blocked it despite the SELECT succeeding. That must never
        // pass silently as a reported "Ok" save with a SavedCount that didn't actually persist —
        // mirrors AdvancePastSubtestAsync's/CompleteAsync's identical rigor for their own conditional
        // UPDATEs.
        if (affected == 0)
        {
            logger.LogError("lia.violations.save conditional update matched 0 rows sessionId={SessionId}", sessionId);
            throw new InvalidOperationException($"LIA violations update affected 0 rows for session {sessionId}");
        }

        await session.CommitAsync(cancellationToken);
        return new LiaSaveViolationsOutcome(LiaSaveViolationsStatus.Ok, violations.Count);
    }

    // ================================================================================================
    // ReadWithLazyExpiryAsync — legacy getSession's lazy-expiry read (services/lia/lia-session-
    // service.ts). Shares Task 3's ExpireIfPastDeadlineAsync/ApplyTimeoutAsync/AdvancePastSubtestAsync
    // chain rather than duplicating it: legacy getSession calls the SAME expireIfPastDeadline function
    // submitAnswer/startSession call, and — exactly like those call sites — a lazy expiry that happens
    // to close out the assessment's LAST subtest computes and persists REAL scores (via
    // PersistCompletionAsync) and must be audit-logged only after that write's own commit succeeds.
    // ================================================================================================

    // FOR UPDATE: this read can turn into a write (ExpireIfPastDeadlineAsync) a few lines later in the
    // SAME transaction — same reasoning as SubmitAnswerAsync's/HandleTimeoutAsync's own session SELECTs.
    private const string SelectSessionDetailForUpdateSql = """
        SELECT "id", "user_id" AS "userId", "status"::text AS "status",
               "current_subtest"::text AS "currentSubtest", "current_item" AS "currentItem",
               "practice_completed"::text AS "practiceCompleted", "subtest_times"::text AS "subtestTimes",
               "language", "started_at" AS "startedAt", "completed_at" AS "completedAt"
        FROM "lia_assessment_sessions"
        WHERE "id" = @sessionId
        FOR UPDATE
        """;

    // Same column set, no FOR UPDATE — used only for the post-commit re-read below, where the prior
    // writable transaction has already committed and a read-only session is reading the fresh row.
    private const string SelectSessionDetailSql = """
        SELECT "id", "user_id" AS "userId", "status"::text AS "status",
               "current_subtest"::text AS "currentSubtest", "current_item" AS "currentItem",
               "practice_completed"::text AS "practiceCompleted", "subtest_times"::text AS "subtestTimes",
               "language", "started_at" AS "startedAt", "completed_at" AS "completedAt"
        FROM "lia_assessment_sessions"
        WHERE "id" = @sessionId
        """;

    public async Task<SessionDetail?> ReadWithLazyExpiryAsync(
        RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
    {
        // Warm the question catalog BEFORE taking a connection — a lazy first load from inside the
        // transaction below would need a SECOND pooled connection while this one is held, and
        // MaxPoolSize is 10. See ILiaQuestionIdResolver.WarmAsync.
        await questionIdResolver.WarmAsync(context, cancellationToken);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        LazySessionRow row;
        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = SelectSessionDetailForUpdateSql;
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            row = ReadLazySessionRow(reader);
        }

        // Ownership: missing == denied -> uniform not-found (IDOR-safe), like every other reader/writer here.
        if (!string.Equals(row.UserId, ownerUserId, StringComparison.Ordinal))
        {
            return null;
        }

        // legacy getSession calls expireIfPastDeadline unconditionally, but that helper itself is a
        // no-op unless the CURRENT subtest already has a live startedAt in subtest_times — reachable
        // only when status=="in_progress" (StartAsync's own Gate 2 / SubmitAnswerAsync only ever call
        // it from that same status), so gating here avoids re-running timeout machinery against an
        // already-completed or still-practice session (which would otherwise re-insert/no-op
        // ApplyTimeoutAsync's already-answered rows and, worse, re-advance a completed session).
        if (row.Status == "in_progress")
        {
            var expiry = await ExpireIfPastDeadlineAsync(
                context, session, sessionId, row.CurrentSubtest, row.SubtestTimesJson, cancellationToken);
            if (expiry is not null)
            {
                await session.CommitAsync(cancellationToken);

                if (expiry.Completion is { } completion)
                {
                    // Audit only after the commit above succeeds, mirroring CompleteAsync's /
                    // StartAsync's / SubmitAnswerAsync's / HandleTimeoutAsync's own ordering — a
                    // completion audit can never be emitted for a write that did not durably persist.
                    // ownerUserId is the actor: a lazy expiry discovered by a plain GET still completes
                    // the assessment on the session owner's behalf, same as every other lazy-expiry
                    // call site in this class.
                    logger.LogInformation(
                        "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
                        sessionId, ownerUserId, completion.GlobalPercentile, completion.PerformanceLevel);
                }

                // Re-read the post-expiry state on a FRESH read-only session: the writable transaction
                // above is already committed, and its RLS GUCs were scoped to that transaction (see
                // RlsSessionContextApplier), so reusing it here isn't possible — a fresh session is the
                // clean way to observe the just-committed row.
                await using var refreshed = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
                await using var refreshCommand = refreshed.Connection.CreateCommand();
                refreshCommand.Transaction = refreshed.Transaction;
                refreshCommand.CommandText = SelectSessionDetailSql;
                AddParameter(refreshCommand, "sessionId", sessionId);
                await using var refreshReader = await refreshCommand.ExecuteReaderAsync(cancellationToken);
                if (!await refreshReader.ReadAsync(cancellationToken))
                {
                    return null; // Unreachable in practice — the row we just committed a write to vanished.
                }

                return BuildSessionDetail(ReadLazySessionRow(refreshReader));
            }
        }

        return BuildSessionDetail(row);
    }

    private sealed record LazySessionRow(
        string Id, string UserId, string Status, string? CurrentSubtest, int CurrentItem,
        string? PracticeCompletedJson, string? SubtestTimesJson, string Language,
        DateTime? StartedAt, DateTime? CompletedAt);

    private static LazySessionRow ReadLazySessionRow(DbDataReader reader) => new(
        Id: reader.GetString(reader.GetOrdinal("id")),
        UserId: reader.GetString(reader.GetOrdinal("userId")),
        Status: reader.GetString(reader.GetOrdinal("status")),
        CurrentSubtest: ReadNullableString(reader, "currentSubtest"),
        CurrentItem: reader.GetInt32(reader.GetOrdinal("currentItem")),
        PracticeCompletedJson: ReadNullableString(reader, "practiceCompleted"),
        SubtestTimesJson: ReadNullableString(reader, "subtestTimes"),
        Language: reader.GetString(reader.GetOrdinal("language")),
        StartedAt: ReadNullableDateTime(reader, "startedAt"),
        CompletedAt: ReadNullableDateTime(reader, "completedAt"));

    private static SessionDetail BuildSessionDetail(LazySessionRow row) => new(
        row.Id,
        row.Status,
        row.CurrentSubtest,
        row.CurrentItem,
        ParseJsonElementOrNull(row.PracticeCompletedJson),
        ParseJsonElementOrNull(row.SubtestTimesJson),
        row.Language,
        row.StartedAt is { } startedAt ? ToIsoZ(startedAt) : null,
        row.CompletedAt is { } completedAt ? ToIsoZ(completedAt) : null);

    // A SQL NULL surfaces as a JSON-null element, matching LiaResultReader's own ReadJson idiom for the
    // same jsonb-as-text pattern.
    private static JsonElement ParseJsonElementOrNull(string? json)
    {
        using var document = JsonDocument.Parse(string.IsNullOrEmpty(json) ? "null" : json);
        return document.RootElement.Clone();
    }

    private static string MergePracticeCompleted(string? existingJson, string subtest)
    {
        var dict = string.IsNullOrEmpty(existingJson)
            ? new Dictionary<string, bool>(StringComparer.Ordinal)
            : JsonSerializer.Deserialize<Dictionary<string, bool>>(existingJson, JsonOptions)!;
        dict[subtest] = true;
        return JsonSerializer.Serialize(dict, JsonOptions);
    }

    private sealed record AnswerSessionRow(
        string UserId, string Status, string? CurrentSubtest, int CurrentItem, string? SubtestTimes, string Language);

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

        // ValueKind is checked at each level rather than assumed. AdvancePastSubtestAsync now calls this
        // from the /timeout and normal-answer paths too, so a malformed subtest_times entry (a non-object
        // under the subtest key, or a non-string startedAt) would otherwise throw out of
        // TryGetProperty/GetString and 500 the request. Nothing this backend writes can produce that
        // shape; treating it as "no startedAt" is the same benign fallback a missing key already gets.
        using var doc = JsonDocument.Parse(subtestTimesJson);
        return doc.RootElement.ValueKind == JsonValueKind.Object
            && doc.RootElement.TryGetProperty(subtest, out var timing)
            && timing.ValueKind == JsonValueKind.Object
            && timing.TryGetProperty("startedAt", out var startedAt)
            && startedAt.ValueKind == JsonValueKind.String
            ? startedAt.GetString()
            : null;
    }

    // Single culture-safe parse for every ISO timestamp this class reads back out of subtest_times.
    // AssumeUniversal|AdjustToUniversal (not RoundtripKind, which .NET rejects when combined with
    // AdjustToUniversal): a value with no offset info is assumed UTC rather than local server time, and
    // the result is normalized regardless of whether the source string carried an explicit "Z"/offset.
    // Kind is then flattened to Unspecified so it subtracts cleanly against NowTruncated(), which is
    // itself Unspecified-but-UTC to round-trip Postgres `timestamp` columns.
    private static DateTime ParseIsoAsUnspecifiedUtc(string value) => DateTime.SpecifyKind(
        DateTime.Parse(
            value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal),
        DateTimeKind.Unspecified);

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
        Dictionary<string, ResponseCount> counts, string callSite, CancellationToken cancellationToken)
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

        // Fail closed. This UPDATE is guarded by `status <> 'completed'`, so 0 rows means the session was
        // completed by someone else between our caller's own state check and this write — and our caller
        // is about to report scores that did not persist. It is NOT unreachable: this helper now runs
        // from FIVE distinct entry points (POST /complete, POST /answer's normal and expiry branches,
        // POST /timeout, POST /start's Gate 2, and a lazy-expiry GET /session/{id}), and not all of them
        // held a row lock at the moment they decided to score. AdvancePastSubtestAsync's own locking
        // pre-check absorbs the common benign race before it gets here, so anything still reaching this
        // point is genuinely unexpected. `callSite` is logged because the prefix alone cannot tell an
        // on-call responder WHICH of those entry points fired.
        if (affected == 0)
        {
            logger.LogError(
                "lia.session.persist-completion conditional update matched 0 rows sessionId={SessionId} callSite={CallSite}",
                sessionId, callSite);
            throw new InvalidOperationException(
                $"LIA completion update affected 0 rows for session {sessionId} (call site: {callSite})");
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
