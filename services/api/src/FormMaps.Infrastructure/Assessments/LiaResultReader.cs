using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>getResults</c> / <c>getUserResults</c> (services/lia/lia-results-service.ts)
/// under the caller's read-only RLS session, then delegates to <see cref="LiaResultsAssembler"/>.
///
/// Reads the SAME source as the shipped reports/lia reader (newest completed+active
/// <c>lia_assessment_sessions</c>). The @map'd snake_case columns are aliased to camelCase; the
/// global_percentile Decimal is cast to <c>double precision</c> so it serializes as a JSON number
/// (matching legacy <c>Number(globalPercentile ?? 0)</c>); jsonb columns pass through as raw JSON.
/// </summary>
public sealed class LiaResultReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiaResultReader
{
    private const string SharedColumns = """
        "global_percentile"::double precision AS "globalPercentile",
        "performance_level" AS "performanceLevel",
        "raw_scores"::text AS "rawScores",
        "final_scores"::text AS "finalScores",
        "percentiles"::text AS "percentiles",
        "response_counts"::text AS "responseCounts",
        "subtest_times"::text AS "subtestTimes",
        "lockdown_violations"::text AS "lockdownViolations",
        "started_at" AS "startedAt",
        "completed_at" AS "completedAt"
        """;

    // findUnique by id (+ user name/email). Ownership + completed-status are enforced in code below,
    // mirroring legacy getResults exactly (session.userId !== userId || status !== 'completed' -> null).
    private static readonly string SessionSql = $"""
        SELECT s."id", s."user_id" AS "userId", s."status"::text AS "status",
               {SharedColumns},
               u."name" AS "userName", u."email" AS "userEmail"
        FROM "lia_assessment_sessions" s
        JOIN "users" u ON u."id" = s."user_id"
        WHERE s."id" = @sessionId
        """;

    // findFirst newest completed+active for the target user (legacy getUserResults). Byte-identical
    // WHERE + orderBy to the reports/lia reader.
    private static readonly string NewestForUserSql = $"""
        SELECT s."id",
               {SharedColumns},
               u."name" AS "userName", u."email" AS "userEmail"
        FROM "lia_assessment_sessions" s
        JOIN "users" u ON u."id" = s."user_id"
        WHERE s."user_id" = @userId AND s."status" = 'completed' AND s."is_active" = true
        ORDER BY s."completed_at" DESC
        LIMIT 1
        """;

    public async Task<LiaResults?> ReadBySessionAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SessionSql;
        AddParameter(command, "sessionId", sessionId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        // Strict self-ownership + completed-only, exactly as legacy getResults.
        var ownerId = reader.GetString(reader.GetOrdinal("userId"));
        var status = reader.GetString(reader.GetOrdinal("status"));
        if (!string.Equals(ownerId, ownerUserId, StringComparison.Ordinal) || status != "completed")
        {
            return null;
        }

        return BuildResults(reader);
    }

    public async Task<LiaResults?> ReadNewestForUserAsync(
        RequestContext context,
        string targetUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = NewestForUserSql;
        AddParameter(command, "userId", targetUserId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return BuildResults(reader);
    }

    private static LiaResults BuildResults(DbDataReader reader)
    {
        return LiaResultsAssembler.Build(
            sessionId: reader.GetString(reader.GetOrdinal("id")),
            userName: ReadNullableString(reader, "userName"),
            userEmail: ReadNullableString(reader, "userEmail"),
            rawScores: ReadJsonOrDefault(reader, "rawScores", "{}"),
            finalScores: ReadJsonOrDefault(reader, "finalScores", "{}"),
            percentiles: ReadJsonOrDefault(reader, "percentiles", "{}"),
            globalPercentile: ReadNullableDouble(reader, "globalPercentile") ?? 0,
            performanceLevel: ReadNullableString(reader, "performanceLevel"),
            responseCounts: ReadJsonOrDefault(reader, "responseCounts", "{}"),
            subtestTimes: ReadJsonOrDefault(reader, "subtestTimes", "{}"),
            lockdownViolations: ReadJsonOrDefault(reader, "lockdownViolations", "[]"),
            startedAt: ReadNullableDateTime(reader, "startedAt"),
            completedAt: ReadNullableDateTime(reader, "completedAt"));
    }

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
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

    // jsonb column as text -> JsonElement; null column -> the given empty literal ({} or []).
    private static JsonElement ReadJsonOrDefault(DbDataReader reader, string name, string fallback)
    {
        var ordinal = reader.GetOrdinal(name);
        var raw = reader.IsDBNull(ordinal) ? fallback : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }
}
