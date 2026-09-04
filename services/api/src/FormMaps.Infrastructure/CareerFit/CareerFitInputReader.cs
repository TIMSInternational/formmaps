using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.Data;
using FormMaps.Infrastructure.Assessments;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-010. Reads, in ONE read-only RLS session opened for the caller, the rows the CareerFit adapters
/// consume for a student: the same pca_results row <c>CompleteProfileAssembler</c> reads (discResult +
/// competences, by userId, no isActive filter — legacy parity), the same newest completed + active
/// lia_assessment_sessions row it reads for the parity percentiles, and the same newest completed + active
/// personality_assessment_sessions row <c>PersonalityResultReader.ReadNewestForUserAsync</c> surfaces —
/// including its rule that a session without a resolved type is "no results". The jsonb columns pass
/// through verbatim as <see cref="JsonElement"/>s; parsing them is the adapters' job. The student's
/// users."schoolId" is read FIRST — it is both the tenant snapshot the run is written under and this
/// reader's authorization gate (see <c>ReadTenantGateAsync</c>).
/// </summary>
/// <remarks>
/// <para>
/// FAIL CLOSED. A missing pca_results row, no completed LIA session, or no completed personality session
/// with a resolved type throws <see cref="CareerFitInputException"/> for that instrument (PCA / MIL /
/// PERSONALITY) before anything else is read; the orchestrator writes nothing and the caller reports
/// "not ready". Rows the caller's session cannot see under RLS come back as absent — by the platform's
/// design that is the same outcome, and it is what makes a cross-school evaluation impossible without any
/// code here deciding who the caller is.
/// </para>
/// <para>
/// THE GATE IS FIRST, AND THAT IS A SECURITY PROPERTY, NOT A STYLE CHOICE. Only two of the four tables read
/// here are policied — "users" (005-sensitive.sql) and "pca_results" (007-self-scoped.sql).
/// "lia_assessment_sessions" and "personality_assessment_sessions" appear in NO vendored policy file; they
/// are still on formmaps#77's PENDING list, so today a cross-school caller CAN read another student's LIA
/// percentiles and personality dimension scores. Cross-school denial therefore must not be allowed to depend
/// on which row this reader happens to reach first. <c>ReadTenantGateAsync</c> is the explicit, policied,
/// short-circuiting first read that removes that dependency; every instrument read below it is reached only
/// after the caller has been admitted to the student.
/// </para>
/// <para>
/// Deliberately NOT read: the pca_exam_sessions history (legacy per-exam score percentages are not
/// percentiles — MilAdapter's header), evaluation_feedbacks / questions_360 (the platform's 360 aggregates
/// at CATEGORY level; the engine needs variables, which is why FM-CF-007 reads the raw item responses
/// instead — see the 360 read below), and anything from the resolved personality type (the engine reads
/// poles, never the type code).
/// </para>
/// <para>
/// THE 360 READ IS NOT FAIL-CLOSED, AND IT IS LAST. evaluation_groups IS policied (003-fk-users.sql: self
/// OR the evaluated user's school); vocational_responses is not, and is reached only through the loader's
/// join to its group, so the policied parent gates it for this read. Unlike the three instruments above, an
/// absent or empty result is a VALID outcome: a student with no 360 must still score, and does — the
/// adapter selects NoDataV360Adapter and the run reads as it does today.
/// </para>
/// </remarks>
public sealed class CareerFitInputReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ICareerFitInputReader
{
    // CompleteProfileAssembler.ReadPcaResultAsync, plus the row id for provenance.
    private const string PcaResultSql = """
        SELECT "id", "discResult"::text, "competences"::text
        FROM "pca_results"
        WHERE "userId" = @uid
        LIMIT 1
        """;

    // CompleteProfileAssembler.ReadParityAsync: the newest completed, active session (NULLS FIRST is the
    // Postgres default for DESC and what Prisma's orderBy inherits).
    private const string LiaSessionSql = """
        SELECT "id", "percentiles"::text
        FROM "lia_assessment_sessions"
        WHERE "user_id" = @uid AND "status" = 'completed' AND "is_active" = true
        ORDER BY "completed_at" DESC NULLS FIRST
        LIMIT 1
        """;

    // PersonalityResultReader.NewestForUserSql without the users join (name/email are not inputs).
    private const string PersonalitySessionSql = """
        SELECT "id", "resolved_type", "dimension_scores"::text
        FROM "personality_assessment_sessions"
        WHERE "user_id" = @uid AND "status" = 'completed' AND "is_active" = true
        ORDER BY "completed_at" DESC
        LIMIT 1
        """;

    // The authorization gate AND the tenant snapshot, in one read. "users" is policied by 005-sensitive.sql
    // (bypass OR self OR same school) — the platform's own answer to "may this caller see this student".
    private const string TenantGateSql = """
        SELECT "schoolId" FROM "users" WHERE "id" = @uid LIMIT 1
        """;

    public async Task<CareerFitRawInputs> ReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        // The gate first: no instrument row is read for a student this caller cannot see. Two of the three
        // instrument tables are unpolicied (see the remarks), so this order is load-bearing.
        var schoolId = await ReadTenantGateAsync(session, userId, cancellationToken);

