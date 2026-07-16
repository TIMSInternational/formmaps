using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>getResults</c> / <c>getUserResults</c> (personality-session-service.ts) under
/// the caller's read-only RLS session, then delegates to <see cref="PersonalityResultsAssembler"/>.
/// The stored dimension_scores / violations jsonb pass through verbatim; snake_case @map'd columns are
/// aliased to camelCase. `status` / `variant` / `session_language` / `resolved_type` are plain strings.
/// </summary>
public sealed class PersonalityResultReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPersonalityResultReader
{
    private const string SharedColumns = """
        s."variant", s."session_language" AS "sessionLanguage", s."resolved_type" AS "resolvedType",
        s."dimension_scores"::text AS "dimensionScores", s."violations"::text AS "violations",
        s."flag_for_review" AS "flagForReview", s."started_at" AS "startedAt",
        s."completed_at" AS "completedAt", u."name" AS "userName", u."email" AS "userEmail"
        """;

    // findUnique by id (+ user). Ownership + completed-status + resolvedType are enforced in code,
    // mirroring legacy getResults (no isActive filter — findUnique parity).
    private static readonly string SessionSql = $"""
        SELECT s."id", s."user_id" AS "userId", s."status",
               {SharedColumns}
        FROM "personality_assessment_sessions" s
        JOIN "users" u ON u."id" = s."user_id"
        WHERE s."id" = @sessionId
        """;

    // findFirst newest completed+active for the target user (legacy getUserResults).
    private static readonly string NewestForUserSql = $"""
        SELECT s."id",
               {SharedColumns}
        FROM "personality_assessment_sessions" s
        JOIN "users" u ON u."id" = s."user_id"
        WHERE s."user_id" = @userId AND s."status" = 'completed' AND s."is_active" = true
        ORDER BY s."completed_at" DESC
        LIMIT 1
        """;

    public async Task<PersonalityResults?> ReadBySessionAsync(
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

        // Strict self-ownership + completed + resolvedType, exactly as legacy getResults.
        var ownerId = reader.GetString(reader.GetOrdinal("userId"));
        var status = reader.GetString(reader.GetOrdinal("status"));
        var resolvedType = ReadNullableString(reader, "resolvedType");
        if (!string.Equals(ownerId, ownerUserId, StringComparison.Ordinal)
            || status != "completed"
            || string.IsNullOrEmpty(resolvedType))
        {
            return null;
        }

        return BuildResults(reader);
    }

    public async Task<PersonalityResults?> ReadNewestForUserAsync(
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

        // Legacy getUserResults: null when the newest completed session has no resolvedType.
        if (string.IsNullOrEmpty(ReadNullableString(reader, "resolvedType")))
        {
            return null;
        }

        return BuildResults(reader);
    }

    private static PersonalityResults BuildResults(DbDataReader reader)
    {
        return PersonalityResultsAssembler.Build(
            sessionId: reader.GetString(reader.GetOrdinal("id")),
            userName: ReadNullableString(reader, "userName"),
            userEmail: ReadNullableString(reader, "userEmail"),
            variantRaw: reader.GetString(reader.GetOrdinal("variant")),
            sessionLanguage: ReadNullableString(reader, "sessionLanguage"),
            resolvedType: ReadNullableString(reader, "resolvedType"),
            dimensionScores: ReadJson(reader, "dimensionScores"),
            violations: ReadJson(reader, "violations"),
            flagForReview: reader.GetBoolean(reader.GetOrdinal("flagForReview")),
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

    private static DateTime? ReadNullableDateTime(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal);
    }

    // jsonb column as text -> JsonElement; SQL NULL -> a JSON-null element (the assembler treats a
    // non-object dimensionScores as {} and a non-array violations as count 0, matching `?? {}`/`?? []`).
    private static JsonElement ReadJson(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }
}
