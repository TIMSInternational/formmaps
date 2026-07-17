using System.Data;
using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Write-owner for the personality session lifecycle (legacy personality-session-service.ts start /
/// answer / complete). .NET owns the WHOLE lifecycle → no dual-write on personality_assessment_sessions
/// (prod-cut-over-able, unlike LIA/FM-029). Ownership is enforced in-writer (session_not_found ==
/// uniform 404); complete is TOCTOU-safe (SELECT … FOR UPDATE + conditional UPDATE) + idempotent (a
/// completed session is never rescored). Durable writes (create, complete) emit a PII-free audit event.
/// Reuses the shipped PersonalityScoring (FM-027), PersonalityItemBank, and the results reader (FM-017).
/// </summary>
public sealed class PersonalitySessionWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IPersonalityResultReader resultReader,
    ILogger<PersonalitySessionWriter> logger) : IPersonalitySessionWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new();

    // ------------------------------------------------------------------ start

    public async Task<PersonalityStartOutcome> StartAsync(
        RequestContext context,
        string userId,
        string variant,
        string language,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // checkAccess over the caller's own active sessions, newest-first (created_date DESC).
        var own = new List<PersonalitySessionStatus>();
        await using (var command = Command(session, """
            SELECT "id", "status" FROM "personality_assessment_sessions"
            WHERE "user_id" = @userId AND "is_active" = true
            ORDER BY "created_date" DESC
            """))
        {
            AddParameter(command, "userId", userId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                own.Add(new PersonalitySessionStatus(reader.GetString(0), reader.GetString(1)));
            }
        }

        var access = PersonalityAccess.Evaluate(own);

        // An open (non-completed) session resumes rather than starting a new one.
        if (access.ExistingSessionId is { } existingId && !access.HasCompleted)
        {
            return await ResumeAsync(session, existingId, userId, cancellationToken);
        }

        // No access (a completed session exists) → retake blocked.
        if (!access.HasAccess)
        {
            return new PersonalityStartOutcome(PersonalityWriteStatus.AlreadyCompleted, null);
        }

        // Create a fresh in-progress session (id generated client-side, matching Prisma @default(uuid())).
        var sessionId = Guid.NewGuid().ToString();
        var now = Now();
        await using (var command = Command(session, """
            INSERT INTO "personality_assessment_sessions"
                ("id", "user_id", "variant", "status", "session_language", "started_at", "updated_at")
            VALUES (@id, @userId, @variant, 'in_progress', @language, @startedAt, @updatedAt)
            """))
        {
            AddParameter(command, "id", sessionId);
            AddParameter(command, "userId", userId);
            AddParameter(command, "variant", variant);
            AddParameter(command, "language", language);
            AddTimestamp(command, "startedAt", now);
            AddTimestamp(command, "updatedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation(
            "audit.assessment.personality.started sessionId={SessionId} actorUserId={ActorUserId} variant={Variant}",
            sessionId, userId, variant);

        var payload = new SessionStartPayload(
            SessionId: sessionId,
            Status: "in_progress",
            Variant: variant,
            Language: language,
            Items: PersonalityItemBank.ServeItems(variant, language),
            AnsweredItemNumbers: []);
        return new PersonalityStartOutcome(PersonalityWriteStatus.Ok, payload);
    }

    private async Task<PersonalityStartOutcome> ResumeAsync(
        FormMapsDatabaseSession session, string sessionId, string userId, CancellationToken cancellationToken)
    {
        string status, variant, language;
        await using (var command = Command(session, """
            SELECT "status", "variant", "session_language" FROM "personality_assessment_sessions"
            WHERE "id" = @sessionId
            """))
        {
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                // The id came from the caller's own active sessions a statement ago; a miss here is a
                // race — uniform session_not_found (no write).
                return new PersonalityStartOutcome(PersonalityWriteStatus.SessionNotFound, null);
            }

            status = reader.GetString(0);
            variant = NormalizeVariant(reader.GetString(1));
            language = NormalizeLanguage(reader.IsDBNull(2) ? null : reader.GetString(2));
        }

        var answered = new List<int>();
        await using (var command = Command(session, """
            SELECT "item_number" FROM "personality_responses" WHERE "session_id" = @sessionId
            """))
        {
            AddParameter(command, "sessionId", sessionId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                answered.Add(reader.GetInt32(0));
            }
        }

        var payload = new SessionStartPayload(
            SessionId: sessionId,
            Status: status,
            Variant: variant,
            Language: language,
            Items: PersonalityItemBank.ServeItems(variant, language),
            AnsweredItemNumbers: answered);
        return new PersonalityStartOutcome(PersonalityWriteStatus.Ok, payload);
    }

    // ----------------------------------------------------------------- answer

    public async Task<PersonalityAnswerOutcome> SaveAnswerAsync(
        RequestContext context,
        string sessionId,
        string userId,
        int itemNumber,
        string choice,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        var owned = await ReadOwnedSessionAsync(session, sessionId, userId, forUpdate: false, cancellationToken);
        if (owned is null)
        {
            return new PersonalityAnswerOutcome(PersonalityWriteStatus.SessionNotFound, null);
        }

        if (owned.Status == "completed")
        {
            return new PersonalityAnswerOutcome(PersonalityWriteStatus.AlreadyCompleted, null);
        }

        if (owned.Status != "in_progress")
        {
            return new PersonalityAnswerOutcome(PersonalityWriteStatus.NotInProgress, null);
        }

        // Strict A/B — the raw value is compared, never truncated ("BLAH" must NOT score as "B").
        if (choice != "A" && choice != "B")
        {
            return new PersonalityAnswerOutcome(PersonalityWriteStatus.InvalidChoice, null);
        }

        var item = PersonalityItemBank.FindItem(owned.Variant, itemNumber);
        if (item is null)
        {
            return new PersonalityAnswerOutcome(PersonalityWriteStatus.ItemNotFound, null);
        }

        // Upsert by (session_id, item_number). The server derives the dimension from the item; the client
        // only supplies A/B (never the pole).
        var now = Now();
        await using (var command = Command(session, """
            INSERT INTO "personality_responses" ("id", "session_id", "item_number", "dimension", "choice", "updated_at")
            VALUES (@id, @sessionId, @itemNumber, @dimension, @choice, @updatedAt)
            ON CONFLICT ("session_id", "item_number")
            DO UPDATE SET "choice" = EXCLUDED."choice", "dimension" = EXCLUDED."dimension", "updated_at" = EXCLUDED."updated_at"
            """))
        {
            AddParameter(command, "id", Guid.NewGuid().ToString());
            AddParameter(command, "sessionId", sessionId);
            AddParameter(command, "itemNumber", itemNumber);
            AddParameter(command, "dimension", item.Dimension);
            AddParameter(command, "choice", choice);
            AddTimestamp(command, "updatedAt", now);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        int answeredCount;
        await using (var command = Command(session, """
            SELECT count(*) FROM "personality_responses" WHERE "session_id" = @sessionId
            """))
        {
            AddParameter(command, "sessionId", sessionId);
            answeredCount = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken));
        }

        await session.CommitAsync(cancellationToken);

        var totalItems = PersonalityItemBank.ItemCount(owned.Variant);
        return new PersonalityAnswerOutcome(
            PersonalityWriteStatus.Ok,
            new AnswerResult(sessionId, answeredCount, totalItems, answeredCount >= totalItems));
    }

    // --------------------------------------------------------------- complete

    public async Task<PersonalityCompleteOutcome> CompleteAsync(
        RequestContext context,
        string sessionId,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using (var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken))
        {
            var owned = await ReadOwnedSessionAsync(session, sessionId, userId, forUpdate: true, cancellationToken);
            if (owned is null)
            {
                return new PersonalityCompleteOutcome(PersonalityWriteStatus.SessionNotFound, null);
            }

            // Idempotency: an already-completed session is never rescored (no double-score); fall through
            // to the results read below.
            if (owned.Status != "completed")
            {
                var answers = new List<PersonalityAnswer>();
                await using (var command = Command(session, """
                    SELECT "dimension", "item_number", "choice" FROM "personality_responses"
                    WHERE "session_id" = @sessionId
                    """))
                {
                    AddParameter(command, "sessionId", sessionId);
                    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        answers.Add(new PersonalityAnswer(reader.GetString(0), reader.GetInt32(1), reader.GetString(2)));
                    }
                }

                // Coverage: every served item must be answered (legacy incomplete_coverage → 400).
                if (answers.Count != PersonalityItemBank.ItemCount(owned.Variant))
                {
                    return new PersonalityCompleteOutcome(PersonalityWriteStatus.IncompleteCoverage, null);
                }

                var score = PersonalityScoring.ScorePersonality(owned.Variant, answers);
                var now = Now();
                int affected;
                await using (var command = Command(session, """
                    UPDATE "personality_assessment_sessions" SET
                        "status" = 'completed',
                        "completed_at" = @completedAt,
                        "resolved_type" = @resolvedType,
                        "dimension_scores" = @dimensionScores::jsonb,
                        "updated_at" = @completedAt
                    WHERE "id" = @sessionId AND "status" <> 'completed'
                    """))
                {
                    AddParameter(command, "sessionId", sessionId);
                    AddTimestamp(command, "completedAt", now);
                    AddParameter(command, "resolvedType", score.Type);
                    AddParameter(command, "dimensionScores", JsonSerializer.Serialize(score.Dimensions, JsonOptions));
                    affected = await command.ExecuteNonQueryAsync(cancellationToken);
                }

                // Unreachable under the FOR UPDATE lock; fail closed rather than emit a completion audit
                // for a write that did not land (SOC2 PI).
                if (affected == 0)
                {
                    logger.LogError("personality.session.complete conditional update matched 0 rows sessionId={SessionId}", sessionId);
                    throw new InvalidOperationException($"Personality completion update affected 0 rows for session {sessionId}");
                }

                await session.CommitAsync(cancellationToken);
                logger.LogInformation(
                    "audit.assessment.personality.completed sessionId={SessionId} actorUserId={ActorUserId} type={Type}",
                    sessionId, userId, score.Type);
            }
        }

        // Return via the shipped read path (legacy completeSession returns getResults). The committed row
        // is visible to the reader's fresh read-only session.
        var results = await resultReader.ReadBySessionAsync(context, sessionId, userId, cancellationToken);
        return results is null
            ? new PersonalityCompleteOutcome(PersonalityWriteStatus.SessionNotFound, null)
            : new PersonalityCompleteOutcome(PersonalityWriteStatus.Ok, results);
    }

    // ------------------------------------------------------------------ helpers

    private static async Task<OwnedSession?> ReadOwnedSessionAsync(
        FormMapsDatabaseSession session, string sessionId, string userId, bool forUpdate, CancellationToken cancellationToken)
    {
        var sql = """
            SELECT "user_id", "status", "variant", "is_active" FROM "personality_assessment_sessions"
            WHERE "id" = @sessionId
            """ + (forUpdate ? "\nFOR UPDATE" : string.Empty);

        await using var command = Command(session, sql);
        AddParameter(command, "sessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        var ownerUserId = reader.GetString(0);
        var status = reader.GetString(1);
        var variant = NormalizeVariant(reader.GetString(2));
        var isActive = reader.GetBoolean(3);

        // getOwnedSession: missing OR foreign OR inactive → uniform session_not_found (IDOR-safe).
        if (!string.Equals(ownerUserId, userId, StringComparison.Ordinal) || !isActive)
        {
            return null;
        }

        return new OwnedSession(status, variant);
    }

    private static string NormalizeVariant(string? variant) => variant == "laboral" ? "laboral" : "estudiantil";

    private static string NormalizeLanguage(string? language) => language == "en" ? "en" : "es";

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

    // Bind a `timestamp` (without time zone) value tz-independently (matches Prisma DateTime columns).
    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    // UTC wall-clock, Kind=Unspecified (→ `timestamp` binding) at ms precision (Postgres timestamp(3)).
    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }

    private sealed record OwnedSession(string Status, string Variant);
}
