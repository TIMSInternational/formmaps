using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Resumes;

namespace FormMaps.Infrastructure.Resumes;

/// <summary>
/// Resume CRUD list + create (FM-DOTNET-090 — routes/resume.ts). Both operations are self-scoped by <c>userId</c>
/// in the WHERE/INSERT (resumes has no RLS). List = findMany{userId,isActive} ORDER BY updatedAt DESC (id ASC
/// tie-break) → the full 22-column Prisma row (jsonb read as <c>::text</c> and passed through verbatim). Create runs
/// on a writable session: a fixed-column INSERT (mass-assignment guard) of the coalesced values from
/// <see cref="ResumeCreate"/>, with createdDate/updatedAt bound Kind=Unspecified + ms-truncated (the FM-029 tz rule)
/// and every other column (documentEdits/originalFileKey/…/isActive) taking its DB default, RETURNING the full row.
/// </summary>
public sealed class ResumeRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IResumeRepository
{
    // The full Prisma Resume row in schema-declaration order; jsonb columns cast to ::text for verbatim passthrough.
    private const string ResumeColumns =
        """
        "id", "userId", "name", "template", "careerField",
        "personalInfo"::text, "experience"::text, "education"::text, "skills"::text,
        "sections"::text, "fieldVisibility"::text, "customFields"::text, "documentEdits"::text,
        "originalFileKey", "originalFileType", "originalPdfKey", "hasOriginal", "isActive",
        "createdBy", "createdDate", "updatedBy", "updatedAt"
        """;

    public async Task<IReadOnlyList<ResumeRow>> ListAsync(
        RequestContext context, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, $"""
            SELECT {ResumeColumns}
            FROM "resumes"
            WHERE "userId" = @uid AND "isActive" = true
            ORDER BY "updatedAt" DESC, "id" ASC
            """);
        AddParameter(command, "uid", context.Actor!.UserId);

