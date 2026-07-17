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
