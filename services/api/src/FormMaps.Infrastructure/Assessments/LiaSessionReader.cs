using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>checkAccess</c> / <c>getSession</c> / the practice-questions fetch inside
/// <c>getSession</c> (services/lia/lia-session-service.ts).
///
/// <see cref="GetSessionAsync"/> is an unconditional one-line delegation to
/// <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/> (Task 3's writer): EVERY call opens a
/// writable transaction and takes a <c>SELECT ... FOR UPDATE</c> row lock on the session — not only
/// when a stale deadline is actually found — because the ownership check and the possible expiry-write
/// must happen inside the SAME transaction, and this keeps the lazy-expiry logic in exactly one place
/// (the writer) instead of a second copy here, matching legacy's own design (getSession calls the SAME
/// shared expireIfPastDeadline function that submitAnswer/startSession call). This means a polled GET to
/// this endpoint serializes against concurrent writers (e.g. /answer) on the same session row for the
/// duration of the transaction, not just on the rare request that actually triggers a timeout.
///
/// Column note: "lockedAt" is unmapped camelCase in both prod and the test schema (no @map in
/// schema.prisma) — every other column here is ordinary snake_case, same pattern already established in
/// LiaSessionWriter's StartAsync.
///
/// Scope note: legacy checkAccess's third fallback branch (a completely separate legacy exam system —
/// PCAExamSession/LEGACY_MIL_TYPES — for students who completed an older exam format) is a different
/// subsystem, unrelated to this LIA port, and is deliberately NOT implemented here.
/// </summary>
public sealed class LiaSessionReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILiaSessionWriter sessionWriter) : ILiaSessionReader
{
    private const string SelectActiveSessionForAccessSql = """
        SELECT "id", "status"::text, "lockedAt" FROM "lia_assessment_sessions"
        WHERE "user_id" = @userId AND "is_active" = true ORDER BY "created_date" DESC
        """;

    public async Task<LiaCheckAccessResult> GetAccessAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SelectActiveSessionForAccessSql;
        AddParameter(command, "userId", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            var status = reader.GetString(1);
            if (status == "completed")
            {
                return new LiaCheckAccessResult(false, true, reader.GetString(0), "already_completed");
            }

            if (status is "in_progress" or "practice")
            {
                return new LiaCheckAccessResult(true, false, reader.GetString(0), Locked: !reader.IsDBNull(2));
            }
        }

        return new LiaCheckAccessResult(true, false);
    }

    /// <summary>Delegates entirely to <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/> — see that
    /// method's doc comment for why the lazy-expiry logic lives on the writer, not here.</summary>
    public Task<SessionDetail?> GetSessionAsync(
        RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default) =>
        sessionWriter.ReadWithLazyExpiryAsync(context, sessionId, ownerUserId, cancellationToken);

    private const string SelectSessionForPracticeQuestionsSql = """
        SELECT "user_id", "current_subtest"::text, "language" FROM "lia_assessment_sessions"
        WHERE "id" = @sessionId AND "is_active" = true
        """;

    public async Task<IReadOnlyList<ClientQuestion>?> GetPracticeQuestionsAsync(
        RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SelectSessionForPracticeQuestionsSql;
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        // Ownership: missing == denied -> uniform not-found (IDOR-safe), like every other reader/writer here.
        if (!await reader.ReadAsync(cancellationToken) || reader.GetString(0) != ownerUserId)
        {
            return null;
        }

        var subtest = reader.IsDBNull(1) ? LiaSubtestOrder.Order[0] : reader.GetString(1);
        return LiaQuestionServing.FetchPracticeQuestions(subtest, reader.GetString(2));
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
