using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Shadow;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-013. Reads a student's cached legacy <c>/careers/score</c> answer out of
/// <c>user_career_profiles."careerMatches"</c>, in ONE read-only RLS session opened for the CALLER
/// (<c>OpenReadOnlyAsync</c>), never a bypass session.
/// </summary>
/// <remarks>
/// <para>
/// WHY THE CACHE AND NOT THE ENDPOINT. Calling legacy POST /api/v1/careers/score from the shadow job
/// would put the job on the live request path of the exact surface the migration is trying not to
/// disturb: it needs a user's bearer token, it re-runs the legacy profile's AI half, and a slow shadow
/// call becomes a slow user request. The platform already caches that endpoint's answer per student on
/// this row (legacy careerService writes it; <c>CounselorCaseloadReader</c> and
/// <c>CoursePlanComputeReader</c> already read it), so this is a third reader of an existing row and
/// needs no new GRANT — <c>user_career_profiles</c> has been in dotnet-service-role.sql's read-only
/// tier since the beginning.
/// </para>
/// <para>
/// THE COST OF THAT CHOICE, STATED. The legacy half of a comparison is the answer legacy gave when it
/// last scored that student, not one produced at comparison time. If a student's assessments changed
/// after that write, the two sides are looking at different inputs and the disagreement is about
/// staleness. The row records <c>legacyObservedAt</c> so the report can say how stale the cohort was;
/// where the platform does not record an update timestamp on this table, that column is null and the
/// report says THAT instead of guessing.
/// </para>
/// <para>
/// AUTHORIZATION IS NOT HERE, for the same reason it is not in <see cref="CareerFitRunReader"/>:
/// user_career_profiles carries its own RLS policy (self OR the owner's school OR bypass —
/// 003-fk-users.sql), so a row this session may not see simply does not come back and the method
/// answers null. "Invisible" and "absent" are the same outcome on purpose.
/// </para>
/// <para>
/// Deliberately NOT here: any write (this table is legacy Node's; the .NET role holds SELECT on it and
/// nothing more), any interpretation of the scores (<see cref="CareerFitShadowComparator"/>), and any
/// fallback that reconstructs a legacy answer from another table when this row is missing — a student
/// legacy never scored is a finding the report counts, not a gap to fill in.
/// </para>
/// </remarks>
public sealed class LegacyCareerScoreReader(IFormMapsDatabaseSessionFactory databaseSessionFactory)
    : ILegacyCareerScoreReader
{
    // "isAnalysisComplete" is legacy's own "this profile is finished" flag and is read as the locked
    // signal alongside the document's own: legacy's response sets locked when the assessments are
    // incomplete, and this row is what that response was built from. The column list is deliberately
    // minimal -- this reader has no business with the rest of the legacy profile.
    private const string SelectSql = """
        SELECT "careerMatches"::text, "isAnalysisComplete"
        FROM "user_career_profiles"
        WHERE "userId" = @uid
        LIMIT 1
        """;

    /// <inheritdoc />
    public async Task<LegacyCareerRanking?> ReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = Command(session, SelectSql);
        AddParameter(command, "uid", userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var json = reader.IsDBNull(0) ? null : reader.GetString(0);
        var analysisComplete = !reader.IsDBNull(1) && reader.GetBoolean(1);

        // An incomplete analysis is legacy's own locked state, whatever the cached array happens to hold:
        // legacy would answer locked for this student today, so the shadow must not compare against
        // whatever stale matches the column still carries.
        return analysisComplete
            ? LegacyCareerRanking.Parse(userId, json)
            : LegacyCareerRanking.LockedFor(userId);
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
}
