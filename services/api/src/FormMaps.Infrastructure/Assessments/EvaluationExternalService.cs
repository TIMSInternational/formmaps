using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Assessments;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// The external 360 evaluation rail (legacy routes/evaluation.ts systemContext routes + evaluationService.ts):
/// validate-token (read), submit-feedback (write), 360evolutor (read). This is a NON-TENANT, FAIL-CLOSED rail —
/// there is no auth principal; every DB session is opened with <see cref="RequestContext.System()"/> (→ GUC
/// bypass) and the token-validated group is the ONLY access gate. The token (invitationToken) is a NON-unique
/// index, so it is resolved with findFirst (LIMIT 1), case-sensitively, never normalized.
/// </summary>
public sealed class EvaluationExternalService(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IAuditEventWriter auditEventWriter,
    IInsightsTrigger insightsTrigger,
    ILogger<EvaluationExternalService> logger) : IEvaluationExternalService
{
    /// <summary>
    /// The audited subject is the evaluation GROUP, not the feedback row the submit creates. The group is the
    /// thing that pre-exists the submission, the thing the token addresses, and the thing an auditor already
    /// has an id for when they come asking "was this ever submitted, and when" — the feedback row's id is
    /// minted by this very call and referenced by nothing outside it. It is also the id the existing log line
    /// has always carried, so the log and the durable trail stay joinable on the same key.
    /// </summary>
    private const string AuditSubjectType = "evaluation_group";

    // RATIFIED DIVERGENCE FROM LEGACY (Federico approved): legacy submitFeedback does NOT check
    // tokenExpiryDate/isTokenUsed — only validate-token does. This port CLOSES that expiry-bypass gap
    // (security / compliance tightening) permanently. The const documents the divergence and is kept as the
    // one-line lever behind the recorded legacy behavior (see the documented legacy-behavior test); it is NOT a
    // pending decision — the gap stays closed.
    private const bool EnforceFeedbackTokenExpiry = true;

    public async Task<ValidateTokenResult> ValidateTokenAsync(string token, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        var group = await ResolveByTokenAsync(session, token, requireUnexpired: false, cancellationToken);
        if (group is null)
        {
            return new ValidateTokenResult(false, "Token not found");
        }

        if (group.TokenExpiryDate < DateTime.UtcNow)
        {
            return new ValidateTokenResult(false, "Token expired");
        }

        if (group.IsTokenUsed)
        {
            return new ValidateTokenResult(false, "Token already used");
        }

        return new ValidateTokenResult(
            true, null, group.EvaluatorName, group.EvaluatorEmail, group.Relation, group.GroupType, group.Instrument);
    }

    public async Task<FeedbackSubmitResult> SubmitFeedbackAsync(
        FeedbackSubmitInput input, CancellationToken cancellationToken = default)
    {
        var system = RequestContext.System();
        object? feedback;
        string evaluatedUserId;

        // (1) Guard + create in a writable bypass session. Guard: id+token+isActive; instrument!=vocational;
        // stored-email == normalized-incoming; not already completed; (CLOSED GAP) not expired/used.
        await using (var session = await databaseSessionFactory.OpenWritableAsync(system, cancellationToken))
        {
            var group = await ResolveByIdAndTokenAsync(session, input.EvaluationGroupId, input.Token, cancellationToken);
            if (group is null)
            {
                return new FeedbackSubmitResult(FeedbackSubmitStatus.InvalidTokenOrGroup);
            }

            if (group.Instrument == "vocational")
            {
                return new FeedbackSubmitResult(FeedbackSubmitStatus.VocationalInstrument);
            }

            if (group.EvaluatorEmail != ExternalEmailNormalization.NormalizeEmail(input.EvaluatorEmail))
            {
                return new FeedbackSubmitResult(FeedbackSubmitStatus.EmailMismatch);
            }

            if (group.IsEvaluationCompleted)
            {
                return new FeedbackSubmitResult(FeedbackSubmitStatus.AlreadySubmitted);
            }

            if (EnforceFeedbackTokenExpiry && (group.TokenExpiryDate < DateTime.UtcNow || group.IsTokenUsed))
            {
                return new FeedbackSubmitResult(FeedbackSubmitStatus.TokenExpiredOrUsed);
            }

            var validCategories = await LoadActiveCategoriesAsync(session, cancellationToken);
            var now = NowMs();
            var nowIso = IsoZ(now);
            var itemsJson = BuildFeedbackItems(input.Answers, validCategories, nowIso);
            var averageRating = AverageRating(input.Answers);

            try
            {
                feedback = await InsertFeedbackAsync(session, group, input.Answers.Count, itemsJson, averageRating, now, cancellationToken);
            }
            catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                // Concurrent submit lost the @@unique([evaluationGroupId, evaluatorEmail]) race → 409.
                return new FeedbackSubmitResult(FeedbackSubmitStatus.AlreadySubmitted);
            }

            evaluatedUserId = group.EvaluatedUserId;
            await session.CommitAsync(cancellationToken);
        }

        // (2) SEPARATE flip — deliberate non-atomicity (mirrors legacy create-then-update: a crash between them
        // is recovered by the isEvaluationCompleted pre-check + the unique-race catch on retry).
        await using (var flipSession = await databaseSessionFactory.OpenWritableAsync(system, cancellationToken))
        {
            await FlipGroupCompletedAsync(flipSession, input.EvaluationGroupId, cancellationToken);
            await flipSession.CommitAsync(cancellationToken);
        }

        logger.LogInformation("audit.evaluation.feedback.submitted evaluationGroupId={GroupId}", input.EvaluationGroupId);

        // The durable half of the line above — see WriteFeedbackSubmittedAuditAsync for why it sits HERE:
        // below both commits and below every guard, so the event means "feedback was stored", not "someone
        // tried". It cannot fail this request (fail-soft-but-alert inside AuditEventWriter).
        //
        // ORDERED BEFORE THE TRIGGER (formmaps#52 + formmaps#144 merge). The two calls below are
        // independent by construction — neither can suppress the other, because AuditEventWriter swallows
        // every failure but OperationCanceledException (and this call passes CancellationToken.None, which
        // makes that one unreachable) while LegacyApiInsightsTrigger swallows everything including
        // cancellation. So the order is decided by what is lost if the process dies mid-emit: the audit row
        // is the durable, DB-immutable compliance record and the trigger is a best-effort cross-service
        // HTTP call with a 5s cap, so running the audit first keeps the window between "feedback committed"
        // and "audit row committed" as short as a single INSERT instead of stretching it across a Node
        // round-trip (or a Node outage). A lost trigger is recoverable from its own Error log; a lost audit
        // row is not.
        await WriteFeedbackSubmittedAuditAsync(input.EvaluationGroupId);

        // formmaps#144: a completed 360 is typically the LAST gate event for a student, so legacy fires
        // checkAndTriggerInsights(result.evaluatedUserId) after every successful submit
        // (evaluation.ts:161-167) — for the EVALUATED student, not the evaluator. Success path only:
        // every rejected/replayed submit above returned before reaching here, so retries can never
        // re-fire. IInsightsTrigger never throws (fail-soft-BUT-LOUD): a failed fire logs at Error
        // with userId+source for backfill and the evaluator's submit still succeeds.
        //
        // Deliberately NOT wrapped in a caller-side try/catch alongside the audit write above: each call
        // owns its own documented failure semantics, and a shared catch would let this one's swallow-
        // everything posture hide a genuine audit-side programming error the writer means to propagate.
        await insightsTrigger.TriggerAsync(evaluatedUserId, "evaluation.feedback.submitted", cancellationToken);

        return new FeedbackSubmitResult(FeedbackSubmitStatus.Ok, feedback);
    }

    // -------------------------------------------------------------------- audit

    /// <summary>
    /// The durable half of this rail's audit (formmaps#52 Task 14). Called immediately after the existing
    /// <c>audit.evaluation.feedback.submitted</c> log line, which it deliberately mirrors rather than replaces.
    /// </summary>
    /// <remarks>
    /// <para>
    /// WHY THIS SITE MATTERS. Submit-feedback is the only mutation in the product an ANONYMOUS caller can
    /// perform: there is no auth principal, no tenant context, and the invitation token is the entire access
    /// gate. Until now the only record that it ever happened was a log line, so "was feedback ever submitted
    /// against this group, and when" had no durable answer outside the feedback row itself.
    /// </para>
    /// <para>
    /// THE ACTOR COLUMNS ARE NULL BY DECISION. There is no user id, no role and no school anywhere in scope:
    /// the rail runs under <see cref="RequestContext.System()" />, and <c>evaluation_groups</c> has no
    /// <c>schoolId</c> column at all. The only identifier for the human on the other end is their email
    /// address — precisely the class of value <c>audit_events</c> exists to stay free of — and the evaluated
    /// student is the SUBJECT of the evaluation, not the actor, so putting either in <c>ActorUserId</c> would
    /// be a false claim about who acted. "An anonymous holder of a valid token" is honestly encoded as null.
    /// </para>
    /// <para>
    /// Metadata is null for the same reason: the log line has only ever carried the group id, and the extra
    /// things in scope here (the evaluator's address, the raters' free-text comments) are exactly what must
    /// not enter an append-only, indefinitely-retained table. <see cref="AuditMetadataGuard" /> would reject
    /// an email-SHAPED key, but it inspects keys and not values, so the real control is not adding it.
    /// </para>
    /// <para>
    /// WHERE IT SITS: below both commits and below every guard. Each rejection — unresolvable group, a
    /// vocational instrument, an evaluator-email mismatch, an already-completed group, an expired-or-used
    /// token, and the loser of the unique race, which returns from inside the transaction — returns before
    /// this point and leaves no event. An audit row here has to mean "feedback was stored", not "someone
    /// tried"; otherwise any internet caller holding a group id could manufacture immutable entries claiming
    /// submissions that never happened.
    /// </para>
    /// <para>
    /// <see cref="CancellationToken.None" /> is passed deliberately, per
    /// <see cref="IAuditEventWriter.WriteAsync" />'s contract: this runs after the caller's commit, and
    /// <c>AuditEventWriter</c> re-throws <see cref="OperationCanceledException" /> rather than swallowing it,
    /// so passing the request token would let an evaluator closing their browser tab in the gap between
    /// commit and audit raise from a submission that had already been stored. Every other failure is
    /// fail-soft-but-alert inside the writer (Error, <c>audit.write_failed</c>), so this call cannot change
    /// what the evaluator sees — which is the point on a live, user-facing path.
    /// </para>
    /// </remarks>
    private Task WriteFeedbackSubmittedAuditAsync(string evaluationGroupId) =>
        auditEventWriter.WriteAsync(
            new AuditEvent(
                EventType: "audit.evaluation.feedback.submitted",
                ActorUserId: null,
                ActorRole: null,
                SchoolId: null,
                SubjectType: AuditSubjectType,
                SubjectId: evaluationGroupId,
                Metadata: null),
            CancellationToken.None);

    public async Task<Evaluator360Form?> Get360EvaluatorFormAsync(string token, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        var group = await ResolveByTokenAsync(session, token, requireUnexpired: false, cancellationToken);
        // Vocational groups are served ONLY by the vocational take-flow → treated as missing here.
        if (group is null || group.Instrument == "vocational")
        {
            return null;
        }

        if (group.IsEvaluationCompleted)
        {
            return new Evaluator360Form(
                Completed: true,
                EvolutorGroupId: group.Id,
                InvitationToken: group.InvitationToken,
                EvaluatorName: group.EvaluatorName,
                Questions: Array.Empty<Evaluator360Question>());
        }

        var relationType = Evaluation360Scoring.RelationTypeForGroup(group.GroupType);
        var questions = await LoadEvaluator360QuestionsAsync(session, relationType, cancellationToken);
        var (email, name) = await LoadUserAsync(session, group.EvaluatedUserId, cancellationToken);

        return new Evaluator360Form(
            Completed: false,
            EvolutorGroupId: group.Id,
            InvitationToken: group.InvitationToken,
            EvaluatorName: group.EvaluatorName,
            EvaluatedUserEmail: email,
            EvaluatedUserName: name,
            EvaluatorEmail: group.EvaluatorEmail,
            Relation: group.Relation,
            Questions: questions);
    }

    // ---- group resolution (token is a NON-unique index → findFirst, case-sensitive, never normalized) ----

    private sealed record GroupRow(
        string Id, string EvaluatorName, string EvaluatorEmail, string Relation, string GroupType,
        string EvaluatedUserId, string InvitationToken, DateTime TokenExpiryDate, bool IsTokenUsed,
        bool IsEvaluationCompleted, string? Instrument, string? InstrumentVersion);

    private const string GroupColumns =
        "\"id\", \"evaluatorName\", \"evaluatorEmail\", \"relation\", \"groupType\", \"evaluatedUserId\", " +
        "\"invitationToken\", \"tokenExpiryDate\", \"isTokenUsed\", \"isEvaluationCompleted\", \"instrument\", \"instrumentVersion\"";

    private static async Task<GroupRow?> ResolveByTokenAsync(
        FormMapsDatabaseSession session, string token, bool requireUnexpired, CancellationToken cancellationToken)
    {
        var sql = $"SELECT {GroupColumns} FROM \"evaluation_groups\" WHERE \"invitationToken\" = @token AND \"isActive\" = true"
            + (requireUnexpired ? " AND \"tokenExpiryDate\" > @now" : string.Empty)
            + " LIMIT 1";
        await using var command = Command(session, sql);
        AddParameter(command, "token", token);
        if (requireUnexpired)
        {
            AddTimestamp(command, "now", NowMs());
        }

        return await ReadGroupAsync(command, cancellationToken);
    }

    private static async Task<GroupRow?> ResolveByIdAndTokenAsync(
        FormMapsDatabaseSession session, string id, string token, CancellationToken cancellationToken)
    {
        await using var command = Command(session,
            $"SELECT {GroupColumns} FROM \"evaluation_groups\" WHERE \"id\" = @id AND \"invitationToken\" = @token AND \"isActive\" = true LIMIT 1");
        AddParameter(command, "id", id);
        AddParameter(command, "token", token);
        return await ReadGroupAsync(command, cancellationToken);
    }

    private static async Task<GroupRow?> ReadGroupAsync(DbCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new GroupRow(
            Id: reader.GetString(0),
            EvaluatorName: reader.GetString(1),
            EvaluatorEmail: reader.GetString(2),
            Relation: reader.GetString(3),
            GroupType: reader.GetString(4),
            EvaluatedUserId: reader.GetString(5),
            InvitationToken: reader.GetString(6),
            TokenExpiryDate: reader.GetDateTime(7),
            IsTokenUsed: reader.GetBoolean(8),
            IsEvaluationCompleted: reader.GetBoolean(9),
            Instrument: reader.IsDBNull(10) ? null : reader.GetString(10),
            InstrumentVersion: reader.IsDBNull(11) ? null : reader.GetString(11));
    }

    // ---- submit-feedback writes ----

    private static async Task<HashSet<string>> LoadActiveCategoriesAsync(
        FormMapsDatabaseSession session, CancellationToken cancellationToken)
    {
        await using var command = Command(session,
            "SELECT DISTINCT \"category\" FROM \"questions_360\" WHERE \"isActive\" = true");
        var categories = new HashSet<string>(StringComparer.Ordinal);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            if (!reader.IsDBNull(0))
            {
                categories.Add(reader.GetString(0));
            }
        }

        return categories;
    }

    // camelCase feedbackItems jsonb (Evaluation360Scoring reads camelCase primary). questionId/category are
    // OMITTED (JS undefined) when absent/empty/uncatalogued — never written as null.
    private static string BuildFeedbackItems(
        IReadOnlyList<FeedbackAnswer> answers, IReadOnlySet<string> validCategories, string nowIso)
    {
        var array = new JsonArray();
        foreach (var a in answers)
        {
            var item = new JsonObject
            {
                ["questionNumber"] = a.QuestionNumber,
                ["questionText"] = Slice(a.QuestionText, 500),
                ["rating"] = a.Rating,
                ["comment"] = Slice(a.Comment ?? string.Empty, 2000),
                ["isAnswered"] = true,
                ["answeredAt"] = nowIso,
            };

            if (!string.IsNullOrEmpty(a.QuestionId))
            {
                item["questionId"] = Slice(a.QuestionId, 100);
            }

            if (!string.IsNullOrEmpty(a.Category) && validCategories.Contains(a.Category))
            {
                item["category"] = a.Category;
            }

            array.Add(item);
        }

        return array.ToJsonString();
    }

    // Legacy: sum(ratings)/count as a JS number stored into a Decimal column. Double division (JS parity) then
    // decimal (numeric column). Precision divergence vs Prisma's Decimal is documented + immaterial (the derived
    // profile uses the per-item ratings, not averageRating).
    private static decimal AverageRating(IReadOnlyList<FeedbackAnswer> answers)
    {
        var sum = answers.Sum(a => (long)a.Rating);
        return (decimal)((double)sum / answers.Count);
    }

    private static async Task<object> InsertFeedbackAsync(
        FormMapsDatabaseSession session, GroupRow group, int count, string itemsJson, decimal averageRating,
        DateTime now, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            INSERT INTO "evaluation_feedbacks"
                ("id", "evaluationGroupId", "evaluatorEmail", "relation", "groupType", "feedbackItems",
                 "isCompleted", "completedAt", "totalQuestions", "answeredQuestions", "averageRating",
                 "createdDate", "updatedAt")
            VALUES (@id, @egid, @email, @relation, @groupType, @items::jsonb,
                    true, @completedAt, @total, @answered, @avg, @createdDate, @updatedAt)
            RETURNING "id", "feedbackItems"::text AS "feedbackItems"
            """);
        var id = Guid.NewGuid().ToString();
        AddParameter(command, "id", id);
        AddParameter(command, "egid", group.Id);
        AddParameter(command, "email", group.EvaluatorEmail);
        AddParameter(command, "relation", group.Relation);
        AddParameter(command, "groupType", group.GroupType);
        AddParameter(command, "items", itemsJson);
        AddTimestamp(command, "completedAt", now);
        AddParameter(command, "total", count);
        AddParameter(command, "answered", count);
        AddParameter(command, "avg", averageRating);
        AddTimestamp(command, "createdDate", now);
        AddTimestamp(command, "updatedAt", now);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("evaluation_feedbacks insert RETURNING produced no row");
        }

        using var itemsDoc = JsonDocument.Parse(reader.GetString(1));
        return new
        {
            id = reader.GetString(0),
            evaluationGroupId = group.Id,
            evaluatorEmail = group.EvaluatorEmail,
            relation = group.Relation,
            groupType = group.GroupType,
            isCompleted = true,
            totalQuestions = count,
            answeredQuestions = count,
            averageRating = (double)averageRating,
            completedAt = IsoZ(now),
            feedbackItems = itemsDoc.RootElement.Clone(),
        };
    }

    private static async Task FlipGroupCompletedAsync(
        FormMapsDatabaseSession session, string groupId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, """
            UPDATE "evaluation_groups"
            SET "isTokenUsed" = true, "tokenUsedDate" = @now,
                "isEvaluationCompleted" = true, "evaluationCompletedDate" = @now, "updatedAt" = @now
            WHERE "id" = @id
            """);
        AddParameter(command, "id", groupId);
        AddTimestamp(command, "now", NowMs());
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    // ---- 360evolutor reads ----

    private static async Task<IReadOnlyList<Evaluator360Question>> LoadEvaluator360QuestionsAsync(
        FormMapsDatabaseSession session, string relationType, CancellationToken cancellationToken)
    {
        // Legacy: findMany({ where: { isActive, relationType }, orderBy: { questionNumber: asc }, take: 20 }).
        // No id tie-break (matches legacy; ties are DB-order, as in TS).
        await using var command = Command(session, """
            SELECT "id", "questionNumber", "questionEnglishText", "questionSpanishText", "category"
            FROM "questions_360"
            WHERE "isActive" = true AND "relationType" = @relationType
            ORDER BY "questionNumber" ASC
            LIMIT 20
            """);
        AddParameter(command, "relationType", relationType);

        var questions = new List<Evaluator360Question>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            questions.Add(new Evaluator360Question(
                Id: reader.GetString(0),
                QuestionNumber: reader.GetInt32(1),
                QuestionText: reader.GetString(2),
                QuestionTextEs: reader.GetString(3),
                Category: reader.GetString(4)));
        }

        return questions;
    }

    private static async Task<(string? Email, string? Name)> LoadUserAsync(
        FormMapsDatabaseSession session, string userId, CancellationToken cancellationToken)
    {
        await using var command = Command(session, "SELECT \"email\", \"name\" FROM \"users\" WHERE \"id\" = @id LIMIT 1");
        AddParameter(command, "id", userId);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return (null, null);
        }

        return (reader.IsDBNull(0) ? null : reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1));
    }

    // ---- write-rail helpers (identical convention to Question360Writer / VocationalWriter) ----

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
        parameter.DbType = DbType.DateTime2; // Postgres `timestamp` (no tz) — matches Prisma @db.Timestamp(3).
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string Slice(string value, int max) => value.Length > max ? value[..max] : value;

    private static DateTime NowMs()
    {
        var value = DateTimeOffset.UtcNow.UtcDateTime;
        return new DateTime(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }

    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
