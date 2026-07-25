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