        var rows = new List<ResumeRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(MapResume(reader));
        }

        return rows;
    }

    public async Task<ResumeCreateOutcome> CreateAsync(
        RequestContext context, JsonElement body, CancellationToken cancellationToken = default)
    {
        var values = ResumeCreate.Resolve(body);
        if (values is null)
        {
            return ResumeCreateOutcome.InvalidStringField; // truthy non-string for a String column → 500
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = $"""
            INSERT INTO "resumes" (
                "id", "userId", "name", "template", "careerField",
                "personalInfo", "experience", "education", "skills", "sections", "fieldVisibility", "customFields",
                "createdDate", "updatedAt")
            VALUES (
                gen_random_uuid()::text, @uid, @name, @template, @careerField,
                @personalInfo::jsonb, @experience::jsonb, @education::jsonb, @skills::jsonb, @sections::jsonb,
                @fieldVisibility::jsonb, @customFields::jsonb,
                @now, @now)
            RETURNING {ResumeColumns}
            """;

        AddParameter(command, "uid", context.Actor!.UserId);
        AddParameter(command, "name", values.Name);
        AddParameter(command, "template", values.Template);
        AddParameter(command, "careerField", values.CareerField);
        AddParameter(command, "personalInfo", values.PersonalInfoJson);
        AddParameter(command, "experience", values.ExperienceJson);
        AddParameter(command, "education", values.EducationJson);
        AddParameter(command, "skills", values.SkillsJson);
        AddParameter(command, "sections", values.SectionsJson);
        AddParameter(command, "fieldVisibility", values.FieldVisibilityJson);
        AddParameter(command, "customFields", values.CustomFieldsJson);
        AddTimestamp(command, "now", Now());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapResume(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return ResumeCreateOutcome.Created(row);
    }

    public async Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, $"""
            SELECT {ResumeColumns} FROM "resumes" WHERE "id" = @id AND "isActive" = true
            """);
        AddParameter(command, "id", resumeId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapResume(reader) : null;
    }

    public async Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(
        string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, $"""
            SELECT {ResumeColumns}
            FROM "resumes"
            WHERE "userId" = @uid AND "isActive" = true
            ORDER BY "updatedAt" DESC, "id" ASC
            LIMIT 1
            """);
        AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? MapResume(reader) : null;
    }

    public async Task<ResumeUpdateOutcome> UpdateAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var owner = await LoadOwnerAsync(session, resumeId, cancellationToken);
        if (owner is null || owner != context.Actor!.UserId)
        {
            return ResumeUpdateOutcome.NotOwned;
        }

        var fields = ResumeUpdate.ResolveFields(body);
        var documentEdits = ResumeUpdate.SanitizeDocumentEdits(body);

        var setClauses = new List<string>();
        var jsonbColumns = new HashSet<string>(
            ["personalInfo", "experience", "education", "skills", "sections", "fieldVisibility", "customFields"],
            StringComparer.Ordinal);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;

        foreach (var (key, value) in fields)
        {
            var paramName = "p_" + key;
            setClauses.Add(jsonbColumns.Contains(key)
                ? $"\"{key}\" = @{paramName}::jsonb"
                : $"\"{key}\" = @{paramName}");
            AddParameter(command, paramName, jsonbColumns.Contains(key) ? value.GetRawText() : GetScalar(value));
        }

        if (documentEdits is not null)
        {
            setClauses.Add("\"documentEdits\" = @documentEdits::jsonb");
            AddParameter(command, "documentEdits", documentEdits);
        }

        setClauses.Add("\"updatedAt\" = @now");
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", resumeId);

        command.CommandText = $"""
            UPDATE "resumes" SET {string.Join(", ", setClauses)}
            WHERE "id" = @id
            RETURNING {ResumeColumns}
            """;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var row = MapResume(reader);
        await reader.DisposeAsync();
        await session.CommitAsync(cancellationToken);
        return ResumeUpdateOutcome.Updated(row);
    }

    public async Task<bool> SoftDeleteAsync(
        RequestContext context, string resumeId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var owner = await LoadOwnerAsync(session, resumeId, cancellationToken);
        if (owner is null || owner != context.Actor!.UserId)
        {
            return false;
        }

        await using var command = Command(session, """UPDATE "resumes" SET "isActive" = false WHERE "id" = @id""");
        AddParameter(command, "id", resumeId);
        await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return true;
    }

    // findUnique(id) with NO isActive filter — mirrors ResumeSectionsRepository's LoadAsync ownership pattern.
    private static async Task<string?> LoadOwnerAsync(
        FormMapsDatabaseSession session, string resumeId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "userId" FROM "resumes" WHERE "id" = @id""");
        AddParameter(command, "id", resumeId);
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result as string;
    }

    // Scalar (non-jsonb) whitelisted fields are all text columns (name/template/careerField) — pass the JSON
    // string value straight through; a truthy non-string here fails the same way ResumeCreate's coercion does
    // (Prisma-style String-column reject), acceptable because PUT's whitelist only ever names String/jsonb columns.
    private static object GetScalar(JsonElement value) =>
        value.ValueKind == JsonValueKind.String ? value.GetString()! : value.GetRawText();

    private static ResumeRow MapResume(DbDataReader reader) => new(
        Id: reader.GetString(0),
        UserId: reader.GetString(1),
        Name: reader.GetString(2),
        Template: reader.GetString(3),
        CareerField: reader.GetString(4),
        PersonalInfo: ParseJson(reader.GetString(5)),
        Experience: ParseJson(reader.GetString(6)),
        Education: ParseJson(reader.GetString(7)),
        Skills: ParseJson(reader.GetString(8)),
        Sections: ParseJson(reader.GetString(9)),
        FieldVisibility: ParseJson(reader.GetString(10)),
        CustomFields: ParseJson(reader.GetString(11)),
        DocumentEdits: ParseJson(reader.GetString(12)),
        OriginalFileKey: reader.IsDBNull(13) ? null : reader.GetString(13),
        OriginalFileType: reader.IsDBNull(14) ? null : reader.GetString(14),
        OriginalPdfKey: reader.IsDBNull(15) ? null : reader.GetString(15),
        HasOriginal: reader.GetBoolean(16),
        IsActive: reader.GetBoolean(17),
        CreatedBy: reader.IsDBNull(18) ? null : reader.GetString(18),
        CreatedDate: IsoZ(reader.GetDateTime(19)),
        UpdatedBy: reader.IsDBNull(20) ? null : reader.GetString(20),
        UpdatedAt: IsoZ(reader.GetDateTime(21)));

    private static JsonElement ParseJson(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    // Kind=Unspecified + ms-truncated (the timestamp-no-tz write rule).
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
