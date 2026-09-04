using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-012. Reads a persisted CareerFit run back — the careerfit_runs row and every
/// careerfit_family_results row for it — in ONE read-only RLS session opened for the CALLER
/// (<c>OpenReadOnlyAsync</c>), never a bypass session. Every scalar comes from its typed column and the two
/// jsonb documents come back through <see cref="CareerFitRunJson"/>'s own parsers, so a run read here is
/// the same value <c>CareerFitEvaluator</c> returned when it wrote it and <c>CareerFitExplanation.From</c>
/// can project it unchanged.
/// </summary>
/// <remarks>
/// <para>
/// AUTHORIZATION IS NOT HERE, AND THAT IS DELIBERATE. This class asks no question about who the caller is.
/// careerfit_runs carries its own RLS policy (self OR same school OR bypass — infra/aws/sql/careerfit-schema.sql)
/// and careerfit_family_results inherits it through the nested EXISTS, so a run this session may not see
/// simply does not come back and every method answers null / empty. That is the platform's design, and the
/// schema's own header says the rest in one line: the school branch admits EVERY caller in the row's tenant,
/// so the per-user gate (may THIS counselor see THIS student) is the endpoint's job — CareerFitEndpoints
/// runs <c>IUserAccessGuard</c> before it ever calls this reader.
/// </para>
/// <para>
/// "Invisible" and "absent" are the same outcome on purpose: distinguishing them here would hand a caller a
/// way to probe for the existence of a run they cannot read, which is the IDOR-safe-404 rule the surrounding
/// endpoint files already follow.
/// </para>
/// <para>
/// Deliberately NOT here: any INSERT / UPDATE / DELETE (a run is immutable — the service role has SELECT +
/// INSERT only, dotnet-service-role.sql section 4.7, and the INSERT belongs to <c>CareerFitRunWriter</c>),
/// any re-scoring (a run reads back as it was written, under the rules_version stored on it, even when the
/// process has since loaded a newer rule set), and any cross-run aggregation (that is FM-CF-013/014's
/// reporting question, and the schema header says it is the one thing that would justify a steps table).
/// </para>
/// </remarks>
public sealed class CareerFitRunReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICareerFitRunReader
{
    private const string RunColumns = """
        "id", "userId", "schoolId", "rulesVersion", "discGraph", "inputs"::text, "inputQuality"::text, "createdAt"
        """;

    // The careerfit_runs_userId_createdAt_idx read: this student's runs, newest first.
    private static readonly string NewestForUserSql = $"""
        SELECT {RunColumns}
        FROM "careerfit_runs"
        WHERE "userId" = @uid
        ORDER BY "createdAt" DESC
        LIMIT 1
        """;

    private static readonly string RunByIdSql = $"""
        SELECT {RunColumns}
        FROM "careerfit_runs"
        WHERE "id" = @rid
        LIMIT 1
        """;

    // The history index. The top family is read as a correlated sub-select rather than a join so a run
    // written before ranking (rank_position NULL — legal, see the schema) still lists, with a null top.
    private const string ListForUserSql = """
        SELECT r."id", r."createdAt", r."rulesVersion",
               (SELECT f."familyId" FROM "careerfit_family_results" f
                WHERE f."runId" = r."id" AND f."rank_position" = 1 LIMIT 1)
        FROM "careerfit_runs" r
        WHERE r."userId" = @uid
        ORDER BY r."createdAt" DESC
        LIMIT @limit
        """;

    // Rank order (1 = best), which is the order CareerFitRun.Families is documented to be in. NULLS LAST so
    // an unranked family sorts after every ranked one instead of ahead of rank 1.
    private const string FamiliesForRunSql = """
        SELECT "familyId",
               "pca_route_fit", "pca_winning_route", "competency_fit", "competency_gate", "pca_index",
               "mil_fit", "mil_gate", "personality_fit", "personality_winning_route",
               "careerfit360", "careerfit360_consensus", "careerfit360_confidence",
               "final_gate", "convergence_level", "careerfit_absolute", "careerfit_relative", "rank_position",
               "audit"::text
        FROM "careerfit_family_results"
        WHERE "runId" = @rid
        ORDER BY "rank_position" ASC NULLS LAST, "familyId" ASC
        """;

    /// <inheritdoc />
    public async Task<CareerFitRun?> ReadNewestForUserAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await ReadRunAsync(session, NewestForUserSql, "uid", userId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<CareerFitRun?> ReadAsync(
        RequestContext context, Guid runId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        return await ReadRunAsync(session, RunByIdSql, "rid", runId, cancellationToken);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<CareerFitRunSummary>> ListForUserAsync(
        RequestContext context, string userId, int limit, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);
        ArgumentOutOfRangeException.ThrowIfLessThan(limit, 1);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, ListForUserSql);
        AddParameter(command, "uid", userId);
        AddParameter(command, "limit", limit, DbType.Int32);

        var summaries = new List<CareerFitRunSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            summaries.Add(new CareerFitRunSummary(
                RunId: reader.GetGuid(0),
                EvaluatedAt: Utc(reader.GetDateTime(1)),
                RulesVersion: reader.GetString(2),
                TopFamilyId: reader.IsDBNull(3) ? null : reader.GetInt16(3)));
        }

