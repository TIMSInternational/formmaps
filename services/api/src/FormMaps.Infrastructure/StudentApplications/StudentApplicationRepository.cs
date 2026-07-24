using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.StudentApplications;

namespace FormMaps.Infrastructure.StudentApplications;

/// <summary>
/// Student applications core CRUD (FM-DOTNET-074). Reads on a read-only RLS session; create/update/soft-delete on a
/// writable session + commit (ownership + write in one session, atomic). column/appStatus are enum columns (read as
/// ::text, column written with a cast); matchScore is a nullable int; applicationDeadline is a nullable timestamp
/// (ISO-Z). Timestamps bind Kind=Unspecified + ms-truncated; SET/INSERT columns are fixed literals (mass-assignment
/// guard). Update applies the per-field bounded() string slice; the Prisma type-check is deferred past ownership.
/// </summary>
public sealed class StudentApplicationRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IStudentApplicationRepository
{
    private const string RowColumns =
        """
        "id", "studentId", "name", "type", "location", "matchScore", "deadline", "notes", "column"::text,
        "fitClassification", "applicationDeadline", "deadlineType", "universityId", "isActive", "createdBy",
        "createdDate", "updatedBy", "updatedAt", "appStatus"::text
        """;

    private static readonly IReadOnlyDictionary<string, int> BoundedLimits = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["name"] = 200, ["type"] = 100, ["location"] = 200, ["deadline"] = 50, ["notes"] = 2000, ["column"] = 50,
    };

    public Task<IReadOnlyList<ApplicationRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
        QueryAsync(context, studentId, extraWhere: null, "\"createdDate\" DESC, \"id\" ASC", cancellationToken);

    public Task<IReadOnlyList<ApplicationRow>> ListDeadlinesAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
        QueryAsync(context, studentId, extraWhere: "\"deadline\" IS NOT NULL", "\"deadline\" ASC, \"id\" ASC", cancellationToken);

    private async Task<IReadOnlyList<ApplicationRow>> QueryAsync(
        RequestContext context, string studentId, string? extraWhere, string orderBy, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        var where = "\"studentId\" = @sid AND \"isActive\" = true" + (extraWhere is null ? "" : $" AND {extraWhere}");
        await using var command = Command(session, $"""SELECT {RowColumns} FROM "student_applications" WHERE {where} ORDER BY {orderBy}""");
        AddParameter(command, "sid", studentId);

        var rows = new List<ApplicationRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapRow(reader));
        }

        return rows;
    }

    public async Task<ApplicationRow?> GetAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {RowColumns} FROM "student_applications"
            WHERE "id" = @id AND "studentId" = @sid AND "isActive" = true
            """);
        AddParameter(command, "id", id);
        AddParameter(command, "sid", studentId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapRow(reader) : null;
    }

    public async Task<ApplicationRow> CreateAsync(
        RequestContext context, string studentId, CreateApplicationInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var columns = new List<string> { "\"studentId\"", "\"name\"", "\"type\"", "\"column\"", "\"createdDate\"", "\"updatedAt\"" };
        var valueParts = new List<string> { "@sid", "@name", "@type", "@column::\"ApplicationColumn\"", "@now", "@now" };

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        AddParameter(command, "sid", studentId);
        AddParameter(command, "name", input.Name);
        AddParameter(command, "type", input.Type);
        AddParameter(command, "column", input.Column);
        AddTimestamp(command, "now", Now());

        void Optional(bool has, string column, string placeholder, Action bind)
        {
            if (!has)
            {
                return;
            }

            columns.Add(column);
            valueParts.Add(placeholder);
            bind();
        }

        Optional(input.HasLocation, "\"location\"", "@loc", () => AddParameter(command, "loc", input.Location!));
        Optional(input.HasMatchScore, "\"matchScore\"", "@ms", () => AddParameter(command, "ms", input.MatchScore!.Value));
        Optional(input.HasDeadline, "\"deadline\"", "@deadline", () => AddParameter(command, "deadline", input.Deadline!));
        Optional(input.HasNotes, "\"notes\"", "@notes", () => AddParameter(command, "notes", input.Notes!));

        command.CommandText = $"""
            INSERT INTO "student_applications" ({string.Join(", ", new[] { "\"id\"" }.Concat(columns))})
            VALUES ({string.Join(", ", new[] { "gen_random_uuid()::text" }.Concat(valueParts))})
            RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<ApplicationUpdateResult> UpdateAsync(
        RequestContext context, string studentId, string id, bool fieldsValid, ApplicationUpdateFields fields,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique (no isActive) → studentId != caller (or missing) → NotFound → 404.
        await using (var lookup = Command(session, """SELECT "studentId" FROM "student_applications" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", id);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != studentId)
            {
                return new ApplicationUpdateResult(ApplicationUpdateOutcome.NotFound, null);
            }
        }

        // A type Prisma would reject (deferred past ownership).
        if (!fieldsValid)
        {
            return new ApplicationUpdateResult(ApplicationUpdateOutcome.InvalidBody, null);
        }

        var setClauses = new List<string>();
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        void SetString(bool has, string column, string param, string? value)
        {
            if (!has)
            {
                return;
            }

            setClauses.Add($"\"{column}\" = @{param}");
            AddParameter(command, param, Bounded(column, value)!);
        }

        void SetNullableString(bool has, bool isNull, string column, string param, string? value)
        {
            if (!has)
            {
                return;
            }

            if (isNull)
            {
                setClauses.Add($"\"{column}\" = NULL");
                return;
            }

            setClauses.Add($"\"{column}\" = @{param}");
            AddParameter(command, param, Bounded(column, value)!);
        }

        SetString(fields.HasName, "name", "name", fields.Name);
        SetString(fields.HasType, "type", "type", fields.Type);
        SetNullableString(fields.HasLocation, fields.LocationIsNull, "location", "loc", fields.Location);
        SetNullableString(fields.HasDeadline, fields.DeadlineIsNull, "deadline", "deadline", fields.Deadline);
        SetNullableString(fields.HasNotes, fields.NotesIsNull, "notes", "notes", fields.Notes);

        if (fields.HasMatchScore)
        {
            if (fields.MatchScoreIsNull)
            {
                setClauses.Add("\"matchScore\" = NULL");
            }
            else
            {
                setClauses.Add("\"matchScore\" = @ms");
                AddParameter(command, "ms", fields.MatchScore!.Value);
            }
        }

        if (fields.HasColumn)
        {
            setClauses.Add("\"column\" = @column::\"ApplicationColumn\"");
            AddParameter(command, "column", Bounded("column", fields.Column)!);
        }

        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);

        command.CommandText = $"""
            UPDATE "student_applications" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return new ApplicationUpdateResult(ApplicationUpdateOutcome.Ok, row);
    }

    public async Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var lookup = Command(session, """SELECT "studentId" FROM "student_applications" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", id);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != studentId)
            {
                return false;
            }
        }

        await using (var update = Command(session, """
            UPDATE "student_applications" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", id);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    private static string? Bounded(string column, string? value)
    {
        if (value is null)
        {
            return null;
        }

        var limit = BoundedLimits.TryGetValue(column, out var l) ? l : 500;
        return value.Length <= limit ? value : value[..limit];
    }

    private static ApplicationRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        Name: reader.GetString(2),
        Type: reader.GetString(3),
        Location: reader.IsDBNull(4) ? null : reader.GetString(4),
        MatchScore: reader.IsDBNull(5) ? null : reader.GetInt32(5),
        Deadline: reader.IsDBNull(6) ? null : reader.GetString(6),
        Notes: reader.IsDBNull(7) ? null : reader.GetString(7),
        Column: reader.GetString(8),
        FitClassification: reader.IsDBNull(9) ? null : reader.GetString(9),
        ApplicationDeadline: reader.IsDBNull(10) ? null : IsoZ(reader.GetDateTime(10)),
        DeadlineType: reader.IsDBNull(11) ? null : reader.GetString(11),
        UniversityId: reader.IsDBNull(12) ? null : reader.GetString(12),
        IsActive: reader.GetBoolean(13),
        CreatedBy: reader.IsDBNull(14) ? null : reader.GetString(14),
        CreatedDate: IsoZ(reader.GetDateTime(15)),
        UpdatedBy: reader.IsDBNull(16) ? null : reader.GetString(16),
        UpdatedAt: IsoZ(reader.GetDateTime(17)),
        AppStatus: reader.GetString(18));

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
