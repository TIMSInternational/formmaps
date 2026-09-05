using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-013. Appends one <see cref="CareerFitShadowComparison"/> to
/// <c>careerfit_shadow_comparisons</c> on the caller's writable RLS session
/// (<c>OpenWritableAsync</c>), never a bypass session, and returns the id the database assigned.
/// </summary>
/// <remarks>
/// <para>
/// THE CALLER'S SESSION, NOT A SYSTEM ONE. This is the difference from
/// <c>BillingShadowRepository</c>, which writes under <c>RequestContext.System()</c>: that trio holds
/// Stripe bookkeeping and carries no RLS policy, while a row here holds a named student's two career
/// rankings and carries careerfit_runs' policy verbatim. The WITH CHECK half of that policy is what
/// scopes the write — the row's "schoolId" is the STUDENT's tenant, taken from the run, which for
/// every admitted non-bypass caller equals the caller's own school (the run was only visible because
/// it does) and for a bypass caller is the only correct value.
/// </para>
/// <para>
/// APPEND ONLY. No UPDATE, no DELETE, no upsert, and deliberately no unique key on (userId,
/// comparatorVersion): re-measuring the same student under a corrected projection must produce a
/// SECOND row that can be told apart from the first, not an overwrite of the evidence. The service
/// role holds SELECT + INSERT only (dotnet-service-role.sql section 4.8), so the grant is the lock,
/// not this class's restraint.
/// </para>
/// <para>
/// Deliberately NOT here: any audit_events row (the appended comparison IS the record), any
/// aggregation (tools/careerfit/shadow_report.py, over an export), and any read path — nothing in the
/// product reads this table back, which is why there is no CareerFitShadowReader beside this file.
/// </para>
/// </remarks>
public sealed class CareerFitShadowWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ICareerFitShadowWriter
{
    private const string InsertSql = """
        INSERT INTO "careerfit_shadow_comparisons" (
            "userId", "schoolId", "runId", "rulesVersion", "discGraph",
            "comparatorVersion", "projectionVersion", "comparable", "primaryCause",
            "spearmanRho", "topThreeOverlap",
            "engineRanking", "legacyRanking", "disagreements", "legacyObservedAt")
        VALUES (
            @userId, @schoolId, @runId, @rulesVersion, @discGraph,
            @comparatorVersion, @projectionVersion, @comparable, @primaryCause,
            @spearmanRho, @topThreeOverlap,
            @engineRanking::jsonb, @legacyRanking::jsonb, @disagreements::jsonb, @legacyObservedAt)
        RETURNING "id"
        """;

    /// <inheritdoc />
    public async Task<Guid> WriteAsync(
        RequestContext context, CareerFitShadowComparison comparison, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(comparison);

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = Command(session, InsertSql);

        AddParameter(command, "userId", comparison.UserId);
        AddParameter(command, "schoolId", (object?)comparison.SchoolId ?? DBNull.Value);
        AddParameter(command, "runId", (object?)comparison.RunId ?? DBNull.Value, DbType.Guid);
        AddParameter(command, "rulesVersion", comparison.RulesVersion);
        AddParameter(
            command, "discGraph",
            comparison.DiscGraph is { } graph ? (short)graph : DBNull.Value, DbType.Int16);
        AddParameter(command, "comparatorVersion", comparison.ComparatorVersion);
        AddParameter(command, "projectionVersion", comparison.ProjectionVersion);
        AddParameter(command, "comparable", comparison.Comparable);
        AddParameter(command, "primaryCause", comparison.PrimaryCause.ToPersistedValue());
        AddParameter(command, "spearmanRho", (object?)comparison.SpearmanRho ?? DBNull.Value, DbType.Double);
        AddParameter(
            command, "topThreeOverlap",
            comparison.TopThreeOverlap is int overlap ? (short)overlap : DBNull.Value, DbType.Int16);
        AddParameter(command, "engineRanking", CareerFitShadowJson.SerializeRanking(comparison.EngineRanking));
        AddParameter(command, "legacyRanking", CareerFitShadowJson.SerializeRanking(comparison.LegacyRanking));
        AddParameter(command, "disagreements", CareerFitShadowJson.SerializeDelta(comparison));
        AddParameter(
            command, "legacyObservedAt",
            (object?)comparison.LegacyObservedAt?.UtcDateTime ?? DBNull.Value, DbType.DateTimeOffset);

        var id = await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("INSERT INTO careerfit_shadow_comparisons returned no row.");

        await session.CommitAsync(cancellationToken);
        return (Guid)id;
    }

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
}
