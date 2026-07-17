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

        var scored = LiaCompletionScorer.ScoreCompletion(counts);
        // UTC wall-clock at millisecond precision, matching legacy JS `new Date()` (integer ms). Two
        // reasons for the exact shape:
        //   1. ToIsoZ truncates to ms but Postgres timestamp(3) ROUNDS to ms — an un-truncated tick value
        //      would make this response's completed_at differ by 1ms from the persisted row (and every
        //      idempotent replay / results read). Truncate up front so store == return == every read.
        //   2. Kind=Unspecified (not Utc) so Npgsql binds the value as `timestamp` (without time zone),
        //      matching the Prisma @db.Timestamp(3) columns. A Kind=Utc value would infer `timestamptz`
        //      and Postgres would apply a TimeZone-GUC-dependent cast on write — the stored wall-clock
        //      would shift on any non-UTC server while the returned value would not. Store tz-independently.
        var completedAt = TruncateToMilliseconds(
            DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified));

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

        // affected == 0 is unreachable under the FOR UPDATE lock: we hold the exclusive row lock and
        // verified status <> 'completed', so the conditional UPDATE ... WHERE status <> 'completed' must
        // match the one locked row. If it somehow matched nothing (e.g. an RLS UPDATE policy filtered the
        // row), FAIL CLOSED — do not commit a phantom success or emit a completion audit for a write that
        // did not land (processing integrity, SOC2 PI). Disposing the session rolls the transaction back.
        if (affected == 0)
        {
            logger.LogError("lia.session.complete conditional update matched 0 rows sessionId={SessionId}", sessionId);
            throw new InvalidOperationException($"LIA completion update affected 0 rows for session {sessionId}");
        }

        await session.CommitAsync(cancellationToken);

        // Audit (SOC2 CC7.2 / ISO A.8.15): actor/action/subject/outcome — IDs only, never PII. Emitted
        // only after the durable write commits, so it can never claim a completion that did not persist.
        logger.LogInformation(
            "audit.assessment.lia.completed sessionId={SessionId} actorUserId={ActorUserId} globalPercentile={GlobalPercentile} performanceLevel={PerformanceLevel}",
            sessionId, ownerUserId, scored.GlobalPercentile, scored.PerformanceLevel);

        var result = new LiaCompletionResult(
            SessionId: sessionId,
            RawScores: scored.RawScores,
            FinalScores: scored.FinalScores,
            Percentiles: scored.Percentiles,
            GlobalPercentile: scored.GlobalPercentile,
            PerformanceLevel: scored.PerformanceLevel,
            ResponseCounts: counts,
            CompletedAt: ToIsoZ(completedAt));
        return new LiaCompleteOutcome(LiaCompleteStatus.Completed, result);
    }

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
