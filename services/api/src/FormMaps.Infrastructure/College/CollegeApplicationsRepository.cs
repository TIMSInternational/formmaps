using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.Data;
using FormMaps.Application.StudentApplications;

namespace FormMaps.Infrastructure.College;

/// <summary>
/// College applications CRUD (FM-DOTNET-081 — routes/college.ts Feature 1). List = the reduced projection + two
/// UNFILTERED correlated counts (application_checklists / college_essays — Prisma _count has no isActive filter).
/// Create resolves the stored name via a universities lookup (uni.name, else collegeName, JS-|| "Unknown"), then a
/// fixed-column INSERT (mass-assignment guard) with column/appStatus enum casts. Update/soft-delete run on a writable
/// session + commit; timestamps bind Kind=Unspecified + ms-truncated. The full row uses the FM-074 ApplicationRow shape.
/// </summary>
public sealed class CollegeApplicationsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : ICollegeApplicationsRepository
{
    private const string RowColumns =
        """
        "id", "studentId", "name", "type", "location", "matchScore", "deadline", "notes", "column"::text,
        "fitClassification", "applicationDeadline", "deadlineType", "universityId", "isActive", "createdBy",
        "createdDate", "updatedBy", "updatedAt", "appStatus"::text
        """;

    public async Task<IReadOnlyList<ApplicationListRow>> ListAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT a."id", a."name", a."universityId", a."appStatus"::text, a."column"::text,
                   a."deadlineType", a."applicationDeadline", a."fitClassification", a."notes", a."createdDate",
                   (SELECT COUNT(*) FROM "application_checklists" c WHERE c."studentApplicationId" = a."id") AS "checklistCount",
                   (SELECT COUNT(*) FROM "college_essays" e WHERE e."studentApplicationId" = a."id") AS "essaysCount"
            FROM "student_applications" a
            WHERE a."studentId" = @sid AND a."isActive" = true
            ORDER BY a."createdDate" DESC, a."id" ASC
            """);
        AddParameter(command, "sid", studentId);

        var rows = new List<ApplicationListRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ApplicationListRow(
                Id: reader.GetString(0),
                CollegeName: reader.GetString(1),
                UniversityId: reader.IsDBNull(2) ? null : reader.GetString(2),
                AppStatus: reader.GetString(3),
                Column: reader.GetString(4),
                DeadlineType: reader.IsDBNull(5) ? null : reader.GetString(5),
                DeadlineDate: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
                FitClassification: reader.IsDBNull(7) ? null : reader.GetString(7),
                Notes: reader.IsDBNull(8) ? null : reader.GetString(8),
                CreatedDate: IsoZ(reader.GetDateTime(9)),
                ChecklistCount: (int)reader.GetInt64(10),
                EssaysCount: (int)reader.GetInt64(11)));
        }

        return rows;
    }

    public async Task<ApplicationRow> CreateAsync(
        RequestContext context, string callerId, CollegeCreateInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // name = collegeName; if a universityId was given AND the row exists → name = uni.name. Then JS-|| "Unknown".
        var name = input.CollegeName;
        if (input.UniversityId is not null)
        {
            await using var lookup = Command(session, """SELECT "name" FROM "universities" WHERE "id" = @uid""");
            AddParameter(lookup, "uid", input.UniversityId);
            var uniName = await lookup.ExecuteScalarAsync(cancellationToken);
            if (uniName is not null and not DBNull)
            {
                name = (string)uniName;
            }
        }

        var finalName = string.IsNullOrEmpty(name) ? "Unknown" : name;

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = $"""
            INSERT INTO "student_applications" (
                "id", "studentId", "name", "type", "universityId", "deadlineType", "applicationDeadline",
                "fitClassification", "appStatus", "column", "createdBy", "createdDate", "updatedAt")
            VALUES (
                gen_random_uuid()::text, @sid, @name, 'college', @uid, @deadlineType, @appDeadline,
                @fit, @appStatus::"CollegeAppStatus", @column::"ApplicationColumn", @caller, @now, @now)
            RETURNING {RowColumns}
            """;

        AddParameter(command, "sid", input.StudentId);
        AddParameter(command, "name", finalName);
        AddNullableString(command, "uid", input.UniversityId);
        AddNullableString(command, "deadlineType", input.DeadlineType);
        AddNullableTimestamp(command, "appDeadline", input.ApplicationDeadline);
        AddNullableString(command, "fit", input.FitClassification);
        AddParameter(command, "appStatus", input.AppStatus);
        AddParameter(command, "column", input.Column);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<string?> FindActiveOwnerAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session,
            """SELECT "studentId" FROM "student_applications" WHERE "id" = @id AND "isActive" = true""");
        AddParameter(command, "id", id);
        var owner = await command.ExecuteScalarAsync(cancellationToken);
        return owner is null or DBNull ? null : (string)owner;
    }

    public async Task<ApplicationRow> ApplyUpdateAsync(
        RequestContext context, string callerId, string id, CollegeUpdateFields fields,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var setClauses = new List<string>();
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        if (fields.HasAppStatus)
        {
            setClauses.Add("\"appStatus\" = @appStatus::\"CollegeAppStatus\"");
            AddParameter(command, "appStatus", fields.AppStatus!);
        }

        if (fields.ColumnSync)
        {
            setClauses.Add("\"column\" = @column::\"ApplicationColumn\"");
            AddParameter(command, "column", fields.Column!);
        }

        AddNullableSet(command, setClauses, fields.HasDeadlineType, fields.DeadlineTypeIsNull, "deadlineType", "deadlineType", fields.DeadlineType);
        AddNullableSet(command, setClauses, fields.HasFitClassification, fields.FitClassificationIsNull, "fitClassification", "fit", fields.FitClassification);
        AddNullableSet(command, setClauses, fields.HasNotes, fields.NotesIsNull, "notes", "notes", fields.Notes);

        if (fields.HasDeadlineDate)
        {
            if (fields.ApplicationDeadline is null)
            {
                setClauses.Add("\"applicationDeadline\" = NULL");
            }
            else
            {
                setClauses.Add("\"applicationDeadline\" = @appDeadline");
                AddTimestamp(command, "appDeadline", fields.ApplicationDeadline.Value);
            }
        }

        setClauses.Add("\"updatedBy\" = @caller");
        AddParameter(command, "caller", callerId);
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
        return row;
    }

    public async Task SoftDeleteAsync(
        RequestContext context, string callerId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, """
            UPDATE "student_applications" SET "isActive" = false, "updatedBy" = @caller, "updatedAt" = @now WHERE "id" = @id
            """);
        AddParameter(command, "caller", callerId);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", id);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
    }

    private static void AddNullableSet(
        DbCommand command, List<string> setClauses, bool has, bool isNull, string column, string param, string? value)
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
        AddParameter(command, param, value!);
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

    private static void AddNullableString(DbCommand command, string name, string? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = (object?)value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = ToStored(value);
        command.Parameters.Add(parameter);
    }

    private static void AddNullableTimestamp(DbCommand command, string name, DateTime? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value is null ? DBNull.Value : ToStored(value.Value);
        command.Parameters.Add(parameter);
    }

    // Bind to a `timestamp` (no tz) column: relabel Kind=Unspecified (the resolver hands us Kind=Utc wall-clock) +
    // ms-truncate so store == return == every read (matches Now() + the FM-029 tz rule).
    private static DateTime ToStored(DateTime value) =>
        new DateTime(
            (value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
