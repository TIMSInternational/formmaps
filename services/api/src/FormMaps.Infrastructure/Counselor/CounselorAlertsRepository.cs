using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Counselor;

/// <summary>
/// Counselor alerts GET/PUT (FM-DOTNET-070). GET on a read-only RLS session; PUT (mark-read) on a writable session +
/// commit. The caseload is resolved from the caller's active assignments; the <c>?studentId</c> override is SCOPED to
/// that caseload (the ratified IDOR fold — a non-caseload studentId → empty queryIds → no rows). Timestamps bound
/// Kind=Unspecified + ms-truncated; SET columns are fixed literals (mass-assignment guard).
/// </summary>
public sealed class CounselorAlertsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICounselorAlertsRepository
{
    private const string SelectColumns =
        """
        "id", "schoolId", "studentId", "counselorId", "type", "severity"::text, "title", "message", "details",
        "isRead", "isDismissed", "readBy", "readAt", "relatedEntityId", "isActive", "createdBy", "createdDate",
        "updatedBy", "updatedAt"
        """;

    public async Task<AlertsPage> ListAsync(
        RequestContext context, string counselorId, string? studentIdFilter, bool unreadOnly, int page, int limit,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var caseload = await LoadCaseloadAsync(session, counselorId, cancellationToken);

        // IDOR fold: a ?studentId override is honoured ONLY if that student is in the caseload; else no rows.
        var queryIds = studentIdFilter is null
            ? caseload
            : caseload.Contains(studentIdFilter) ? [studentIdFilter] : Array.Empty<string>();

        var where = "\"studentId\" = ANY(@ids) AND \"isActive\" = true";
        if (unreadOnly)
        {
            where += " AND \"isRead\" = false";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "student_alerts" WHERE {where}"""))
        {
            AddParameter(countCommand, "ids", queryIds);
            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<AlertRow>();
        await using (var listCommand = Command(session, $"""
            SELECT {SelectColumns} FROM "student_alerts" WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCommand, "ids", queryIds);
            AddParameter(listCommand, "offset", (long)(page - 1) * limit);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapRow(reader));
            }
        }

        return new AlertsPage(rows, total);
    }

    public async Task<MarkReadResult> MarkReadAsync(
        RequestContext context, string counselorId, string alertId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique alert → missing → AlertNotFound.
        string alertStudentId;
        await using (var lookup = Command(session, """SELECT "studentId" FROM "student_alerts" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", alertId);
            var result = await lookup.ExecuteScalarAsync(cancellationToken);
            if (result is null or DBNull)
            {
                return MarkReadResult.AlertNotFound;
            }

            alertStudentId = (string)result;
        }

        // ensureCounselorStudentAccess: active assignment (counselorId, alert.studentId) → else NotAssigned.
        await using (var access = Command(session, """
            SELECT 1 FROM "counselor_student_assignments"
            WHERE "counselorId" = @cid AND "studentId" = @sid AND "isActive" = true LIMIT 1
            """))
        {
            AddParameter(access, "cid", counselorId);
            AddParameter(access, "sid", alertStudentId);
            await using var reader = await access.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return MarkReadResult.NotAssigned;
            }
        }

        await using (var update = Command(session, """
            UPDATE "student_alerts" SET "isRead" = true, "readBy" = @by, "readAt" = @now, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddParameter(update, "by", counselorId);
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", alertId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return MarkReadResult.Ok;
    }

    private static async Task<string[]> LoadCaseloadAsync(
        FormMapsDatabaseSession session, string counselorId, CancellationToken cancellationToken)
    {
        var ids = new List<string>();
        await using var command = Command(session, """
            SELECT "studentId" FROM "counselor_student_assignments" WHERE "counselorId" = @cid AND "isActive" = true
            """);
        AddParameter(command, "cid", counselorId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetString(0));
        }

        return ids.ToArray();
    }

    private static AlertRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        SchoolId: reader.IsDBNull(1) ? null : reader.GetString(1),
        StudentId: reader.GetString(2),
        CounselorId: reader.IsDBNull(3) ? null : reader.GetString(3),
        Type: reader.GetString(4),
        Severity: reader.GetString(5),
        Title: reader.IsDBNull(6) ? null : reader.GetString(6),
        Message: reader.GetString(7),
        Details: reader.IsDBNull(8) ? null : reader.GetString(8),
        IsRead: reader.GetBoolean(9),
        IsDismissed: reader.GetBoolean(10),
        ReadBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        ReadAt: reader.IsDBNull(12) ? null : IsoZ(reader.GetDateTime(12)),
        RelatedEntityId: reader.IsDBNull(13) ? null : reader.GetString(13),
        IsActive: reader.GetBoolean(14),
        CreatedBy: reader.IsDBNull(15) ? null : reader.GetString(15),
        CreatedDate: IsoZ(reader.GetDateTime(16)),
        UpdatedBy: reader.IsDBNull(17) ? null : reader.GetString(17),
        UpdatedAt: IsoZ(reader.GetDateTime(18)));

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
