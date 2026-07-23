using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.StudentPortfolio;

namespace FormMaps.Infrastructure.StudentPortfolio;

/// <summary>
/// Student portfolio CRUD (FM-DOTNET-073). Reads on a read-only RLS session; create/update/soft-delete on a writable
/// session + commit (ownership + write in one session, atomic). hoursPerWeek/totalHours are Decimal(65,30) columns →
/// emitted as trim_scale::text (decimal.js-normalized string) on the row, cast ::double precision for the summary
/// (== JS Number()). attachments is verbatim jsonb; activityCategory is the enum text. Timestamps bind
/// Kind=Unspecified + ms-truncated; SET/INSERT columns are fixed literals (mass-assignment guard). Update applies the
/// per-field bounded() string slice.
/// </summary>
public sealed class StudentPortfolioRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IStudentPortfolioRepository
{
    private const string RowColumns =
        """
        "id", "studentId", "type", "title", "organization", "startDate", "endDate", "isCurrent", "description",
        "role", trim_scale("hoursPerWeek")::text, trim_scale("totalHours")::text, "achievements", "skills",
        "attachments"::text, "activityCategory"::text, "weeksPerYear", "isActive", "createdBy", "createdDate",
        "updatedBy", "updatedAt"
        """;

    // bounded() per-field string slice limits (studentService.updatePortfolioItem); absent keys default to 500.
    private static readonly IReadOnlyDictionary<string, int> BoundedLimits = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["type"] = 50, ["title"] = 200, ["organization"] = 200, ["startDate"] = 50, ["endDate"] = 50,
        ["description"] = 2000, ["role"] = 200, ["activityCategory"] = 100,
    };

    public async Task<PortfolioPage> ListAsync(
        RequestContext context, string studentId, string? type, int page, int limit,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var where = "\"studentId\" = @sid AND \"isActive\" = true";
        var hasType = !string.IsNullOrEmpty(type);
        if (hasType)
        {
            where += " AND \"type\" = @type";
        }

        int total;
        await using (var countCommand = Command(session, $"""SELECT COUNT(*)::int FROM "student_portfolio_items" WHERE {where}"""))
        {
            AddParameter(countCommand, "sid", studentId);
            if (hasType)
            {
                AddParameter(countCommand, "type", type!);
            }

            total = await ScalarIntAsync(countCommand, cancellationToken);
        }

        var rows = new List<PortfolioRow>();
        await using (var listCommand = Command(session, $"""
            SELECT {RowColumns} FROM "student_portfolio_items" WHERE {where}
            ORDER BY "createdDate" DESC, "id" ASC
            OFFSET @offset LIMIT @limit
            """))
        {
            AddParameter(listCommand, "sid", studentId);
            if (hasType)
            {
                AddParameter(listCommand, "type", type!);
            }

            AddParameter(listCommand, "offset", (long)(page - 1) * limit);
            AddParameter(listCommand, "limit", limit);
            await using var reader = await listCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(MapRow(reader));
            }
        }

        return new PortfolioPage(rows, total);
    }

    public async Task<PortfolioSummary> GetSummaryAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // No orderBy in legacy (unspecified); a stable createdDate/id order is a documented determinism superset.
        await using var command = Command(session, """
            SELECT "type", "hoursPerWeek"::double precision, "totalHours"::double precision, "skills"
            FROM "student_portfolio_items" WHERE "studentId" = @sid AND "isActive" = true
            ORDER BY "createdDate" ASC, "id" ASC
            """);
        AddParameter(command, "sid", studentId);

        var byType = new Dictionary<string, int>(StringComparer.Ordinal); // insertion order preserved
        var skillSet = new List<string>();
        var seenSkills = new HashSet<string>(StringComparer.Ordinal);
        var totalHoursPerWeek = 0.0;
        var totalVolunteerHours = 0.0;
        var totalItems = 0;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            totalItems++;
            var type = reader.GetString(0);
            byType[type] = byType.TryGetValue(type, out var c) ? c + 1 : 1;

            if (!reader.IsDBNull(1))
            {
                totalHoursPerWeek += reader.GetDouble(1); // if (item.hoursPerWeek) — non-null (Decimal is always truthy)
            }

            if (type == "volunteer" && !reader.IsDBNull(2))
            {
                totalVolunteerHours += reader.GetDouble(2);
            }

            if (!reader.IsDBNull(3))
            {
                foreach (var skill in reader.GetFieldValue<string[]>(3))
                {
                    if (seenSkills.Add(skill))
                    {
                        skillSet.Add(skill);
                    }
                }
            }
        }

        return new PortfolioSummary(totalItems, byType, totalHoursPerWeek, totalVolunteerHours, skillSet, byType.Count);
    }

    public async Task<PortfolioRow> CreateAsync(
        RequestContext context, string studentId, PortfolioInput input, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Always-set columns (create-time || defaults already resolved) + conditional optional columns.
        var columns = new List<string> { "\"studentId\"", "\"type\"", "\"title\"", "\"isCurrent\"", "\"achievements\"", "\"skills\"", "\"createdDate\"", "\"updatedAt\"" };
        var values = new List<string> { "gen_random_uuid()::text" }; // id first (prepended below to the column list)

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        AddParameter(command, "sid", studentId);
        AddParameter(command, "type", (input.HasType && !string.IsNullOrEmpty(input.Type)) ? input.Type! : "activity"); // || "activity"
        AddParameter(command, "title", input.Title ?? string.Empty);      // required (min 1) → || "" is moot
        AddParameter(command, "isCurrent", input.IsCurrent);              // || false (absent → false)
        AddParameter(command, "achievements", input.HasAchievements ? input.Achievements! : Array.Empty<string>());
        AddParameter(command, "skills", input.HasSkills ? input.Skills! : Array.Empty<string>());
        AddTimestamp(command, "now", Now());

        var valueParts = new List<string> { "@sid", "@type", "@title", "@isCurrent", "@achievements", "@skills", "@now", "@now" };

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

        Optional(input.HasOrganization, "\"organization\"", "@org", () => AddParameter(command, "org", input.Organization!));
        Optional(input.HasStartDate, "\"startDate\"", "@startDate", () => AddParameter(command, "startDate", input.StartDate!));
        Optional(input.HasEndDate, "\"endDate\"", "@endDate", () => AddParameter(command, "endDate", input.EndDate!));
        Optional(input.HasDescription, "\"description\"", "@description", () => AddParameter(command, "description", input.Description!));
        Optional(input.HasRole, "\"role\"", "@role", () => AddParameter(command, "role", input.Role!));
        Optional(input.HasHoursPerWeek, "\"hoursPerWeek\"", "@hpw", () => AddParameter(command, "hpw", input.HoursPerWeek!.Value));
        Optional(input.HasWeeksPerYear, "\"weeksPerYear\"", "@wpy", () => AddParameter(command, "wpy", input.WeeksPerYear!.Value));
        Optional(input.HasActivityCategory, "\"activityCategory\"", "@cat::\"StudentActivityCategory\"", () => AddParameter(command, "cat", input.ActivityCategory!));
        Optional(input.HasTotalHours, "\"totalHours\"", "@total", () => AddParameter(command, "total", input.TotalHours!.Value));

        var columnList = string.Join(", ", new[] { "\"id\"" }.Concat(columns));
        var valueList = string.Join(", ", values.Concat(valueParts));
        command.CommandText = $"""
            INSERT INTO "student_portfolio_items" ({columnList}) VALUES ({valueList}) RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<PortfolioRow?> UpdateAsync(
        RequestContext context, string studentId, string itemId, PortfolioInput input,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // findUnique (no isActive filter) → studentId != caller (or missing) → null → 404.
        await using (var lookup = Command(session, """SELECT "studentId" FROM "student_portfolio_items" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", itemId);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != studentId)
            {
                return null;
            }
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
            AddParameter(command, param, Bounded(column, value)!); // value non-null when Has* is set (validated string)
        }

        SetString(input.HasType, "type", "type", input.Type);
        SetString(input.HasTitle, "title", "title", input.Title);
        SetString(input.HasOrganization, "organization", "org", input.Organization);
        SetString(input.HasStartDate, "startDate", "startDate", input.StartDate);
        SetString(input.HasEndDate, "endDate", "endDate", input.EndDate);
        SetString(input.HasDescription, "description", "description", input.Description);
        SetString(input.HasRole, "role", "role", input.Role);

        if (input.HasIsCurrent)
        {
            setClauses.Add("\"isCurrent\" = @isCurrent");
            AddParameter(command, "isCurrent", input.IsCurrent);
        }

        if (input.HasHoursPerWeek)
        {
            setClauses.Add("\"hoursPerWeek\" = @hpw");
            AddParameter(command, "hpw", input.HoursPerWeek!.Value);
        }

        if (input.HasWeeksPerYear)
        {
            setClauses.Add("\"weeksPerYear\" = @wpy");
            AddParameter(command, "wpy", input.WeeksPerYear!.Value);
        }

        if (input.HasActivityCategory)
        {
            setClauses.Add("\"activityCategory\" = @cat::\"StudentActivityCategory\"");
            AddParameter(command, "cat", Bounded("activityCategory", input.ActivityCategory)!);
        }

        if (input.HasTotalHours)
        {
            setClauses.Add("\"totalHours\" = @total");
            AddParameter(command, "total", input.TotalHours!.Value);
        }

        if (input.HasAchievements)
        {
            setClauses.Add("\"achievements\" = @achievements");
            AddParameter(command, "achievements", input.Achievements!);
        }

        if (input.HasSkills)
        {
            setClauses.Add("\"skills\" = @skills");
            AddParameter(command, "skills", input.Skills!);
        }

        setClauses.Add("\"updatedAt\" = @now"); // @updatedAt bumped on every update (even empty data)
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", itemId);

        command.CommandText = $"""
            UPDATE "student_portfolio_items" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {RowColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapRow(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return row;
    }

    public async Task<bool> SoftDeleteAsync(
        RequestContext context, string studentId, string itemId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        await using (var lookup = Command(session, """SELECT "studentId" FROM "student_portfolio_items" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", itemId);
            var owner = await lookup.ExecuteScalarAsync(cancellationToken);
            if (owner is null or DBNull || (string)owner != studentId)
            {
                return false;
            }
        }

        await using (var update = Command(session, """
            UPDATE "student_portfolio_items" SET "isActive" = false, "updatedAt" = @now WHERE "id" = @id
            """))
        {
            AddTimestamp(update, "now", Now());
            AddParameter(update, "id", itemId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    // bounded(): strings sliced to the per-field limit (default 500); non-strings pass through (null here = absent).
    private static string? Bounded(string column, string? value)
    {
        if (value is null)
        {
            return null;
        }

        var limit = BoundedLimits.TryGetValue(column, out var l) ? l : 500;
        return value.Length <= limit ? value : value[..limit];
    }

    private static PortfolioRow MapRow(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentId: reader.GetString(1),
        Type: reader.GetString(2),
        Title: reader.GetString(3),
        Organization: reader.IsDBNull(4) ? null : reader.GetString(4),
        StartDate: reader.IsDBNull(5) ? null : reader.GetString(5),
        EndDate: reader.IsDBNull(6) ? null : reader.GetString(6),
        IsCurrent: reader.GetBoolean(7),
        Description: reader.IsDBNull(8) ? null : reader.GetString(8),
        Role: reader.IsDBNull(9) ? null : reader.GetString(9),
        HoursPerWeek: reader.IsDBNull(10) ? null : reader.GetString(10),
        TotalHours: reader.IsDBNull(11) ? null : reader.GetString(11),
        Achievements: reader.IsDBNull(12) ? Array.Empty<string>() : reader.GetFieldValue<string[]>(12),
        Skills: reader.IsDBNull(13) ? Array.Empty<string>() : reader.GetFieldValue<string[]>(13),
        Attachments: ReadJson(reader, 14),
        ActivityCategory: reader.GetString(15),
        WeeksPerYear: reader.IsDBNull(16) ? null : reader.GetInt32(16),
        IsActive: reader.GetBoolean(17),
        CreatedBy: reader.IsDBNull(18) ? null : reader.GetString(18),
        CreatedDate: IsoZ(reader.GetDateTime(19)),
        UpdatedBy: reader.IsDBNull(20) ? null : reader.GetString(20),
        UpdatedAt: IsoZ(reader.GetDateTime(21)));

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
