using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Resumes;

namespace FormMaps.Infrastructure.Resumes;

/// <summary>
/// Resume section + template writes (FM-DOTNET-089 — routes/resume.ts). Each op runs on ONE writable session:
/// findUnique the resume by id (NO isActive filter), enforce <c>userId == caller</c> in code (resumes has no RLS),
/// then — only after ownership — validate the body and apply the pure <see cref="ResumeSections"/> transform,
/// writing the array back as jsonb (bumping @updatedAt). A missing OR non-owned row short-circuits to NotOwned
/// (→ 404) with no write; body errors are deferred past ownership (the FM-072 convention).
/// </summary>
public sealed class ResumeSectionsRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    TimeProvider timeProvider) : IResumeSectionsRepository
{
    public async Task<ResumeSectionsOutcome> ReorderAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var (found, owned, sectionsJson) = await LoadAsync(session, resumeId, context.Actor!.UserId, cancellationToken);
        if (!found || !owned)
        {
            return ResumeSectionsOutcome.NotOwned;
        }

        if (!ResumeSections.TryReadSectionOrder(body, out var order))
        {
            return ResumeSectionsOutcome.InvalidSectionOrder;
        }

        // Legacy: sectionOrder.map(id => sections.find(...)) — the find (which throws on a corrupt non-array
        // sections) is only evaluated when the order is non-empty; an empty order maps to [] without touching it.
        if (order.Count > 0 && ResumeSections.IsCorruptSections(sectionsJson))
        {
            return ResumeSectionsOutcome.CorruptSections;
        }

        var reordered = ResumeSections.Reorder(sectionsJson, order);
        await WriteSectionsAsync(session, resumeId, reordered, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, SectionsJson: reordered);
    }

    public async Task<ResumeSectionsOutcome> AddAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var (found, owned, sectionsJson) = await LoadAsync(session, resumeId, context.Actor!.UserId, cancellationToken);
        if (!found || !owned)
        {
            return ResumeSectionsOutcome.NotOwned;
        }

        // Legacy sections.push(newSection) throws on a corrupt non-array sections → 500.
        if (ResumeSections.IsCorruptSections(sectionsJson))
        {
            return ResumeSectionsOutcome.CorruptSections;
        }

        var newSection = ResumeSections.BuildSection(body, Guid.NewGuid().ToString());
        var updated = ResumeSections.Append(sectionsJson, newSection);
        await WriteSectionsAsync(session, resumeId, updated, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, NewSectionJson: newSection);
    }

    public async Task<ResumeSectionsOutcome> DeleteAsync(
        RequestContext context, string resumeId, string sectionId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var (found, owned, sectionsJson) = await LoadAsync(session, resumeId, context.Actor!.UserId, cancellationToken);
        if (!found || !owned)
        {
            return ResumeSectionsOutcome.NotOwned;
        }

        // Legacy sections.filter(...) throws on a corrupt non-array sections → 500.
        if (ResumeSections.IsCorruptSections(sectionsJson))
        {
            return ResumeSectionsOutcome.CorruptSections;
        }

        var updated = ResumeSections.Delete(sectionsJson, sectionId);
        await WriteSectionsAsync(session, resumeId, updated, cancellationToken);
        await session.CommitAsync(cancellationToken);
        return new ResumeSectionsOutcome(ResumeSectionsStatus.Ok);
    }

    public async Task<ResumeSectionsOutcome> SetTemplateAsync(
        RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var (found, owned, _) = await LoadAsync(session, resumeId, context.Actor!.UserId, cancellationToken);
        if (!found || !owned)
        {
            return ResumeSectionsOutcome.NotOwned;
        }

        // const { template } = req.body; if (!template) 400. Then Prisma writes it to a String column.
        if (!TryGetProp(body, "template", out var templateNode) || !IsTruthy(templateNode))
        {
            return ResumeSectionsOutcome.TemplateRequired; // falsy/absent → 400
        }

        if (templateNode.ValueKind != JsonValueKind.String)
        {
            return ResumeSectionsOutcome.InvalidTemplateType; // truthy non-string → Prisma reject → 500
        }

        var template = templateNode.GetString()!;
        await using (var command = Command(session, """UPDATE "resumes" SET "template" = @template, "updatedAt" = @now WHERE "id" = @id"""))
        {
            AddParameter(command, "template", template);
            AddTimestamp(command, "now", Now());
            AddParameter(command, "id", resumeId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        return new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, Template: template);
    }

    private async Task WriteSectionsAsync(
        FormMapsDatabaseSession session, string resumeId, string sectionsJson, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """UPDATE "resumes" SET "sections" = @sections::jsonb, "updatedAt" = @now WHERE "id" = @id""");
        AddParameter(command, "sections", sectionsJson);
        AddTimestamp(command, "now", Now());
        AddParameter(command, "id", resumeId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // findUnique(id) with NO isActive filter → (found, owned, sections jsonb as text). owned = userId == caller.
    private static async Task<(bool Found, bool Owned, string? SectionsJson)> LoadAsync(
        FormMapsDatabaseSession session, string resumeId, string callerId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """SELECT "userId", "sections"::text FROM "resumes" WHERE "id" = @id""");
        AddParameter(command, "id", resumeId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (false, false, null);
        }

        var owner = reader.GetString(0);
        var sections = reader.IsDBNull(1) ? null : reader.GetString(1);
        return (true, owner == callerId, sections);
    }

    private static bool TryGetProp(JsonElement body, string name, out JsonElement value)
    {
        value = default;
        return body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out value);
    }

    // JS truthiness for the template gate.
    private static bool IsTruthy(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => false,
        JsonValueKind.Number => value.GetDouble() != 0,
        JsonValueKind.String => value.GetString()?.Length > 0,
        _ => true,
    };

    // Kind=Unspecified + ms-truncated (the timestamp-no-tz write rule).
    private DateTime Now()
    {
        var utc = timeProvider.GetUtcNow().UtcDateTime;
        return new DateTime(utc.Ticks / TimeSpan.TicksPerMillisecond * TimeSpan.TicksPerMillisecond, DateTimeKind.Unspecified);
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
}
