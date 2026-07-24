using System.Data;
using System.Data.Common;
using System.Globalization;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.StudentApplicationSubResources;

namespace FormMaps.Infrastructure.StudentApplicationSubResources;

/// <summary>
/// Application essays + checklist CRUD (FM-DOTNET-077). Every op verifies the parent application's ownership first
/// (SELECT "studentId" FROM "student_applications" WHERE "id" = @app → null / != caller → 404). Lists read on a
/// read-only RLS session; create/update on a writable session + commit (ownership + write in one session, atomic).
/// The Prisma type-check is deferred: create → past ownership; update → past ownership AND the sub-resource's own
/// existence check. Essay update applies bounded() slices; checklist update does not. Timestamps bind Kind=Unspecified
/// + ms-truncated; SET/INSERT columns are fixed literals (mass-assignment guard).
/// </summary>
public sealed class ApplicationSubResourceRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IApplicationSubResourceRepository
{
    private const string EssayColumns =
        """
        "id", "studentApplicationId", "title", "prompt", "wordLimit", "currentDraft", "draftVersion", "status",
        "dueDate", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    private const string ChecklistColumns =
        """
        "id", "studentApplicationId", "itemName", "category", "isCompleted", "completedAt", "dueDate", "notes",
        "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    private static readonly IReadOnlyDictionary<string, int> EssayBoundedLimits = new Dictionary<string, int>(StringComparer.Ordinal)
    {
        ["title"] = 200, ["prompt"] = 2000, ["currentDraft"] = 50_000, ["status"] = 50, ["dueDate"] = 50,
    };

    // ---- essays ----

    public async Task<EssayCreateResult> CreateEssayAsync(
        RequestContext context, string studentId, string appId, CreateEssayInput input, bool valid,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return new EssayCreateResult(SubResourceCreateOutcome.NotFound, null);
        }

        if (!valid)
        {
            return new EssayCreateResult(SubResourceCreateOutcome.InvalidBody, null);
        }

        await using var command = WritableCommand(session);
        AddParameter(command, "app", appId);
        AddParameter(command, "title", input.Title!);
        AddNullableParameter(command, "prompt", input.Prompt);
        AddNullableParameter(command, "wordLimit", input.WordLimit);
        AddNullableTimestamp(command, "dueDate", input.DueDate);
        AddTimestamp(command, "now", Now());

        command.CommandText = $"""
            INSERT INTO "application_essays"
                ("id", "studentApplicationId", "title", "prompt", "wordLimit", "dueDate", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @app, @title, @prompt, @wordLimit, @dueDate, @now, @now)
            RETURNING {EssayColumns}
            """;

        var row = await ReadSingleAsync(command, MapEssay, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new EssayCreateResult(SubResourceCreateOutcome.Ok, row);
    }

    public async Task<IReadOnlyList<EssayRow>?> ListEssaysAsync(
        RequestContext context, string studentId, string appId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return null;
        }

