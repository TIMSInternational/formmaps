using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-010. Persists one <see cref="CareerFitEvaluation"/> as one careerfit_runs row plus one
/// careerfit_family_results row per family, in ONE transaction on the caller's writable RLS session
/// (<c>OpenWritableAsync</c>), and returns the id / createdAt the database assigned. The column set is
/// <c>infra/aws/sql/careerfit-schema.sql</c>'s exactly: every evaluate_owner scalar under its reference
/// name, the enum columns through <c>CareerFitEnums.ToReferenceValue()</c> (the strings the CHECK
/// constraints admit), the jsonb columns through <see cref="CareerFitRunJson"/>.
/// </summary>
/// <remarks>
/// <para>
/// ATOMIC OR NOTHING. The run row and its families share the transaction; a rejected family row (a
/// WITH CHECK the caller's session does not satisfy, a CHECK constraint, a duplicate family) rolls the run
/// row back with it — <see cref="FormMapsDatabaseSession.DisposeAsync"/> disposes an uncommitted transaction.
/// The policy's WITH CHECK is what scopes the write: the run's "schoolId" is the STUDENT's tenant
/// (<see cref="CareerFitEvaluation.SchoolId"/>), which for every admitted non-bypass caller equals the
/// caller's own school (the source rows were only visible because it does) and for a bypass caller is the
/// only correct value — a super-admin request has no tenant of its own.
/// </para>
/// <para>
/// No UPDATE, no DELETE, no upsert: a run is immutable evidence and a re-evaluation is a new run (the
/// service role has SELECT + INSERT only — dotnet-service-role.sql section 4.7). No audit_events row is
/// emitted here; whether an evaluation is an auditable user action is the endpoint's call (FM-CF-012).
/// </para>
/// </remarks>
public sealed class CareerFitRunWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICareerFitRunWriter
{
    private const string InsertRunSql = """
        INSERT INTO "careerfit_runs" ("userId", "schoolId", "rulesVersion", "discGraph", "inputs", "inputQuality")
        VALUES (@userId, @schoolId, @rulesVersion, @discGraph, @inputs::jsonb, @inputQuality::jsonb)
        RETURNING "id", "createdAt"
        """;

    private const string InsertFamilySql = """
        INSERT INTO "careerfit_family_results" (
            "runId", "familyId",
            "pca_route_fit", "pca_winning_route", "competency_fit", "competency_gate", "pca_index",
            "mil_fit", "mil_gate", "personality_fit", "personality_winning_route",
            "careerfit360", "careerfit360_consensus", "careerfit360_confidence",
            "final_gate", "convergence_level", "careerfit_absolute", "careerfit_relative", "rank_position",
            "audit")
        VALUES (
            @runId, @familyId,
            @pcaRouteFit, @pcaWinningRoute, @competencyFit, @competencyGate, @pcaIndex,
            @milFit, @milGate, @personalityFit, @personalityWinningRoute,
            @careerfit360, @careerfit360Consensus, @careerfit360Confidence,
            @finalGate, @convergenceLevel, @careerfitAbsolute, @careerfitRelative, @rankPosition,
            @audit::jsonb)
        """;