        var (pcaResultId, discResult, competences) = await ReadPcaResultAsync(session, userId, cancellationToken);
        var (liaSessionId, percentiles) = await ReadLiaSessionAsync(session, userId, cancellationToken);
        var (personalitySessionId, dimensionScores) = await ReadPersonalitySessionAsync(session, userId, cancellationToken);

        // The 360 evidence, through the vocational chassis's OWN loader (FM-CF-007) rather than a second
        // query of the same tables. NOT fail-closed and deliberately last: a student with no 360 must still
        // score (NoDataV360Adapter), so an empty list is a valid outcome, not a missing instrument.
        var raterGroups = await VocationalResponseLoader.LoadGroupsAsync(session, userId, cancellationToken);

        return new CareerFitRawInputs(
            UserId: userId,
            SchoolId: schoolId,
            DiscResult: discResult,
            Competences: competences,
            LiaPercentiles: percentiles,
            PersonalityDimensionScores: dimensionScores,
            // The platform's CATEGORY-level 360 block is not an engine input at any point (the engine wants
            // VARIABLES); the item responses below are. Until FM-CF-006 seeds the 40 items this list comes
            // back empty for every student, which is precisely the NoDataV360Adapter case.
            ThreeSixty: null,
            V360RaterGroups: raterGroups,
            Sources: new CareerFitInputSources(pcaResultId, liaSessionId, personalitySessionId));
    }

    /// <summary>
    /// THE AUTHORIZATION GATE — the first read, and the only failure here that means "not yours" rather than
    /// "not completed". Returns the student's tenant, which the run is written under.
    ///
    /// WHY IT EXISTS. Of the four tables this reader touches, "users" and "pca_results" are policied and
    /// "lia_assessment_sessions" / "personality_assessment_sessions" are not (formmaps#77, PENDING). Before this
    /// gate, a cross-school caller was denied only because pca_results HAPPENED to be the first read; reordering
    /// the four reads — a refactor with no visible cost and no failing test — would have let that caller read
    /// another student's LIA and personality rows first. The invariant is now explicit and enforced by position:
    /// this read is policied, it runs first, and its failure short-circuits, so no later read's visibility can
    /// matter. Nothing here decides who the caller is; the policy on "users" does, exactly as before.
    ///
    /// An invisible users row and an absent one are deliberately the same outcome — the platform's design, and
    /// the reason this fails closed as <see cref="InputWarningCodes.StudentNotVisible"/> rather than
    /// distinguishing "denied" from "no such user" for the caller.
    /// </summary>
    private static async Task<string?> ReadTenantGateAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, TenantGateSql, userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new CareerFitInputException(
                InputInstruments.Student,
                InputWarningCodes.StudentNotVisible,
                $"No users row for student '{userId}' is visible to this session; nothing may be read for them.");
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0);
    }

    private static async Task<(string Id, JsonElement Disc, JsonElement Competences)> ReadPcaResultAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, PcaResultSql, userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new CareerFitInputException(
                InputInstruments.Pca,
                InputWarningCodes.DiscMissing,
                "No pca_results row is visible for this student; the PCA (DISC + competencies) has not been completed.");
        }

        return (reader.GetString(0), ReadJson(reader, 1), ReadJson(reader, 2));
    }

    private static async Task<(string Id, JsonElement Percentiles)> ReadLiaSessionAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, LiaSessionSql, userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new CareerFitInputException(
                InputInstruments.Mil,
                InputWarningCodes.MilPercentilesMissing,
                "No completed, active lia_assessment_sessions row is visible for this student; the LIA (MIL) has not been completed.");
        }

        return (reader.GetString(0), ReadJson(reader, 1));
    }

    private static async Task<(string Id, JsonElement DimensionScores)> ReadPersonalitySessionAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, PersonalitySessionSql, userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new CareerFitInputException(
                InputInstruments.Personality,
                InputWarningCodes.PersonalityScoresMissing,
                "No completed, active personality_assessment_sessions row is visible for this student; the personality assessment has not been completed.");
        }

        // PersonalityResultReader.ReadNewestForUserAsync: the newest completed session without a resolved
        // type is "no results" (legacy getUserResults) — it does not fall back to an older session.
        var resolvedType = reader.IsDBNull(1) ? null : reader.GetString(1);
        if (string.IsNullOrEmpty(resolvedType))
        {
            throw new CareerFitInputException(
                InputInstruments.Personality,
                InputWarningCodes.PersonalityScoresMissing,
                "The student's newest completed personality session has no resolved type; the platform treats it as having no results.");
        }

        return (reader.GetString(0), ReadJson(reader, 2));
    }

    // ---------------------------------------------------------------- primitives (CompleteProfileAssembler's)

    private static DbCommand Command(FormMapsDatabaseSession session, string sql, string userId)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "uid";
        parameter.Value = userId;
        command.Parameters.Add(parameter);
        return command;
    }

    // jsonb-as-text -> JsonElement (verbatim; SQL NULL and jsonb 'null' both surface as a JSON-null
    // element, which every adapter treats as "absent" and fails closed on).
    private static JsonElement ReadJson(DbDataReader reader, int ordinal)
    {
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }
}
