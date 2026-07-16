using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy checkAccess / getSession (personality-session-service.ts) under read-only RLS.
/// Access = the caller's active sessions (id/status, newest-first); getSession = the owned active row
/// (id + user_id + is_active), projected to the 7-field view with ISO-Z string timestamps.
/// </summary>
public sealed class PersonalitySessionReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPersonalitySessionReader
{
    private const string AccessSql = """
        SELECT "id", "status"
        FROM "personality_assessment_sessions"
        WHERE "user_id" = @userId AND "is_active" = true
        ORDER BY "created_date" DESC
        """;

    private const string OwnedSessionSql = """
        SELECT "id", "status", "variant", "session_language" AS "sessionLanguage",
               "resolved_type" AS "resolvedType", "started_at" AS "startedAt",
               "completed_at" AS "completedAt"
        FROM "personality_assessment_sessions"
        WHERE "id" = @sessionId AND "user_id" = @userId AND "is_active" = true
        """;

    public async Task<IReadOnlyList<PersonalitySessionStatus>> ReadAccessSessionsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = AccessSql;
        AddParameter(command, "userId", userId);

        var rows = new List<PersonalitySessionStatus>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new PersonalitySessionStatus(
                reader.GetString(reader.GetOrdinal("id")),
                reader.GetString(reader.GetOrdinal("status"))));
        }

        return rows;
    }

    public async Task<PersonalitySessionView?> GetOwnedSessionAsync(
        RequestContext context,
        string sessionId,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = OwnedSessionSql;
        AddParameter(command, "sessionId", sessionId);
        AddParameter(command, "userId", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new PersonalitySessionView(
            Id: reader.GetString(reader.GetOrdinal("id")),
            Status: reader.GetString(reader.GetOrdinal("status")),
            Variant: reader.GetString(reader.GetOrdinal("variant")),
            Language: ReadNullableString(reader, "sessionLanguage"),
            ResolvedType: ReadNullableString(reader, "resolvedType"),
            StartedAt: PcaExamSessionRowMapper.IsoZ(reader, "startedAt"),
            CompletedAt: PcaExamSessionRowMapper.IsoZ(reader, "completedAt"));
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
}
