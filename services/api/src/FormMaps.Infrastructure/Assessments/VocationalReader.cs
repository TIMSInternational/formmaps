using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reads the persisted vocational result tables (legacy getVocationalResult / getIntegratedResult,
/// vocational360Service.ts) under the caller's read-only RLS session. Resolves the active instrument
/// version, then the row on (evaluatedUserId, instrumentVersion); null when either is absent
/// (never_computed). Decimal columns are read as JSON numbers (::double precision, matching Number(Decimal));
/// the jsonb payloads pass through verbatim (camelCase inner keys); computedAt is emitted as ISO-Z.
/// </summary>
public sealed class VocationalReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IVocationalReader
{
    public async Task<VocationalScoreRead?> GetScoreAsync(
        RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var version = await ActiveInstrumentVersionAsync(session, cancellationToken);
        if (version is null)
        {
            return null;
        }

        await using var command = Command(session, """
            SELECT "composite"::double precision AS "composite", "band", "respondentCount", "groupsIncluded",
                   "dimensionScores"::text AS "dimensionScores", "rankings"::text AS "rankings",
                   "weightsApplied"::text AS "weightsApplied", "computedAt"
            FROM "vocational_results"
            WHERE "evaluatedUserId" = @uid AND "instrumentVersion" = @version
            """);
        AddParameter(command, "uid", evaluatedUserId);
        AddParameter(command, "version", version);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new VocationalScoreRead(
            EvaluatedUserId: evaluatedUserId,
            InstrumentVersion: version,
            Composite: reader.GetDouble(0),
            Band: reader.GetString(1),
            RespondentCount: reader.GetInt32(2),
            GroupsIncluded: reader.GetFieldValue<string[]>(3),
            DimensionScores: ReadJson(reader, 4),
            Rankings: ReadJson(reader, 5),
            WeightsApplied: ReadJson(reader, 6),
            ComputedAt: IsoZ(reader.GetDateTime(7)));
    }

    public async Task<VocationalIntegratedRead?> GetIntegratedAsync(
        RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var version = await ActiveInstrumentVersionAsync(session, cancellationToken);
        if (version is null)
        {
            return null;
        }

        await using var command = Command(session, """
            SELECT "integratedComposite"::double precision AS "integratedComposite", "band",
                   "threeSixtyScore"::double precision AS "threeSixtyScore",
                   "pcaScore"::double precision AS "pcaScore", "milScore"::double precision AS "milScore",
                   "weightsApplied"::text AS "weightsApplied", "computedAt"
            FROM "vocational_integrated_results"
            WHERE "evaluatedUserId" = @uid AND "instrumentVersion" = @version
            """);
        AddParameter(command, "uid", evaluatedUserId);
        AddParameter(command, "version", version);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new VocationalIntegratedRead(
            EvaluatedUserId: evaluatedUserId,
            InstrumentVersion: version,
            IntegratedComposite: reader.GetDouble(0),
            Band: reader.GetString(1),
            ThreeSixtyScore: reader.GetDouble(2),
            PcaScore: reader.GetDouble(3),
            MilScore: reader.GetDouble(4),
            WeightsApplied: ReadJson(reader, 5),
            ComputedAt: IsoZ(reader.GetDateTime(6)));
    }

    public async Task<InstrumentDto?> GetInstrumentAsync(RequestContext context, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        string instrumentId, version, name;
        JsonElement groupWeights, integrationWeights, interpretationBands;
        await using (var command = Command(session, """
            SELECT "id", "version", "name", "groupWeights"::text AS "groupWeights",
                   "integrationWeights"::text AS "integrationWeights", "interpretationBands"::text AS "interpretationBands"
            FROM "vocational_instruments" WHERE "status" = 'active' AND "isActive" = true LIMIT 1
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            instrumentId = reader.GetString(0);
            version = reader.GetString(1);
            name = reader.GetString(2);
            groupWeights = ReadJson(reader, 3);
            integrationWeights = ReadJson(reader, 4);
            interpretationBands = ReadJson(reader, 5);
        }

        var dimensions = new List<InstrumentDimensionDto>();
        await using (var command = Command(session, """
            SELECT "key", "nameEs", "nameEn", "weight"::double precision AS "weight", "scaleAnchors"::text AS "scaleAnchors", "order"
            FROM "vocational_dimensions" WHERE "instrumentId" = @instrumentId AND "isActive" = true
            ORDER BY "order" ASC
            """))
        {
            AddParameter(command, "instrumentId", instrumentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                dimensions.Add(new InstrumentDimensionDto(
                    Key: reader.GetString(0),
                    NameEs: reader.GetString(1),
                    NameEn: reader.IsDBNull(2) ? null : reader.GetString(2),
                    Weight: reader.GetDouble(3),
                    ScaleAnchors: ReadJson(reader, 4),
                    Order: reader.GetInt32(5)));
            }
        }

        return new InstrumentDto(version, name, groupWeights, integrationWeights, interpretationBands, dimensions);
    }

    public async Task<IReadOnlyList<QuestionnaireItem>> GetQuestionnaireAsync(
        RequestContext context, string group, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var items = new List<QuestionnaireItem>();
        // Active questions for the group (question.group null = all groups), joined to their dimension (key +
        // fallback scaleAnchors) and the group's text variant. (questionId, group) is unique -> ≤1 variant row.
        await using var command = Command(session, """
            SELECT q."number", q."block", q."type", q."area", d."key" AS "dimensionKey",
                   q."scaleAnchors"::text AS "questionScale", d."scaleAnchors"::text AS "dimensionScale",
                   q."options"::text AS "options", v."textEs"
            FROM "vocational_questions" q
            LEFT JOIN "vocational_dimensions" d ON d."id" = q."dimensionId"
            LEFT JOIN "vocational_question_variants" v ON v."questionId" = q."id" AND v."group" = @group AND v."isActive" = true
            WHERE q."isActive" = true AND (q."group" IS NULL OR q."group" = @group)
            ORDER BY q."order" ASC
            """);
        AddParameter(command, "group", group);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new QuestionnaireItem(
                Number: reader.GetInt32(0),
                Block: reader.GetString(1),
                Type: reader.GetString(2),
                Area: reader.IsDBNull(3) ? null : reader.GetString(3),
                DimensionKey: reader.IsDBNull(4) ? null : reader.GetString(4),
                // legacy: q.scaleAnchors ?? q.dimension?.scaleAnchors ?? null (skips SQL-null AND jsonb 'null').
                ScaleAnchors: FirstNonNullJson(
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.IsDBNull(6) ? null : reader.GetString(6)),
                Options: ReadJson(reader, 7),
                Text: reader.IsDBNull(8) ? string.Empty : reader.GetString(8)));
        }

        return items;
    }

    // JS `a ?? b ?? null`: the first jsonb text whose value is not null (SQL-null OR jsonb 'null' are skipped).
    private static JsonElement FirstNonNullJson(string? first, string? second)
    {
        foreach (var raw in new[] { first, second })
        {
            if (raw is null)
            {
                continue;
            }

            using var document = JsonDocument.Parse(raw);
            if (document.RootElement.ValueKind != JsonValueKind.Null)
            {
                return document.RootElement.Clone();
            }
        }

        using var nullDocument = JsonDocument.Parse("null");
        return nullDocument.RootElement.Clone();
    }

    private static async Task<string?> ActiveInstrumentVersionAsync(FormMapsDatabaseSession session, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            SELECT "version" FROM "vocational_instruments" WHERE "status" = 'active' AND "isActive" = true LIMIT 1
            """);
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value as string;
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

    // jsonb-as-text -> JsonElement (verbatim passthrough; SQL NULL surfaces as a JSON-null element).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    // timestamp(3) (no tz) -> ISO-Z string (Node toISOString), matching the sibling result readers.
    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
