using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Write-owner for the authed vocational score recompute (legacy recomputeVocationalResult,
/// vocational360Service.ts). Loads the active instrument + dimensions + questions + completed rater
/// responses, runs the shipped FM-028 <see cref="VocationalScoring"/> engine, and — only when the outcome
/// is ready — UPSERTs vocational_results on its (evaluatedUserId, instrumentVersion) unique key (idempotent
/// recompute; no TOCTOU pre-check needed). Composite is bound as a numeric value; dimensionScores / rankings
/// / weightsApplied are serialized as camelCase jsonb (the Node reader echoes the inner keys verbatim to the
/// frontend). Reuses the FM-029/031 write rail. Ownership is at the endpoint (canAccessUser).
/// </summary>
public sealed class VocationalWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<VocationalWriter> logger) : IVocationalWriter
{
    // camelCase jsonb (the stored dimension_scores/rankings/weights_applied keys the frontend reads).
    private static readonly JsonSerializerOptions JsonbOptions = new(JsonSerializerDefaults.Web);

    public async Task<VocationalRecomputeOutcome> RecomputeScoreAsync(
        RequestContext context,
        string evaluatedUserId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // 1. Active instrument (legacy findFirst status='active' && isActive). None → never_computed (no write).
        string instrumentId, version, groupWeightsJson, bandsJson;
        await using (var command = Command(session, """
            SELECT "id", "version", "groupWeights"::text, "interpretationBands"::text
            FROM "vocational_instruments" WHERE "status" = 'active' AND "isActive" = true
            LIMIT 1
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return new VocationalRecomputeOutcome(VocationalRecomputeStatus.NeverComputed, null, null);
            }

            instrumentId = reader.GetString(0);
            version = reader.GetString(1);
            groupWeightsJson = reader.IsDBNull(2) ? "{}" : reader.GetString(2);
            bandsJson = reader.IsDBNull(3) ? "{}" : reader.GetString(3);
        }

        // 2. Dimensions (active, ordered).
        var dimensions = new List<ScoringDimension>();
        await using (var command = Command(session, """
            SELECT "key", "nameEs", "weight"::text FROM "vocational_dimensions"
            WHERE "instrumentId" = @instrumentId AND "isActive" = true
            ORDER BY "order" ASC
            """))
        {
            AddParameter(command, "instrumentId", instrumentId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                dimensions.Add(new ScoringDimension(
                    reader.GetString(0), reader.GetString(1), ParseDouble(reader.GetString(2))));
            }
        }

        // 3. Questions (active) — only number/type/scoringRule feed scoring.
        var questions = new List<ScoringQuestion>();
        await using (var command = Command(session, """
            SELECT "number", "type", "scoringRule"::text FROM "vocational_questions" WHERE "isActive" = true
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                questions.Add(new ScoringQuestion(
                    reader.GetInt32(0), reader.GetString(1),
                    reader.IsDBNull(2) ? null : ParseScoringRule(reader.GetString(2))));
            }
        }

        // 4. Completed vocational rater groups + their responses. Each evaluation_group is one ScoringGroup
        // (two 'teacher' groups stay two groups). TS relies on arbitrary DB order; we order deterministically
        // (createdDate, id / questionNumber) — a stable superset of the legacy non-deterministic ordering.
        var groups = await LoadGroupsAsync(session, evaluatedUserId, cancellationToken);

        var config = new ScoringConfig(version, ParseGroupWeights(groupWeightsJson), ParseBands(bandsJson), dimensions);
        var outcome = VocationalScoring.ComputeVocationalResult(config, questions, groups);

        if (outcome is not VocationalResultPayload payload)
        {
            // NotReady (needs_self_plus_one) — nothing persisted, matching legacy.
            var reason = outcome is VocationalNotReady nr ? nr.Reason : "not_ready";
            return new VocationalRecomputeOutcome(VocationalRecomputeStatus.NotReady, null, reason);
        }

        // Persist (legacy prisma.vocationalResult.upsert on @@unique([evaluatedUserId, instrumentVersion])).
        var now = Now();
        await using (var command = Command(session, """
            INSERT INTO "vocational_results"
                ("id", "evaluatedUserId", "instrumentVersion", "composite", "band", "respondentCount",
                 "groupsIncluded", "dimensionScores", "rankings", "weightsApplied", "computedAt")
            VALUES (@id, @uid, @version, @composite, @band, @respondentCount,
                    @groupsIncluded, @dimensionScores::jsonb, @rankings::jsonb, @weightsApplied::jsonb, @computedAt)
            ON CONFLICT ("evaluatedUserId", "instrumentVersion") DO UPDATE SET
                "composite" = EXCLUDED."composite",
                "band" = EXCLUDED."band",
                "respondentCount" = EXCLUDED."respondentCount",
                "groupsIncluded" = EXCLUDED."groupsIncluded",
                "dimensionScores" = EXCLUDED."dimensionScores",
                "rankings" = EXCLUDED."rankings",
                "weightsApplied" = EXCLUDED."weightsApplied",
                "computedAt" = EXCLUDED."computedAt"
            """))
        {
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "uid", evaluatedUserId);
            AddParameter(command, "version", payload.InstrumentVersion);
            AddParameter(command, "composite", (decimal)payload.Composite);
            AddParameter(command, "band", payload.Band);
            AddParameter(command, "respondentCount", payload.RespondentCount);
            AddParameter(command, "groupsIncluded", payload.GroupsIncluded.ToArray());
            AddParameter(command, "dimensionScores", JsonSerializer.Serialize(payload.DimensionScores, JsonbOptions));
            AddParameter(command, "rankings", JsonSerializer.Serialize(payload.Rankings, JsonbOptions));
            AddParameter(command, "weightsApplied", JsonSerializer.Serialize(payload.WeightsApplied, JsonbOptions));
            AddTimestamp(command, "computedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation(
            "audit.assessment.vocational.recomputed evaluatedUserId={SubjectUserId} actorUserId={ActorUserId} instrumentVersion={Version} composite={Composite} band={Band}",
            evaluatedUserId, context.Tenant?.UserId, payload.InstrumentVersion, payload.Composite, payload.Band);

        return new VocationalRecomputeOutcome(VocationalRecomputeStatus.Ready, payload, null);
    }

