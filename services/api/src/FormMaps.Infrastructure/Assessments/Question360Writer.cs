using System.Data;
using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Nodes;
using FormMaps.Application.Assessments;
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
    ILogger<Question360Writer> logger) : IQuestion360Writer
{
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
        return new Question360BulkResult(created, total, errors);
    }

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