        return summaries;
    }

    // One run row plus its family rows, on one session. Two round trips rather than a join: the run's two
    // jsonb documents would otherwise be repeated on all fourteen family rows.
    private static async Task<CareerFitRun?> ReadRunAsync(
        FormMapsDatabaseSession session, string sql, string parameterName, object parameterValue, CancellationToken cancellationToken)
    {
        Guid runId;
        string userId;
        string? schoolId;
        string rulesVersion;
        DiscGraphChoice discGraph;
        CareerFitAssessment inputs;
        InputQuality quality;
        CareerFitInputSources sources;
        DateTimeOffset createdAt;

        await using (var command = Command(session, sql))
        {
            AddParameter(command, parameterName, parameterValue);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            runId = reader.GetGuid(0);
            userId = reader.GetString(1);
            schoolId = reader.IsDBNull(2) ? null : reader.GetString(2);
            rulesVersion = reader.GetString(3);

            // "discGraph" is nullable in the schema (FM-CF-005 left it so until the graph question closed).
            // Every run this engine writes carries one; a legacy NULL reads as the adapters' default rather
            // than as a fabricated graph 0, which is not a DiscGraphChoice member at all.
            discGraph = reader.IsDBNull(4)
                ? DiscAdapter.DefaultGraph
                : (DiscGraphChoice)reader.GetInt16(4);

            inputs = CareerFitRunJson.ParseInputs(ParseJson(reader.GetString(5)));
            (quality, sources) = CareerFitRunJson.ParseInputQuality(ParseJson(reader.GetString(6)));
            createdAt = Utc(reader.GetDateTime(7));
        }

        var families = await ReadFamiliesAsync(session, runId, cancellationToken);

        return new CareerFitRun(
            Id: runId,
            CreatedAt: createdAt,
            UserId: userId,
            SchoolId: schoolId,
            RulesVersion: rulesVersion,
            DiscGraph: discGraph,
            Inputs: inputs,
            Quality: quality,
            Sources: sources,
            Families: families);
    }

    private static async Task<IReadOnlyList<OwnerEvaluation>> ReadFamiliesAsync(
        FormMapsDatabaseSession session, Guid runId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, FamiliesForRunSql);
        AddParameter(command, "rid", runId);

        var families = new List<OwnerEvaluation>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var audit = CareerFitRunJson.ParseFamilyAudit(ParseJson(reader.GetString(18)));

            families.Add(new OwnerEvaluation(
                OwnerType: ResolvedFamilyRules.FamilyOwnerType,
                OwnerId: reader.GetInt16(0),
                PcaRouteFit: reader.GetDouble(1),
                PcaWinningRoute: reader.GetString(2),
                CompetencyFit: reader.GetDouble(3),
                CompetencyGate: CareerFitEnums.ParseGate(reader.GetString(4)),
                PcaIndex: reader.GetDouble(5),
                MilFit: reader.GetDouble(6),
                MilGate: CareerFitEnums.ParseGate(reader.GetString(7)),
                MilRelativeStrengths: audit.MilRelativeStrengths,
                PersonalityFit: reader.GetDouble(8),
                PersonalityWinningRoute: reader.GetString(9),
                CareerFit360: reader.GetDouble(10),
                CareerFit360Consensus: reader.IsDBNull(11) ? null : reader.GetDouble(11),
                CareerFit360Confidence: CareerFitEnums.ParseConfidence(reader.GetString(12)),
                FinalGate: CareerFitEnums.ParseGate(reader.GetString(13)),
                ConvergenceLevel: CareerFitEnums.ParseConvergence(reader.GetString(14)),
                ConvergenceDetail: audit.ConvergenceDetail,
                CareerFitAbsolute: reader.GetDouble(15),
                CriticalGaps: audit.CriticalGaps,
                AuditInputs: audit.AuditInputs)
            {
                CareerFitRelative = reader.IsDBNull(16) ? null : reader.GetDouble(16),
                RankPosition = reader.IsDBNull(17) ? null : reader.GetInt16(17),
                AuditSteps = audit.FormulaSteps,
            });
        }

        return families;
    }

    // ---------------------------------------------------------------- primitives (the writer's)

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value, DbType? dbType = null)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        if (dbType is DbType explicitType)
        {
            parameter.DbType = explicitType;
        }

        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static JsonElement ParseJson(string raw)
    {
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    // The column is TIMESTAMPTZ; Npgsql hands it back as a DateTime whose Kind the writer already pins to
    // UTC on the INSERT path, so the read path spells the same conversion rather than a second convention.
    private static DateTimeOffset Utc(DateTime value) =>
        new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
}
