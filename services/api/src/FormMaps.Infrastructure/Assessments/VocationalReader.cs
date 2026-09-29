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
        string? nameEn;
        JsonElement groupWeights, integrationWeights, interpretationBands;
        await using (var command = Command(session, """
            SELECT "id", "version", "name", "groupWeights"::text AS "groupWeights",
                   "integrationWeights"::text AS "integrationWeights", "interpretationBands"::text AS "interpretationBands",
                   "nameEn"
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
            nameEn = reader.IsDBNull(6) ? null : reader.GetString(6);
        }

        var dimensions = new List<InstrumentDimensionDto>();
        await using (var command = Command(session, """
            SELECT "key", "nameEs", "nameEn", "weight"::double precision AS "weight", "scaleAnchors"::text AS "scaleAnchors", "order",
                   "scaleAnchorsEn"::text AS "scaleAnchorsEn"
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
                    // legacy: a non-array (NULL / jsonb 'null' / malformed) English set surfaces as JSON null.
                    ScaleAnchorsEn: AnchorArrayOrNull(ReadJson(reader, 6)),
                    Order: reader.GetInt32(5)));
            }
        }

        return new InstrumentDto(version, name, groupWeights, integrationWeights, interpretationBands, dimensions, nameEn);
    }

    public async Task<IReadOnlyList<QuestionnaireItem>> GetQuestionnaireAsync(
        RequestContext context, string group, string lang = VocationalLanguage.Spanish, CancellationToken cancellationToken = default)
    {
        lang = VocationalLanguage.Normalize(lang);
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var items = new List<QuestionnaireItem>();
        // Active questions for the group (question.group null = all groups), joined to their dimension (key +
        // fallback scaleAnchors) and the group's text variant. (questionId, group) is unique -> ≤1 variant row.
        // The English columns ride along; VocationalLanguage resolves text/anchors/option labels per field.
        await using var command = Command(session, """
            SELECT q."number", q."block", q."type", q."area", d."key" AS "dimensionKey",
                   q."scaleAnchors"::text AS "questionScale", d."scaleAnchors"::text AS "dimensionScale",
                   q."options"::text AS "options", v."textEs",
                   v."textEn", q."scaleAnchorsEn"::text AS "questionScaleEn", d."scaleAnchorsEn"::text AS "dimensionScaleEn"
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
                // legacy: q.scaleAnchors ?? q.dimension?.scaleAnchors ?? null (skips SQL-null AND jsonb 'null'),
                // with English taken from the same level only when it is a complete same-length translation.
                ScaleAnchors: VocationalLanguage.ResolveScaleAnchors(
                    ReadJson(reader, 5), ReadJson(reader, 10), ReadJson(reader, 6), ReadJson(reader, 11), lang),
                Options: VocationalLanguage.ResolveOptions(ReadJson(reader, 7), lang),
                Text: reader.IsDBNull(8)
                    ? string.Empty
                    : VocationalLanguage.ResolveText(reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetString(9), lang)));
        }

        return items;
    }

    // legacy getInstrument: `isAnchorArray(d.scaleAnchorsEn) ? d.scaleAnchorsEn : null` — a non-empty array of
    // strings passes through verbatim; anything else (SQL NULL, jsonb 'null', malformed) is JSON null.
    private static JsonElement AnchorArrayOrNull(JsonElement element)
    {
        var isAnchorArray = element.ValueKind == JsonValueKind.Array && element.GetArrayLength() > 0
            && element.EnumerateArray().All(item => item.ValueKind == JsonValueKind.String);
        if (isAnchorArray)
        {
            return element;
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
