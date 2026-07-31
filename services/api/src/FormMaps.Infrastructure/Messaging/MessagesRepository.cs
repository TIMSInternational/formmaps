using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Messaging;

namespace FormMaps.Infrastructure.Messaging;

/// <summary>
/// SQL for routes/messages.ts (586 lines). One method per legacy route, matching
/// VideoSessionsRepository's convention. RLS on "conversations"/"messages" is participant-scoped
/// (api/prisma/rls/005-sensitive.sql) — see the plan's Global Constraints for the resulting
/// 404-collapses-403 divergence from legacy, which is deliberate.
/// </summary>
public sealed class MessagesRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IMessagesRepository
{
    public async Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, """
            SELECT count(*)::int FROM "messages" m
            WHERE m."conversationId" IN (
                SELECT c."id" FROM "conversations" c
                WHERE c."participantAId" = @userId OR c."participantBId" = @userId
            )
            AND m."senderId" <> @userId AND m."readAt" IS NULL
            """);
        AddParameter(command, "userId", userId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return (int)result!;
    }

    public async Task<IReadOnlyList<ContactRow>> GetContactsAsync(
        RequestContext context, string userId, string role, string? schoolId, string? search,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(schoolId)) return [];

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var privileged = role is "school_admin" or "super admin" or "counselor";

        var sqlBuilder = new System.Text.StringBuilder();
        sqlBuilder.Append("""SELECT u."id", u."name", u."email", u."roleName" FROM "users" u WHERE u."schoolId" = @schoolId AND u."isActive" = true AND u."id" <> @userId""");

        if (!string.IsNullOrWhiteSpace(search))
            sqlBuilder.Append(""" AND (u."name" ILIKE @search OR u."email" ILIKE @search)""");

        if (!privileged)
            sqlBuilder.Append(""" AND (u."roleName" = 'school_admin' OR u."id" = ANY(@assignedIds))""");

        sqlBuilder.Append(""" ORDER BY u."name" ASC LIMIT 20""");

        var sql = sqlBuilder.ToString();

        await using var command = Command(session, sql);
        AddParameter(command, "schoolId", schoolId);
        AddParameter(command, "userId", userId);
        if (!string.IsNullOrWhiteSpace(search)) AddParameter(command, "search", $"%{search}%");
        if (!privileged)
        {
            var assignedIds = await GetAssignedCounselorIdsAsync(session, userId, cancellationToken);
            AddParameter(command, "assignedIds", assignedIds.ToArray());
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<ContactRow>();
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ContactRow(
                reader.GetString(0),
                reader.IsDBNull(1) ? null : reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3)));
        }
        return rows;
    }

    private static async Task<IReadOnlyList<string>> GetAssignedCounselorIdsAsync(
        FormMapsDatabaseSession session, string studentId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "counselorId" FROM "counselor_student_assignments" WHERE "studentId" = @studentId AND "isActive" = true
            """);
        AddParameter(command, "studentId", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var ids = new List<string>();
        while (await reader.ReadAsync(cancellationToken)) ids.Add(reader.GetString(0));
        return ids;
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private DateTime NowTruncated() =>
        DateTime.SpecifyKind(new DateTime(timeProviderTicks(), DateTimeKind.Unspecified), DateTimeKind.Unspecified);

    private long timeProviderTicks() => (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond;
}