    public async Task<CareerFitRunReceipt> WriteAsync(
        RequestContext context, CareerFitEvaluation evaluation, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(evaluation);
        if (evaluation.Families.Count == 0)
        {
            throw new ArgumentException("An evaluation must carry at least one family result.", nameof(evaluation));
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var receipt = await InsertRunAsync(session, evaluation, cancellationToken);
        await InsertFamiliesAsync(session, receipt.RunId, evaluation.Families, cancellationToken);

        await session.CommitAsync(cancellationToken);
        return receipt;
    }

    private static async Task<CareerFitRunReceipt> InsertRunAsync(
        FormMapsDatabaseSession session, CareerFitEvaluation evaluation, CancellationToken cancellationToken)
    {
        await using var command = Command(session, InsertRunSql);
        AddParameter(command, "userId", evaluation.UserId);
        AddParameter(command, "schoolId", (object?)evaluation.SchoolId ?? DBNull.Value);
        AddParameter(command, "rulesVersion", evaluation.RulesVersion);
        AddParameter(command, "discGraph", (short)evaluation.DiscGraph);
        AddParameter(command, "inputs", CareerFitRunJson.SerializeInputs(evaluation.Inputs));
        AddParameter(command, "inputQuality", CareerFitRunJson.SerializeInputQuality(evaluation.Quality, evaluation.Sources));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("INSERT INTO careerfit_runs returned no row.");
        }

        var runId = reader.GetGuid(0);
        var createdAt = new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc));
        return new CareerFitRunReceipt(runId, createdAt);
    }

    private static async Task InsertFamiliesAsync(
        FormMapsDatabaseSession session, Guid runId, IReadOnlyList<OwnerEvaluation> families, CancellationToken cancellationToken)
    {
        // One command, fourteen executions: the parameter set is fixed, only the values change per family.
        await using var command = Command(session, InsertFamilySql);
        var runIdParameter = AddParameter(command, "runId", runId);
        var familyId = AddParameter(command, "familyId", (short)0);
        var pcaRouteFit = AddParameter(command, "pcaRouteFit", 0.0);
        var pcaWinningRoute = AddParameter(command, "pcaWinningRoute", string.Empty);
        var competencyFit = AddParameter(command, "competencyFit", 0.0);
        var competencyGate = AddParameter(command, "competencyGate", string.Empty);
        var pcaIndex = AddParameter(command, "pcaIndex", 0.0);
        var milFit = AddParameter(command, "milFit", 0.0);
        var milGate = AddParameter(command, "milGate", string.Empty);
        var personalityFit = AddParameter(command, "personalityFit", 0.0);
        var personalityWinningRoute = AddParameter(command, "personalityWinningRoute", string.Empty);
        var careerfit360 = AddParameter(command, "careerfit360", 0.0);
        // The three nullable columns carry an explicit DbType: their value flips between NULL and a number
        // across the fourteen executions, and a typed NULL never depends on the driver inferring from a
        // previous execution's CLR type.
        var careerfit360Consensus = AddParameter(command, "careerfit360Consensus", DBNull.Value, DbType.Double);
        var careerfit360Confidence = AddParameter(command, "careerfit360Confidence", string.Empty);
        var finalGate = AddParameter(command, "finalGate", string.Empty);
        var convergenceLevel = AddParameter(command, "convergenceLevel", string.Empty);
        var careerfitAbsolute = AddParameter(command, "careerfitAbsolute", 0.0);
        var careerfitRelative = AddParameter(command, "careerfitRelative", DBNull.Value, DbType.Double);
        var rankPosition = AddParameter(command, "rankPosition", DBNull.Value, DbType.Int16);
        var audit = AddParameter(command, "audit", string.Empty);
        runIdParameter.Value = runId;

        foreach (var family in families)
        {
            familyId.Value = checked((short)family.OwnerId);
            pcaRouteFit.Value = family.PcaRouteFit;
            pcaWinningRoute.Value = family.PcaWinningRoute;
            competencyFit.Value = family.CompetencyFit;
            competencyGate.Value = family.CompetencyGate.ToReferenceValue();
            pcaIndex.Value = family.PcaIndex;
            milFit.Value = family.MilFit;
            milGate.Value = family.MilGate.ToReferenceValue();
            personalityFit.Value = family.PersonalityFit;
            personalityWinningRoute.Value = family.PersonalityWinningRoute;
            careerfit360.Value = family.CareerFit360;
            careerfit360Consensus.Value = (object?)family.CareerFit360Consensus ?? DBNull.Value;
            careerfit360Confidence.Value = family.CareerFit360Confidence.ToReferenceValue();
            finalGate.Value = family.FinalGate.ToReferenceValue();
            convergenceLevel.Value = family.ConvergenceLevel.ToReferenceValue();
            careerfitAbsolute.Value = family.CareerFitAbsolute;
            careerfitRelative.Value = (object?)family.CareerFitRelative ?? DBNull.Value;
            rankPosition.Value = family.RankPosition is int rank ? checked((short)rank) : DBNull.Value;
            audit.Value = CareerFitRunJson.SerializeFamilyAudit(family);

            var affected = await command.ExecuteNonQueryAsync(cancellationToken);
            if (affected != 1)
            {
                throw new InvalidOperationException(
                    $"INSERT INTO careerfit_family_results for family {family.OwnerId} affected {affected} rows.");
            }
        }
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static DbParameter AddParameter(DbCommand command, string name, object value, DbType? dbType = null)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        if (dbType is DbType explicitType)
        {
            parameter.DbType = explicitType;
        }

        parameter.Value = value;
        command.Parameters.Add(parameter);
        return parameter;
    }
}