    private static async Task<List<ScoringGroup>> LoadGroupsAsync(
        FormMapsDatabaseSession session, string evaluatedUserId, CancellationToken cancellationToken)
    {
        var byGroup = new List<(string Id, string GroupType, List<ScoringResponse> Responses)>();
        var index = new Dictionary<string, List<ScoringResponse>>(StringComparer.Ordinal);
        await using var command = Command(session, """
            SELECT eg."id", eg."groupType", vr."questionNumber", vr."type", vr."dimensionKey",
                   vr."ratingValue", vr."rankingOrder"::text, vr."selectedValues"::text, vr."textValue"
            FROM "evaluation_groups" eg
            JOIN "vocational_responses" vr ON vr."evaluationGroupId" = eg."id" AND vr."isActive" = true
            WHERE eg."evaluatedUserId" = @uid AND eg."instrument" = 'vocational'
              AND eg."isEvaluationCompleted" = true AND eg."isActive" = true
            ORDER BY eg."createdDate" ASC, eg."id" ASC, vr."questionNumber" ASC
            """);
        AddParameter(command, "uid", evaluatedUserId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var groupId = reader.GetString(0);
            var groupType = reader.GetString(1);
            // Only the four canonical rater groups are scored (legacy filter on VOCATIONAL_GROUPS).
            if (!VocationalScoring.Groups.Contains(groupType))
            {
                continue;
            }

            if (!index.TryGetValue(groupId, out var responses))
            {
                responses = [];
                index[groupId] = responses;
                byGroup.Add((groupId, groupType, responses));
            }

            responses.Add(new ScoringResponse(
                QuestionNumber: reader.GetInt32(2),
                Type: reader.GetString(3),
                DimensionKey: reader.IsDBNull(4) ? null : reader.GetString(4),
                RatingValue: reader.IsDBNull(5) ? null : reader.GetInt32(5),
                RankingOrder: reader.IsDBNull(6) ? null : ParseRankingOrder(reader.GetString(6)),
                SelectedValues: reader.IsDBNull(7) ? null : ParseStringArray(reader.GetString(7)),
                TextValue: reader.IsDBNull(8) ? null : reader.GetString(8)));
        }

        return byGroup.Select(g => new ScoringGroup(g.GroupType, g.Responses)).ToList();
    }

    // ---- jsonb parsers (mirror the legacy service's defensive readers) ----

    // asNumberRecord over VOCATIONAL_GROUPS: value when a JSON number, else 0.
    private static IReadOnlyDictionary<string, double> ParseGroupWeights(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var outp = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var g in VocationalScoring.Groups)
        {
            outp[g] = root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty(g, out var v) && v.ValueKind == JsonValueKind.Number
                ? v.GetDouble()
                : 0;
        }

        return outp;
    }

    // asBands: strong/moderateHigh/medium when JSON numbers, else defaults 80/60/40.
    private static ScoringBands ParseBands(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        return new ScoringBands(NumberOr(root, "strong", 80), NumberOr(root, "moderateHigh", 60), NumberOr(root, "medium", 40));
    }

    private static ScoringRule? ParseScoringRule(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var kind = root.TryGetProperty("kind", out var k) && k.ValueKind == JsonValueKind.String ? k.GetString()! : string.Empty;
        return new ScoringRule(kind, NumberOrNull(root, "topPoints"), NumberOrNull(root, "n"), NumberOrNull(root, "pointsEach"));
    }

    private static IReadOnlyList<RankingEntry>? ParseRankingOrder(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return null; // legacy: Array.isArray(...) ? ... : null
        }

        var entries = new List<RankingEntry>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var value = el.TryGetProperty("value", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : string.Empty;
            var rank = el.TryGetProperty("rank", out var r) && r.ValueKind == JsonValueKind.Number && r.TryGetInt32(out var ri) ? ri : 0;
            entries.Add(new RankingEntry(value, rank));
        }

        return entries;
    }

    private static IReadOnlyList<string>? ParseStringArray(string json)
    {
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var values = new List<string>();
        foreach (var el in doc.RootElement.EnumerateArray())
        {
            if (el.ValueKind == JsonValueKind.String)
            {
                values.Add(el.GetString()!);
            }
        }

        return values;
    }

    private static double NumberOr(JsonElement root, string name, double fallback) =>
        root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number
            ? v.GetDouble()
            : fallback;

    private static double? NumberOrNull(JsonElement root, string name) =>
        root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    private static double ParseDouble(string s) => double.Parse(s, CultureInfo.InvariantCulture);

    // ---- write-rail helpers (identical to PcaExamWriter / PersonalitySessionWriter) ----

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

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
