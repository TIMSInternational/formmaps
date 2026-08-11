using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Audit;
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
    IVocationalReader vocationalReader,
    ICompleteProfileAssembler profileAssembler,
    IAuditEventWriter auditEventWriter,
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

        // Same position as the log line, and for the same reason it sits there: below the "no active
        // instrument" and "not ready" early returns, and below the commit. Both of those paths persist
        // nothing, so an event above them would record a score that does not exist.
        await WriteAuditAsync(
            "audit.assessment.vocational.recomputed",
            "vocational_result",
            evaluatedUserId,
            context.Tenant?.UserId,
            new Dictionary<string, object?>
            {
                ["instrumentVersion"] = payload.InstrumentVersion,
                ["composite"] = payload.Composite,
                ["band"] = payload.Band,
            });

        return new VocationalRecomputeOutcome(VocationalRecomputeStatus.Ready, payload, null);
    }

    public async Task<IntegrationOutcome?> RecomputeIntegratedAsync(
        RequestContext context,
        string evaluatedUserId,
        CancellationToken cancellationToken = default)
    {
        // 1. Active instrument (version + integration weights + interpretation bands). None → never_computed.
        string version, integrationWeightsJson, bandsJson;
        await using (var readSession = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken))
        await using (var command = Command(readSession, """
            SELECT "version", "integrationWeights"::text, "interpretationBands"::text
            FROM "vocational_instruments" WHERE "status" = 'active' AND "isActive" = true
            LIMIT 1
            """))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            version = reader.GetString(0);
            integrationWeightsJson = reader.IsDBNull(1) ? "{}" : reader.GetString(1);
            bandsJson = reader.IsDBNull(2) ? "{}" : reader.GetString(2);
        }

        // 2. The three integration channels (legacy loadIntegrationInputs), each via a shipped read:
        //    360 = the persisted vocational composite (FM-033); pca/mil = derived from the FM-035 profile.
        var score = await vocationalReader.GetScoreAsync(context, evaluatedUserId, cancellationToken);
        var profile = await profileAssembler.AssembleAsync(context, evaluatedUserId, cancellationToken);

        var competences = (profile.Pca.Competences ?? [])
            .Select(c => new Competence(c.Name, c.Level))
            .ToList();
        var inputs = new IntegrationInputs(
            ThreeSixty: score?.Composite,
            PcaScore: VocationalIntegration.CompetencesToScore(competences),
            MilScore: profile.Completeness.Lia ? VocationalIntegration.MilToScore(ToMilDomains(profile.Lia.Mil)) : null);
        var config = new IntegrationConfig(version, ParseIntegrationWeights(integrationWeightsJson), ParseBands(bandsJson));

        var outcome = VocationalIntegration.ComputeIntegratedResult(config, inputs);
        if (outcome is not IntegratedResultPayload payload)
        {
            // NotReady (a channel is missing) — nothing persisted, matching legacy.
            return outcome;
        }

        // Persist (legacy prisma.vocationalIntegratedResult.upsert on @@unique([evaluatedUserId, instrumentVersion])).
        var now = Now();
        await using var writeSession = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using (var command = Command(writeSession, """
            INSERT INTO "vocational_integrated_results"
                ("id", "evaluatedUserId", "instrumentVersion", "integratedComposite", "band",
                 "threeSixtyScore", "pcaScore", "milScore", "weightsApplied", "computedAt")
            VALUES (@id, @uid, @version, @integratedComposite, @band,
                    @threeSixtyScore, @pcaScore, @milScore, @weightsApplied::jsonb, @computedAt)
            ON CONFLICT ("evaluatedUserId", "instrumentVersion") DO UPDATE SET
                "integratedComposite" = EXCLUDED."integratedComposite",
                "band" = EXCLUDED."band",
                "threeSixtyScore" = EXCLUDED."threeSixtyScore",
                "pcaScore" = EXCLUDED."pcaScore",
                "milScore" = EXCLUDED."milScore",
                "weightsApplied" = EXCLUDED."weightsApplied",
                "computedAt" = EXCLUDED."computedAt"
            """))
        {
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "uid", evaluatedUserId);
            AddParameter(command, "version", payload.InstrumentVersion);
            AddParameter(command, "integratedComposite", (decimal)payload.IntegratedComposite);
            AddParameter(command, "band", payload.Band);
            AddParameter(command, "threeSixtyScore", (decimal)payload.ThreeSixtyScore);
            AddParameter(command, "pcaScore", (decimal)payload.PcaScore);
            AddParameter(command, "milScore", (decimal)payload.MilScore);
            AddParameter(command, "weightsApplied", JsonSerializer.Serialize(payload.WeightsApplied, JsonbOptions));
            AddTimestamp(command, "computedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await writeSession.CommitAsync(cancellationToken);
        logger.LogInformation(
            "audit.assessment.vocational.integrated_recomputed evaluatedUserId={SubjectUserId} actorUserId={ActorUserId} instrumentVersion={Version} integratedComposite={Composite} band={Band}",
            evaluatedUserId, context.Tenant?.UserId, payload.InstrumentVersion, payload.IntegratedComposite, payload.Band);

        // Below the "no active instrument" null return, below the not-ready return (a missing 360/pca/mil
        // channel persists nothing — the ordinary state for most students), and below the commit. A
        // DISTINCT subjectType from the score half: the two recomputes write two different tables and are
        // triggered independently, so collapsing them onto one subject would make an integrated result
        // indistinguishable from a 360 composite in the trail.
        await WriteAuditAsync(
            "audit.assessment.vocational.integrated_recomputed",
            "vocational_integrated_result",
            evaluatedUserId,
            context.Tenant?.UserId,
            new Dictionary<string, object?>
            {
                ["instrumentVersion"] = payload.InstrumentVersion,
                ["integratedComposite"] = payload.IntegratedComposite,
                ["band"] = payload.Band,
            });

        return payload;
    }

    // -------------------------------------------------------------------- audit

    /// <summary>
    /// The durable half of this class's audit (formmaps#52 Task 12). Called immediately after each existing
    /// <c>audit.assessment.vocational.*</c> log line, and — like that line — only ever AFTER the recompute's
    /// own commit has succeeded, and therefore only on the paths that actually persisted a result. The
    /// never_computed and not_ready paths return before this point and leave no row: an audit event here has
    /// to mean "a score was written", not "a recompute was attempted", because the latter is the ordinary
    /// state of every 360 that is still collecting raters.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The subject is the EVALUATED USER, not the result row's id: <c>vocational_results</c> /
    /// <c>vocational_integrated_results</c> are upserted on (evaluatedUserId, instrumentVersion) and a fresh
    /// <c>Guid</c> is generated for every INSERT attempt, so the row id is not a stable handle on anything.
    /// The pair that IS stable is carried as subject + <c>instrumentVersion</c> metadata, which is what lets
    /// a compliance reader reconcile the event against a stored result.
    /// </para>
    /// <para>
    /// The actor is <c>context.Tenant?.UserId</c> — the caller — not the evaluated user, matching the
    /// existing log line's <c>{ActorUserId}</c> binding. A counselor recomputing a student's score is the
    /// normal case, and attributing that write to the student would make the trail exonerate whoever
    /// actually triggered it. On the rater-submission path (<c>VocationalTakeService</c>) this runs under
    /// <see cref="RequestContext.System()" /> and the actor is null — the honest answer, since no human
    /// asked for that recompute. <c>ActorRole</c>/<c>SchoolId</c> stay null, keeping the durable row
    /// congruent with the log line rather than reaching into the <see cref="RequestContext" /> for fields
    /// this domain has never audited.
    /// </para>
    /// <para>
    /// Metadata is a version string, one score and one band — never a dimension breakdown, a ranking, or a
    /// free-text response. <c>audit_events</c> is append-only and retained indefinitely; the substance of a
    /// 360 evaluation has no business there.
    /// </para>
    /// <para>
    /// <see cref="CancellationToken.None" /> is passed deliberately, per
    /// <see cref="IAuditEventWriter.WriteAsync" />'s contract: this runs after the caller's commit, and
    /// <c>AuditEventWriter</c> re-throws <see cref="OperationCanceledException" /> rather than swallowing
    /// it — so passing the request token would let a client disconnecting in the gap between commit and
    /// audit raise from a recompute that had already been stored. Every other failure is fail-soft-but-alert
    /// inside the writer, so this call cannot change what the caller sees.
    /// </para>
    /// </remarks>
    private Task WriteAuditAsync(
        string eventType,
        string subjectType,
        string evaluatedUserId,
        string? actorUserId,
        IReadOnlyDictionary<string, object?> metadata) =>
        auditEventWriter.WriteAsync(
            new AuditEvent(
                EventType: eventType,
                ActorUserId: actorUserId,
                ActorRole: null,
                SchoolId: null,
                SubjectType: subjectType,
                SubjectId: evaluatedUserId,
                Metadata: metadata),
            CancellationToken.None);

    // profile.lia.mil (keyed by domain) → the five-field MilDomains the integration engine consumes.
    private static MilDomains ToMilDomains(IReadOnlyDictionary<string, int> mil) => new(
        mil["milReasoning"], mil["milDetection"], mil["milNumeric"], mil["milMemory"], mil["milOrientation"]);

    // asIntegrationWeights: threeSixty/pca/mil when JSON numbers, else 0 (legacy default; renormalized later).
    private static IntegrationWeights ParseIntegrationWeights(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        return new IntegrationWeights(NumberOr(root, "threeSixty", 0), NumberOr(root, "pca", 0), NumberOr(root, "mil", 0));
    }

    private static async Task<List<ScoringGroup>> LoadGroupsAsync(
        FormMapsDatabaseSession session, string evaluatedUserId, CancellationToken cancellationToken)
    {
        var byGroup = new List<(string Id, string GroupType, List<ScoringResponse> Responses)>();
        var index = new Dictionary<string, List<ScoringResponse>>(StringComparer.Ordinal);
        // LEFT JOIN (isActive predicate in the ON clause): legacy uses a Prisma `include`, which returns a
        // completed group EVEN when it has zero active responses — such a group must still count as a present
        // rater (respondentCount / hasSelf gating / weight renorm), which an inner join would silently drop.
        // Each evaluation_group is its own ScoringGroup (two 'teacher' groups stay two groups). TS has no
        // orderBy (DB-arbitrary); we order deterministically (createdDate, id / questionNumber) — a stable
        // superset of the legacy non-deterministic order (only affects ranking tie / duplicate-group-key order,
        // where TS is itself non-deterministic, so no byte-match exists).
        await using var command = Command(session, """
            SELECT eg."id", eg."groupType", vr."id", vr."questionNumber", vr."type", vr."dimensionKey",
                   vr."ratingValue", vr."rankingOrder"::text, vr."selectedValues"::text, vr."textValue"
            FROM "evaluation_groups" eg
            LEFT JOIN "vocational_responses" vr ON vr."evaluationGroupId" = eg."id" AND vr."isActive" = true
            WHERE eg."evaluatedUserId" = @uid AND eg."instrument" = 'vocational'
              AND eg."isEvaluationCompleted" = true AND eg."isActive" = true
            ORDER BY eg."createdDate" ASC, eg."id" ASC, vr."questionNumber" ASC NULLS FIRST
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

            // A LEFT-JOIN row with a null vr id = a completed group with no active responses: register the
            // group (above) but add no response.
            if (reader.IsDBNull(2))
            {
                continue;
            }

            responses.Add(new ScoringResponse(
                QuestionNumber: reader.GetInt32(3),
                Type: reader.GetString(4),
                DimensionKey: reader.IsDBNull(5) ? null : reader.GetString(5),
                RatingValue: reader.IsDBNull(6) ? null : reader.GetInt32(6),
                RankingOrder: reader.IsDBNull(7) ? null : ParseRankingOrder(reader.GetString(7)),
                SelectedValues: reader.IsDBNull(8) ? null : ParseStringArray(reader.GetString(8)),
                TextValue: reader.IsDBNull(9) ? null : reader.GetString(9)));
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
