using System.Data;
using System.Data.Common;
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
/// Reproduces the legacy question360 catalog writes (routes/question360.ts POST / PUT /:id / activate / deactivate /
/// DELETE /:id / bulk-create). The table is a GLOBAL reference bank — no tenant scope, no ownership; authorization
/// is the endpoint's <c>evaluations:manage</c> permission. <c>createdBy</c>/<c>updatedBy</c> are NEVER populated
/// (faithful — legacy never writes them even though the caller id is available). Timestamps are bound tz-independently
/// (Kind=Unspecified + DbType.DateTime2, matching Prisma @db.Timestamp(3)) and truncated to ms so store == return.
/// Legacy has no existence check on update/activate/deactivate/delete → a missing id (affected 0) is the P2025→500
/// branch (<see cref="Question360WriteStatus.Missing"/>). bulk-create runs each item in its OWN session (independent
/// commit) so successes persist alongside failures with no rollback, matching Prisma's per-create semantics.
/// </summary>
public sealed class Question360Writer(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    IAuditEventWriter auditEventWriter,
    ILogger<Question360Writer> logger) : IQuestion360Writer
{
    /// <summary>
    /// One subject type for the whole catalog. Every mutation here targets a row of the same global
    /// <c>questions_360</c> bank, so the action lives in the event type (created/updated/activated/
    /// deactivated/deleted/bulk_created) and the subject type stays constant — which is what lets a
    /// compliance reader ask "everything that ever happened to question X" with a single filter pair.
    /// </summary>
    private const string AuditSubjectType = "question_360";

    public async Task<Question360WriteOutcome> CreateAsync(
        RequestContext context, JsonElement body, CancellationToken cancellationToken = default)
    {
        var validation = Question360Validation.ValidateCreate(body);
        if (!validation.Ok)
        {
            return new Question360WriteOutcome(Question360WriteStatus.ValidationError, null, validation.Message);
        }

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var row = await InsertAsync(session, validation.Fields!, cancellationToken);
        await session.CommitAsync(cancellationToken);

        logger.LogInformation("audit.question360.created questionId={QuestionId}", row.Id);
        await WriteAuditAsync(context, "audit.question360.created", row.Id);
        return new Question360WriteOutcome(Question360WriteStatus.Created, row, null);
    }

    public async Task<Question360WriteOutcome> UpdateAsync(
        RequestContext context, string id, JsonElement body, CancellationToken cancellationToken = default)
    {
        var validation = Question360Validation.ValidateUpdate(body);
        if (!validation.Ok)
        {
            return new Question360WriteOutcome(Question360WriteStatus.ValidationError, null, validation.Message);
        }

        var assignments = new List<Question360Column>(validation.Fields!.Columns)
        {
            new("updatedAt", NowMs()), // @updatedAt bumps on every update (even a {} partial body).
        };
        var setClause = string.Join(", ", assignments.Select(a => $"\"{a.Name}\" = @{a.Name}"));
        var sql = $"UPDATE \"questions_360\" SET {setClause} WHERE \"id\" = @id RETURNING {Question360RowMapper.Projection}";

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var row = await ExecuteReturningAsync(session, sql, assignments, id, cancellationToken);
        if (row is null)
        {
            return new Question360WriteOutcome(Question360WriteStatus.Missing, null, null);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation("audit.question360.updated questionId={QuestionId}", id);
        // Below the Missing early return above, so this cannot record an edit to a question that does not exist.
        await WriteAuditAsync(context, "audit.question360.updated", id);
        return new Question360WriteOutcome(Question360WriteStatus.Ok, row, null);
    }

    public async Task<Question360WriteOutcome> SetActiveAsync(
        RequestContext context, string id, bool isActive, CancellationToken cancellationToken = default)
    {
        var assignments = new List<Question360Column>
        {
            new("isActive", isActive),
            new("updatedAt", NowMs()),
        };
        var sql = $"UPDATE \"questions_360\" SET \"isActive\" = @isActive, \"updatedAt\" = @updatedAt " +
                  $"WHERE \"id\" = @id RETURNING {Question360RowMapper.Projection}";

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var row = await ExecuteReturningAsync(session, sql, assignments, id, cancellationToken);
        if (row is null)
        {
            return new Question360WriteOutcome(Question360WriteStatus.Missing, null, null);
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation("audit.question360.{Action} questionId={QuestionId}", isActive ? "activated" : "deactivated", id);
        // Two event TYPES from one call site, mirroring the log line's {Action} placeholder rather than one
        // "setActive" event with the flag in metadata: the taxonomy the spec seeds from the existing log lines
        // lists activated and deactivated separately, and an auditor filtering for deactivations of a question
        // should not have to know to look inside a metadata blob to find them.
        await WriteAuditAsync(context, isActive ? "audit.question360.activated" : "audit.question360.deactivated", id);
        return new Question360WriteOutcome(Question360WriteStatus.Ok, row, null);
    }

    public async Task<Question360DeleteStatus> DeleteAsync(
        RequestContext context, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Child-guard FIRST: refuse if any ACTIVE sub-question points at this id (legacy count > 0 → 400).
        await using (var count = session.Connection.CreateCommand())
        {
            count.Transaction = session.Transaction;
            count.CommandText = """SELECT count(*) FROM "questions_360" WHERE "parentQuestionId" = @id AND "isActive" = true""";
            AddParameter(count, "id", id);
            var subs = (long)(await count.ExecuteScalarAsync(cancellationToken))!;
            if (subs > 0)
            {
                return Question360DeleteStatus.ChildGuard;
            }
        }

        int affected;
        await using (var update = session.Connection.CreateCommand())
        {
            update.Transaction = session.Transaction;
            update.CommandText = """UPDATE "questions_360" SET "isActive" = false, "updatedAt" = @updatedAt WHERE "id" = @id""";
            AddParameter(update, "id", id);
            AddTimestamp(update, "updatedAt", NowMs());
            affected = await update.ExecuteNonQueryAsync(cancellationToken);
        }

        if (affected == 0)
        {
            return Question360DeleteStatus.Missing; // legacy P2025 → 500 (guard passed for a nonexistent parent).
        }

        await session.CommitAsync(cancellationToken);
        logger.LogInformation("audit.question360.deleted questionId={QuestionId}", id);
        // Below BOTH of this method's early returns — the child-guard (the parent is still active, so a
        // "deleted" event would be an immutable claim contradicting the catalog) and Missing.
        await WriteAuditAsync(context, "audit.question360.deleted", id);
        return Question360DeleteStatus.Deleted;
    }

    public async Task<Question360BulkResult> BulkCreateAsync(
        RequestContext context, JsonElement array, CancellationToken cancellationToken = default)
    {
        var total = array.GetArrayLength();
        var created = 0;
        var errors = new List<JsonObject>();

        foreach (var item in array.EnumerateArray())
        {
            var validation = Question360Validation.ValidateCreate(item);
            if (!validation.Ok)
            {
                // DELIBERATE DIVERGENCE (robustness, not bug-faithful): a null / non-object element is reported as
                // a per-item error and the request still returns 200. Legacy reads `item.questionNumber` while
                // building the error row, which THROWS on a null element → outer catch → 500 for the whole batch.
                // A valid bulk request behaves identically; only a malformed null element differs (graceful vs crash).
                errors.Add(BulkError(item, validation.Message!));
                continue;
            }

            try
            {
                // Each item = its own session/transaction (independent commit) so successes persist alongside
                // failures with NO rollback — matching Prisma's per-create semantics (no wrapping transaction).
                await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
                await InsertAsync(session, validation.Fields!, cancellationToken);
                await session.CommitAsync(cancellationToken);
                created++;
            }
            catch (Exception ex)
            {
                // Never echo the internal error (legacy: P2002 → "Duplicate question", else "Failed to create question").
                logger.LogWarning(ex, "Bulk create question failed");
                var message = ex is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation }
                    ? "Duplicate question"
                    : "Failed to create question";
                errors.Add(BulkError(item, message));
            }
        }

        logger.LogInformation("audit.question360.bulk_created createdCount={CreatedCount} totalRequested={TotalRequested}", created, total);
        // ONE summary event for the batch, not one per item, and — uniquely here — with a NULL subject: the
        // batch is the act, and its items each got a fresh row id that nothing else references. That is the
        // production column's documented shape ("nullable: bulk operations may have no single subject").
        //
        // Also unlike every other site in this class, this fires even when NOTHING was created, mirroring the
        // unconditional log line above it. The counts are in the metadata, so a createdCount:0 event claims no
        // write happened; and an admin whose bulk mutation of the global bank wholly failed is precisely what
        // an auditor asks about. Outcome stays 'success' — it describes the request, which completed and
        // returned its per-item report; the per-item failures are the report's content, not this call's.
        await WriteAuditAsync(context, "audit.question360.bulk_created", questionId: null,
            metadata: new Dictionary<string, object?>
            {
                ["createdCount"] = created,
                ["totalRequested"] = total,
            });
        return new Question360BulkResult(created, total, errors);
    }

    // -------------------------------------------------------------------- audit

    /// <summary>
    /// The durable half of this class's audit (formmaps#52 Task 13). Called immediately after each existing
    /// <c>audit.question360.*</c> log line, and — like that line — only ever AFTER the mutation's own commit,
    /// and therefore only on the paths that actually changed a row. The Missing branches (no such id on
    /// update/activate/delete) and the delete child-guard return before this point and leave no event: an
    /// audit row here has to mean "the catalog changed", not "someone tried".
    /// </summary>
    /// <remarks>
    /// <para>
    /// THE ACTOR IS THE WHOLE POINT HERE, more than in any other retrofit target. <c>questions_360</c>
    /// carries <c>createdBy</c>/<c>updatedBy</c> columns that this writer NEVER populates — deliberately, for
    /// legacy parity (see the class summary) — so the catalog itself has no record of who changed it, and the
    /// existing log line carries only the question id. <c>audit_events</c> is therefore the only place the
    /// identity of whoever mutated the global question bank exists at all. <c>ActorRole</c> is the normalized
    /// role, not the raw claim, so the trail is filterable on a stable taxonomy rather than on whatever casing
    /// a token happened to carry.
    /// </para>
    /// <para>
    /// <c>SchoolId</c> stays NULL, and that is a decision rather than an omission. <c>questions_360</c> is a
    /// GLOBAL reference bank with no <c>schoolId</c> of its own; stamping the acting admin's school onto the
    /// event would make a cross-tenant mutation look tenant-scoped, and — worse — a compliance query filtered
    /// by school would then return catalog edits that affected every other school just as much.
    /// </para>
    /// <para>
    /// <see cref="CancellationToken.None" /> is passed deliberately, per
    /// <see cref="IAuditEventWriter.WriteAsync" />'s contract: this runs after the caller's commit, and
    /// <c>AuditEventWriter</c> re-throws <see cref="OperationCanceledException" /> rather than swallowing it —
    /// so passing the request token would let a client disconnecting in the gap between commit and audit raise
    /// from a mutation that had already been stored. Every other failure is fail-soft-but-alert inside the
    /// writer (Error, <c>audit.write_failed</c>), so this call cannot change what the caller sees.
    /// </para>
    /// </remarks>
    private Task WriteAuditAsync(
        RequestContext context,
        string eventType,
        string? questionId,
        IReadOnlyDictionary<string, object?>? metadata = null) =>
        auditEventWriter.WriteAsync(
            new AuditEvent(
                EventType: eventType,
                ActorUserId: context.Tenant?.UserId,
                ActorRole: context.Actor?.NormalizedRole,
                SchoolId: null,
                SubjectType: AuditSubjectType,
                SubjectId: questionId,
                Metadata: metadata),
            CancellationToken.None);

    private static async Task<Question360Row> InsertAsync(
        FormMapsDatabaseSession session, Question360WriteFields fields, CancellationToken cancellationToken)
    {
        var now = NowMs();
        var assignments = new List<Question360Column> { new("id", Guid.NewGuid().ToString()) };
        assignments.AddRange(fields.Columns);
        assignments.Add(new Question360Column("createdDate", now));
        assignments.Add(new Question360Column("updatedAt", now));

        var columns = string.Join(", ", assignments.Select(a => $"\"{a.Name}\""));
        var values = string.Join(", ", assignments.Select(a => $"@{a.Name}"));
        var sql = $"INSERT INTO \"questions_360\" ({columns}) VALUES ({values}) RETURNING {Question360RowMapper.Projection}";

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        foreach (var assignment in assignments)
        {
            if (assignment.Name is "createdDate" or "updatedAt")
            {
                AddTimestamp(command, assignment.Name, (DateTime)assignment.Value);
            }
            else
            {
                AddParameter(command, assignment.Name, assignment.Value);
            }
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("question360 insert RETURNING produced no row");
        }

        return Question360RowMapper.Read(reader);
    }

    private static async Task<Question360Row?> ExecuteReturningAsync(
        FormMapsDatabaseSession session,
        string sql,
        IReadOnlyList<Question360Column> assignments,
        string id,
        CancellationToken cancellationToken)
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        foreach (var assignment in assignments)
        {
            if (assignment.Name == "updatedAt")
            {
                AddTimestamp(command, assignment.Name, (DateTime)assignment.Value);
            }
            else
            {
                AddParameter(command, assignment.Name, assignment.Value);
            }
        }

        AddParameter(command, "id", id);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? Question360RowMapper.Read(reader) : null;
    }

    // errors.push({ questionNumber: item.questionNumber, error }). The raw questionNumber is read from the UNvalidated
    // item: present (number/string/null) → echoed verbatim; absent or a non-object item → key omitted (JS undefined).
    private static JsonObject BulkError(JsonElement item, string error)
    {
        var node = new JsonObject();
        if (item.ValueKind == JsonValueKind.Object
            && item.TryGetProperty("questionNumber", out var questionNumber)
            && questionNumber.ValueKind != JsonValueKind.Undefined)
        {
            node["questionNumber"] = JsonNode.Parse(questionNumber.GetRawText());
        }

        node["error"] = error;
        return node;
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

    private static DateTime NowMs()
    {
        var value = DateTimeOffset.UtcNow.UtcDateTime;
        var truncated = new DateTime(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
        return truncated;
    }
}