        await using var command = Command(session, $"""
            SELECT {EssayColumns} FROM "application_essays"
            WHERE "studentApplicationId" = @app AND "isActive" = true
            ORDER BY "createdDate" ASC
            """);
        AddParameter(command, "app", appId);
        return await ReadListAsync(command, MapEssay, cancellationToken);
    }

    public async Task<EssayUpdateResult> UpdateEssayAsync(
        RequestContext context, string studentId, string appId, string essayId, bool valid, EssayUpdateFields fields,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return new EssayUpdateResult(EssayUpdateOutcome.AppNotFound, null);
        }

        // findUnique(essayId) (no isActive) → missing OR belongs to a different application → EssayNotFound.
        string? storedDraft = null;
        var storedDraftIsNull = true;
        int storedDraftVersion;
        await using (var lookup = Command(session,
            """SELECT "studentApplicationId", "currentDraft", "draftVersion" FROM "application_essays" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", essayId);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != appId)
            {
                return new EssayUpdateResult(EssayUpdateOutcome.EssayNotFound, null);
            }

            storedDraftIsNull = reader.IsDBNull(1);
            storedDraft = storedDraftIsNull ? null : reader.GetString(1);
            storedDraftVersion = reader.GetInt32(2);
        }

        // A type Prisma would reject (deferred past both 404 gates).
        if (!valid)
        {
            return new EssayUpdateResult(EssayUpdateOutcome.InvalidBody, null);
        }

        var setClauses = new List<string>();
        await using var command = WritableCommand(session);

        void SetString(bool has, string column, string param, string? value)
        {
            if (!has) return;
            setClauses.Add($"\"{column}\" = @{param}");
            AddParameter(command, param, EssayBounded(column, value)!);
        }

        void SetNullableString(bool has, bool isNull, string column, string param, string? value)
        {
            if (!has) return;
            if (isNull) { setClauses.Add($"\"{column}\" = NULL"); return; }
            setClauses.Add($"\"{column}\" = @{param}");
            AddParameter(command, param, EssayBounded(column, value)!);
        }

        SetString(fields.HasTitle, "title", "title", fields.Title);
        SetNullableString(fields.HasPrompt, fields.PromptIsNull, "prompt", "prompt", fields.Prompt);
        SetString(fields.HasStatus, "status", "status", fields.Status);
        SetNullableString(fields.HasCurrentDraft, fields.CurrentDraftIsNull, "currentDraft", "currentDraft", fields.CurrentDraft);

        if (fields.HasWordLimit)
        {
            if (fields.WordLimitIsNull) { setClauses.Add("\"wordLimit\" = NULL"); }
            else { setClauses.Add("\"wordLimit\" = @wordLimit"); AddParameter(command, "wordLimit", fields.WordLimit!.Value); }
        }

        if (fields.HasDueDate)
        {
            if (fields.DueDateIsNull) { setClauses.Add("\"dueDate\" = NULL"); }
            else { setClauses.Add("\"dueDate\" = @dueDate"); AddTimestamp(command, "dueDate", TruncateMs(fields.DueDate!.Value)); }
        }

        // body.currentDraft !== essay.currentDraft (raw compare) → bump draftVersion.
        if (fields.HasCurrentDraft && DraftChanged(fields, storedDraft, storedDraftIsNull))
        {
            setClauses.Add("\"draftVersion\" = @draftVersion");
            AddParameter(command, "draftVersion", storedDraftVersion + 1);
        }

        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", essayId);

        command.CommandText = $"""
            UPDATE "application_essays" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {EssayColumns}
            """;

        var row = await ReadSingleAsync(command, MapEssay, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new EssayUpdateResult(EssayUpdateOutcome.Ok, row);
    }

    // ---- checklist ----

    public async Task<ChecklistCreateResult> CreateChecklistAsync(
        RequestContext context, string studentId, string appId, CreateChecklistInput input, bool valid,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return new ChecklistCreateResult(SubResourceCreateOutcome.NotFound, null);
        }

        if (!valid)
        {
            return new ChecklistCreateResult(SubResourceCreateOutcome.InvalidBody, null);
        }

        await using var command = WritableCommand(session);
        AddParameter(command, "app", appId);
        AddParameter(command, "itemName", input.ItemName!);
        AddParameter(command, "category", input.Category);
        AddNullableTimestamp(command, "dueDate", input.DueDate);
        AddNullableParameter(command, "notes", input.Notes);
        AddTimestamp(command, "now", Now());

        command.CommandText = $"""
            INSERT INTO "application_checklists"
                ("id", "studentApplicationId", "itemName", "category", "dueDate", "notes", "createdDate", "updatedAt")
            VALUES (gen_random_uuid()::text, @app, @itemName, @category, @dueDate, @notes, @now, @now)
            RETURNING {ChecklistColumns}
            """;

        var row = await ReadSingleAsync(command, MapChecklist, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new ChecklistCreateResult(SubResourceCreateOutcome.Ok, row);
    }

    public async Task<IReadOnlyList<ChecklistRow>?> ListChecklistAsync(
        RequestContext context, string studentId, string appId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return null;
        }

        await using var command = Command(session, $"""
            SELECT {ChecklistColumns} FROM "application_checklists"
            WHERE "studentApplicationId" = @app AND "isActive" = true
            ORDER BY "category" ASC, "createdDate" ASC
            """);
        AddParameter(command, "app", appId);
        return await ReadListAsync(command, MapChecklist, cancellationToken);
    }

    public async Task<ChecklistUpdateResult> UpdateChecklistAsync(
        RequestContext context, string studentId, string appId, string checklistId, bool valid,
        ChecklistUpdateFields fields, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnsApplicationAsync(session, appId, studentId, cancellationToken))
        {
            return new ChecklistUpdateResult(ChecklistUpdateOutcome.AppNotFound, null);
        }

        bool storedCompleted;
        await using (var lookup = Command(session,
            """SELECT "studentApplicationId", "isCompleted" FROM "application_checklists" WHERE "id" = @id"""))
        {
            AddParameter(lookup, "id", checklistId);
            await using var reader = await lookup.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != appId)
            {
                return new ChecklistUpdateResult(ChecklistUpdateOutcome.ItemNotFound, null);
            }

            storedCompleted = reader.GetBoolean(1);
        }

        if (!valid)
        {
            return new ChecklistUpdateResult(ChecklistUpdateOutcome.InvalidBody, null);
        }

        var setClauses = new List<string>();
        await using var command = WritableCommand(session);

        if (fields.HasIsCompleted)
        {
            setClauses.Add("\"isCompleted\" = @isCompleted");
            AddParameter(command, "isCompleted", fields.IsCompleted);
        }

        if (fields.HasItemName)
        {
            setClauses.Add("\"itemName\" = @itemName");
            AddParameter(command, "itemName", fields.ItemName!);
        }

        if (fields.HasCategory)
        {
            setClauses.Add("\"category\" = @category");
            AddParameter(command, "category", fields.Category!);
        }

        if (fields.HasNotes)
        {
            if (fields.NotesIsNull) { setClauses.Add("\"notes\" = NULL"); }
            else { setClauses.Add("\"notes\" = @notes"); AddParameter(command, "notes", fields.Notes!); }
        }

        if (fields.HasDueDate)
        {
            if (fields.DueDateIsNull) { setClauses.Add("\"dueDate\" = NULL"); }
            else { setClauses.Add("\"dueDate\" = @dueDate"); AddTimestamp(command, "dueDate", TruncateMs(fields.DueDate!.Value)); }
        }

        // isCompleted true when it was false → set completedAt=now; false when it was true → clear.
        if (fields.HasIsCompleted && fields.IsCompleted && !storedCompleted)
        {
            setClauses.Add("\"completedAt\" = @completedAt");
            AddTimestamp(command, "completedAt", Now());
        }
        else if (fields.HasIsCompleted && !fields.IsCompleted && storedCompleted)
        {
            setClauses.Add("\"completedAt\" = NULL");
        }

        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", checklistId);

        command.CommandText = $"""
            UPDATE "application_checklists" SET {string.Join(", ", setClauses)} WHERE "id" = @id RETURNING {ChecklistColumns}
            """;

        var row = await ReadSingleAsync(command, MapChecklist, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new ChecklistUpdateResult(ChecklistUpdateOutcome.Ok, row);
    }

    // ---- shared ----

    private static async Task<bool> OwnsApplicationAsync(
        FormMapsDatabaseSession session, string appId, string studentId, CancellationToken cancellationToken)
    {
        await using var lookup = Command(session, """SELECT "studentId" FROM "student_applications" WHERE "id" = @app""");
        AddParameter(lookup, "app", appId);
        var owner = await lookup.ExecuteScalarAsync(cancellationToken);
        return owner is not (null or DBNull) && (string)owner == studentId;
    }

    private static bool DraftChanged(EssayUpdateFields fields, string? storedDraft, bool storedDraftIsNull)
    {
        if (fields.CurrentDraftIsNull)
        {
            return !storedDraftIsNull; // null !== stored-string → changed
        }

        return storedDraftIsNull || fields.CurrentDraft != storedDraft;
    }

    private static string? EssayBounded(string column, string? value)
    {
        if (value is null) return null;
        var limit = EssayBoundedLimits.TryGetValue(column, out var l) ? l : 500;
        return value.Length <= limit ? value : value[..limit];
    }

    private static EssayRow MapEssay(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentApplicationId: reader.GetString(1),
        Title: reader.GetString(2),
        Prompt: reader.IsDBNull(3) ? null : reader.GetString(3),
        WordLimit: reader.IsDBNull(4) ? null : reader.GetInt32(4),
        CurrentDraft: reader.IsDBNull(5) ? null : reader.GetString(5),
        DraftVersion: reader.GetInt32(6),
        Status: reader.GetString(7),
        DueDate: reader.IsDBNull(8) ? null : IsoZ(reader.GetDateTime(8)),
        IsActive: reader.GetBoolean(9),
        CreatedBy: reader.IsDBNull(10) ? null : reader.GetString(10),
        CreatedDate: IsoZ(reader.GetDateTime(11)),
        UpdatedBy: reader.IsDBNull(12) ? null : reader.GetString(12),
        UpdatedAt: IsoZ(reader.GetDateTime(13)));

    private static ChecklistRow MapChecklist(DbDataReader reader) => new(
        Id: reader.GetString(0),
        StudentApplicationId: reader.GetString(1),
        ItemName: reader.GetString(2),
        Category: reader.GetString(3),
        IsCompleted: reader.GetBoolean(4),
        CompletedAt: reader.IsDBNull(5) ? null : IsoZ(reader.GetDateTime(5)),
        DueDate: reader.IsDBNull(6) ? null : IsoZ(reader.GetDateTime(6)),
        Notes: reader.IsDBNull(7) ? null : reader.GetString(7),
        IsActive: reader.GetBoolean(8),
        CreatedBy: reader.IsDBNull(9) ? null : reader.GetString(9),
        CreatedDate: IsoZ(reader.GetDateTime(10)),
        UpdatedBy: reader.IsDBNull(11) ? null : reader.GetString(11),
        UpdatedAt: IsoZ(reader.GetDateTime(12)));

    private static async Task<T> ReadSingleAsync<T>(DbCommand command, Func<DbDataReader, T> map, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return map(reader);
    }

    private static async Task<IReadOnlyList<T>> ReadListAsync<T>(DbCommand command, Func<DbDataReader, T> map, CancellationToken cancellationToken)
    {
        var rows = new List<T>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(map(reader));
        }

        return rows;
    }

    private DateTime Now() => TruncateMs(timeProvider.GetUtcNow().UtcDateTime);

    private static DateTime TruncateMs(DateTime value) =>
        new DateTime((value.Ticks / TimeSpan.TicksPerMillisecond) * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static DbCommand WritableCommand(FormMapsDatabaseSession session)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddNullableParameter(DbCommand command, string name, object? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = DateTime.SpecifyKind(value, DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static void AddNullableTimestamp(DbCommand command, string name, DateTime? value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value is null ? DBNull.Value : DateTime.SpecifyKind(TruncateMs(value.Value), DateTimeKind.Unspecified);
        command.Parameters.Add(parameter);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
