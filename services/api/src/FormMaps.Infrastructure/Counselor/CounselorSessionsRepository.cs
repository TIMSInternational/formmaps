using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Counselor sessions GET/complete (FM-DOTNET-071). GET on a read-only RLS session; complete (mark-completed) on a
/// writable session + commit after an ownership check. calendarEventIds is verbatim jsonb; timestamps bound
/// Kind=Unspecified + ms-truncated; SET columns are fixed literals (mass-assignment guard). cancel is NOT ported
/// (calendar-sync side-effect stays Node).
/// </summary>
public sealed class CounselorSessionsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICounselorSessionsRepository
{
    private const string SelectColumns =
        """
        cs."id", cs."counselorId", cs."studentId", cs."startTime", cs."endTime", cs."status", cs."topic", cs."notes",
        cs."counselorNotes", cs."meetingLink", cs."calendarEventIds"::text, cs."cancellationReason", cs."cancelledAt",
        cs."cancelledBy", cs."completedAt", cs."isActive", cs."createdBy", cs."createdDate", cs."updatedBy",
        cs."updatedAt", u."name"
        """;

    public async Task<SessionsPage> ListAsync(
        RequestContext context, string counselorId, string? statusFilter, int page, int limit,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var where = "cs.\"counselorId\" = @cid AND cs.\"isActive\" = true";
        var hasStatus = !string.IsNullOrEmpty(statusFilter) && statusFilter != "all";
        if (hasStatus)
        {
            where += " AND cs.\"status\" = @status";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "counselor_sessions" cs WHERE {where}"""))
        {
            AddParameter(countCommand, "cid", counselorId);
            if (hasStatus)
            {
                AddParameter(countCommand, "status", statusFilter!);
            }

            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<SessionRow>();
        await using (var listCommand = Command(session, $"""
            SELECT {SelectColumns}
            FROM "counselor_sessions" cs
            LEFT JOIN "users" u ON u."id" = cs."studentId"
            WHERE {where}
            ORDER BY cs."startTime" DESC, cs."id" ASC
            OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCommand, "cid", counselorId);
            if (hasStatus)
            {
                AddParameter(listCommand, "status", statusFilter!);
            }

            AddParameter(listCommand, "offset", (long)(page - 1) * limit);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapRow(reader));
            }
        }

        return new SessionsPage(rows, total);
    }

    public async Task<CompleteResult> CompleteAsync(
        RequestContext context, string counselorId, string sessionId, string counselorNotes,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique → missing OR not owned → NotYourSession (both map to 403 "Not your session").
        await using (var lookup = Command(session, """SELECT "counselorId" FROM "counselor_sessions" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", sessionId);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != counselorId)
            {
                return CompleteResult.NotYourSession;
            }
        }

        await using (var update = Command(session, """
            UPDATE "counselor_sessions"
            SET "status" = 'completed', "completedAt" = @now, "counselorNotes" = @notes, "updatedAt" = @now
            WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "notes", counselorNotes);
            AddParameter(update, "id", sessionId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return CompleteResult.Ok;
    }

    private static SessionRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        CounselorId: reader.GetString(1),
        StudentId: reader.GetString(2),
        StartTime: IsoZ(reader.GetDateTime(3)),
        EndTime: IsoZ(reader.GetDateTime(4)),
        Status: reader.GetString(5),
        Topic: reader.GetString(6),
        Notes: reader.GetString(7),
        CounselorNotes: reader.GetString(8),
        MeetingLink: reader.GetString(9),
        CalendarEventIds: ReadJson(reader, 10),
        CancellationReason: reader.GetString(11),
        CancelledAt: reader.IsDBNull(12) ? null : IsoZ(reader.GetDateTime(12)),
        CancelledBy: reader.IsDBNull(13) ? null : reader.GetString(13),
        CompletedAt: reader.IsDBNull(14) ? null : IsoZ(reader.GetDateTime(14)),
        IsActive: reader.GetBoolean(15),
        CreatedBy: reader.IsDBNull(16) ? null : reader.GetString(16),
        CreatedDate: IsoZ(reader.GetDateTime(17)),
        UpdatedBy: reader.IsDBNull(18) ? null : reader.GetString(18),
        UpdatedAt: IsoZ(reader.GetDateTime(19)),
        StudentName: reader.IsDBNull(20) ? null : reader.GetString(20));

    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

    private static async Task<int> ScalarIntAsync(DbCommand command, CancellationToken cancellationToken)
    {
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is null or DBNull ? 0 : Convert.ToInt32(result, CultureInfo.InvariantCulture);
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

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
