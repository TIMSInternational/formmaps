using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.CareerFit;

/// <summary>
/// FM-CF-010. Reads, in ONE read-only RLS session opened for the caller, the rows the CareerFit adapters
/// consume for a student: the same pca_results row <c>CompleteProfileAssembler</c> reads (discResult +
/// competences, by userId, no isActive filter — legacy parity), the same newest completed + active
/// lia_assessment_sessions row it reads for the parity percentiles, and the same newest completed + active
/// personality_assessment_sessions row <c>PersonalityResultReader.ReadNewestForUserAsync</c> surfaces —
/// including its rule that a session without a resolved type is "no results". The jsonb columns pass
/// through verbatim as <see cref="JsonElement"/>s; parsing them is the adapters' job. The student's
/// users."schoolId" is read last as the tenant snapshot the run is written under.
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
/// Deliberately NOT read: the pca_exam_sessions history (legacy per-exam score percentages are not
/// percentiles — MilAdapter's header), evaluation_feedbacks / questions_360 (the platform's 360 aggregates
/// at category level; the engine needs variables — FM-CF-006/007), and anything from the resolved
/// personality type (the engine reads poles, never the type code).
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

    private const string TenantSql = """
        SELECT "schoolId" FROM "users" WHERE "id" = @uid LIMIT 1
        """;

    public async Task<CareerFitRawInputs> ReadAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        var (pcaResultId, discResult, competences) = await ReadPcaResultAsync(session, userId, cancellationToken);
        var (liaSessionId, percentiles) = await ReadLiaSessionAsync(session, userId, cancellationToken);
        var (personalitySessionId, dimensionScores) = await ReadPersonalitySessionAsync(session, userId, cancellationToken);
        var schoolId = await ReadTenantAsync(session, userId, cancellationToken);

        return new CareerFitRawInputs(
            UserId: userId,
            SchoolId: schoolId,
            DiscResult: discResult,
            Competences: competences,
            LiaPercentiles: percentiles,
            PersonalityDimensionScores: dimensionScores,
            ThreeSixty: null, // no variable-level 360 before FM-CF-006/007; NoDataV360Adapter ignores it
            Sources: new CareerFitInputSources(pcaResultId, liaSessionId, personalitySessionId));
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

    private static async Task<string?> ReadTenantAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, TenantSql, userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            // Every session that can see the instrument rows can see the users row (self or same school, or
            // bypass), so this is a broken foreign key, not an access outcome.
            throw new InvalidOperationException(
                $"The users row for student '{userId}' is not visible although the student's assessment rows are.");
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0);
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
