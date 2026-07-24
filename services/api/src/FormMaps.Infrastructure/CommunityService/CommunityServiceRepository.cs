using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.CommunityService;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CommunityService;

/// <summary>
/// Student community-service CRUD (FM-DOTNET-075). Reads on a read-only RLS session; create/update/soft-delete on a
/// writable session + commit (gate + write in one session, atomic). hours is a Decimal → trim_scale::text (decimal.js
/// string) on the row, summed ::double precision for totalHours. Edit/delete gate on owner + isActive + status=="pending".
/// date/timestamps bind Kind=Unspecified + ms-truncated; SET/INSERT columns are fixed literals (mass-assignment guard).
/// Update writes the zod-validated values verbatim (no bounded() — zod already capped lengths).
/// </summary>
public sealed class CommunityServiceRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICommunityServiceRepository
{
    private const string RowColumns =
        """
        "id", "studentId", "schoolId", "organization", "description", trim_scale("hours")::text, "date",
        "supervisorName", "supervisorEmail", "status"::text, "note", "verifiedBy", "verifiedAt", "isActive",
        "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<CommunityServiceList> GetListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // user.schoolId — the list is schoolId-scoped only when the caller has a school.
        string? schoolId = null;
        await using (var userCmd = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @sid"""))
        {
            AddParameter(userCmd, "sid", studentId);
            var result = await userCmd.ExecuteScalarAsync(cancellationToken);
            if (result is string s)
            {
                schoolId = s;
            }
        }

        var where = "\"studentId\" = @sid AND \"isActive\" = true";
        if (schoolId is not null)
        {
            where += " AND \"schoolId\" = @school";
        }

        var rows = new List<CommunityServiceRow>();
        var totalHours = 0.0;
        await using (var listCmd = Command(session, $"""
            SELECT {RowColumns}, "hours"::double precision FROM "community_service_entries" WHERE {where}
            ORDER BY "date" DESC, "id" ASC
            """))
        {
            AddParameter(listCmd, "sid", studentId);
            if (schoolId is not null)
            {
                AddParameter(listCmd, "school", schoolId);
            }

            await using var reader = await listCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapRow(reader));
                totalHours += reader.GetDouble(18); // Σ Number(hours)
            }
        }

        var totalHoursRequired = 0;
        if (schoolId is not null)
        {
            await using var schoolCmd = Command(session, """SELECT "serviceHoursRequired" FROM "schools" WHERE "id" = @school""");
            AddParameter(schoolCmd, "school", schoolId);
            var result = await schoolCmd.ExecuteScalarAsync(cancellationToken);
            if (result is int i)
            {
                totalHoursRequired = i; // ?? 0 for a NULL column
            }
        }

        return new CommunityServiceList(rows, totalHours, totalHoursRequired);
    }

    public async Task<CreateCommunityServiceResult> CreateAsync(
        RequestContext context, string studentId, CommunityServiceCreateInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        string schoolId;
        await using (var userCmd = Command(session, """SELECT "schoolId" FROM "users" WHERE "id" = @sid"""))
        {
            AddParameter(userCmd, "sid", studentId);
            var result = await userCmd.ExecuteScalarAsync(cancellationToken);
            if (result is not string s)
            {
                return new CreateCommunityServiceResult(NoSchool: true, null); // → 400 "No school"
            }

            schoolId = s;
        }

        var columns = new List<string> { "\"studentId\"", "\"schoolId\"", "\"organization\"", "\"hours\"", "\"date\"", "\"createdDate\"", "\"updatedAt\"" };
        var valueParts = new List<string> { "@sid", "@school", "@org", "@hours", "@date", "@now", "@now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "sid", studentId);
        AddParameter(command, "school", schoolId);
        AddParameter(command, "org", input.Organization);
        AddParameter(command, "hours", input.Hours);
        AddTimestamp(command, "date", ToStorage(input.Date));
        AddTimestamp(command, "now", Now());

        void Optional(bool has, string column, string placeholder, Action bind)
        {
            if (!has) return;
            columns.Add(column);
            valueParts.Add(placeholder);
            bind();
        }

        Optional(input.HasDescription, "\"description\"", "@desc", () => AddParameter(command, "desc", input.Description!));
        Optional(input.HasSupervisorName, "\"supervisorName\"", "@sname", () => AddParameter(command, "sname", input.SupervisorName!));
        Optional(input.HasSupervisorEmail, "\"supervisorEmail\"", "@semail", () => AddParameter(command, "semail", input.SupervisorEmail!));

        command.CommandText = $"""
            INSERT INTO "community_service_entries" ({string.Join(", ", new[] { "\"id\"" }.Concat(columns))})
            VALUES ({string.Join(", ", new[] { "gen_random_uuid()::text" }.Concat(valueParts))})
            RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return new CreateCommunityServiceResult(NoSchool: false, row);
    }

    public async Task<CommunityServiceRow?> UpdateAsync(
        RequestContext context, string studentId, string id, CommunityServicePatch patch, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await IsEditableAsync(session, studentId, id, cancellationToken))
        {
            return null; // missing / not owned / inactive / not pending → 404
        }

        var setClauses = new List<string>();
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        void SetString(bool has, string column, string param, string? value)
        {
            if (!has) return;
            setClauses.Add($"\"{column}\" = @{param}");
            AddParameter(command, param, value!);
        }

        SetString(patch.HasOrganization, "organization", "org", patch.Organization);
        SetString(patch.HasDescription, "description", "desc", patch.Description);
        SetString(patch.HasSupervisorName, "supervisorName", "sname", patch.SupervisorName);
        SetString(patch.HasSupervisorEmail, "supervisorEmail", "semail", patch.SupervisorEmail);

        if (patch.HasHours)
        {
            setClauses.Add("\"hours\" = @hours");
            AddParameter(command, "hours", patch.Hours!.Value);
        }

        if (patch.HasDate)
        {
            setClauses.Add("\"date\" = @date");
            AddTimestamp(command, "date", ToStorage(patch.Date!.Value));
        }

        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);

        command.CommandText = $"""
            UPDATE "community_service_entries" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await IsEditableAsync(session, studentId, id, cancellationToken))
        {
            return false;
        }

        await using (var update = Command(session, """
            UPDATE "community_service_entries" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", id);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // findUnique → owner AND isActive AND status=="pending".
    private static async Task<bool> IsEditableAsync(
        FormMapsDatabaseSession session, string studentId, string id, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "studentId", "isActive", "status"::text FROM "community_service_entries" WHERE "id" = @id""");
        AddParameter(command, "id", id);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false;
        }

        return reader.GetString(0) == studentId && reader.GetBoolean(1) && reader.GetString(2) == "pending";
    }

    private static CommunityServiceRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        SchoolId: reader.GetString(2),
        Organization: reader.GetString(3),
        Description: reader.IsDBNull(4) ? null : reader.GetString(4),
        Hours: reader.GetString(5),
        Date: IsoZ(reader.GetDateTime(6)),
        SupervisorName: reader.IsDBNull(7) ? null : reader.GetString(7),
        SupervisorEmail: reader.IsDBNull(8) ? null : reader.GetString(8),
        Status: reader.GetString(9),
        Note: reader.IsDBNull(10) ? null : reader.GetString(10),
        VerifiedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        VerifiedAt: reader.IsDBNull(12) ? null : IsoZ(reader.GetDateTime(12)),
        IsActive: reader.GetBoolean(13),
        CreatedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
        CreatedDate: IsoZ(reader.GetDateTime(15)),
        UpdatedBy: reader.IsDBNull(16) ? null : reader.GetString(16),
        UpdatedAt: IsoZ(reader.GetDateTime(17)));

    private static DateTime ToStorage(DateTime value) =>
        new DateTime((value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);

    private DateTime Now() =>
        new DateTime(
            (timeProvider.GetUtcNow().UtcDateTime.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond,
            DateTimeKind.Unspecified);

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
