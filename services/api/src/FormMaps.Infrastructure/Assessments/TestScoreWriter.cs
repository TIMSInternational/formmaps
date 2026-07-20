using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces the legacy test-scores writes (routes/test-scores.ts POST / PUT /:id / DELETE /:id). All writes
/// are self-scoped: create writes for the caller (id generated app-side like Prisma @default(uuid); createdBy/
/// updatedBy left null; isOfficial defaults true, isSuperScore false); update/delete resolve the row and return
/// NotFound (uniform IDOR) unless it exists, is owned by the caller, and is active — validation (400) runs only
/// AFTER that ownership gate on PUT, matching legacy. Timestamps are bound tz-independently (Kind=Unspecified +
/// DbType.DateTime2, matching the Prisma @db.Timestamp columns) and truncated to ms so store == return.
/// </summary>
public sealed class TestScoreWriter(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<TestScoreWriter> logger) : ITestScoreWriter
{
    public async Task<TestScoreWriteOutcome> CreateAsync(
        RequestContext context, string userId, JsonElement body, CancellationToken cancellationToken = default)
    {
        var validation = TestScoreValidation.ValidateCreate(body);
        if (!validation.Ok)
        {
            return new TestScoreWriteOutcome(TestScoreWriteStatus.ValidationError, null, validation.Message);
        }

        var fields = validation.Fields!;
        var now = NowMs();

        // Column -> parameter map. Start from the validated present columns, then apply the create defaults the
        // legacy handler always writes (isOfficial ?? true, isSuperScore ?? false), plus id/userId/timestamps.
        var assignments = new List<Assignment>
        {
            new("id", Guid.NewGuid().ToString(), Bind.Text),
            new("userId", userId, Bind.Text),
        };
        AppendValidatedColumns(assignments, fields);
        if (!fields.Columns.ContainsKey("isSuperScore"))
        {
            assignments.Add(new Assignment("isSuperScore", false, Bind.Plain));
        }

        if (!fields.Columns.ContainsKey("isOfficial"))
        {
            assignments.Add(new Assignment("isOfficial", true, Bind.Plain));
        }

        if (fields.TestDatePresent)
        {
            assignments.Add(TestDateAssignment(fields.TestDateRaw));
        }

        assignments.Add(new Assignment("createdDate", now, Bind.Timestamp));
        assignments.Add(new Assignment("updatedAt", now, Bind.Timestamp));

        var columns = string.Join(", ", assignments.Select(a => Quote(a.Column)));
        var values = string.Join(", ", assignments.Select(a => Placeholder(a)));
        var sql = $"""
            INSERT INTO "student_test_scores" ({columns})
            VALUES ({values})
            RETURNING {TestScoreRowMapper.Projection}
            """;

        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        var row = await ExecuteReturningAsync(session, sql, assignments, cancellationToken);
        await session.CommitAsync(cancellationToken);

        // Audit (SOC2 CC7.2 / ISO A.8.15): IDs only, never PII; emitted only after the durable write commits.
        logger.LogInformation(
            "audit.assessment.testscore.created testScoreId={TestScoreId} actorUserId={ActorUserId}", row.Id, userId);

        return new TestScoreWriteOutcome(TestScoreWriteStatus.Created, row, null);
    }

    public async Task<TestScoreWriteOutcome> UpdateAsync(
        RequestContext context, string userId, string id, JsonElement body, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        // Ownership FIRST (before validation), matching legacy: findUnique -> !existing || userId mismatch ||
        // !isActive -> uniform 404. missing == not-owned == already-deleted, no existence leak.
        if (!await OwnsActiveRowAsync(session, id, userId, cancellationToken))
        {
            return new TestScoreWriteOutcome(TestScoreWriteStatus.NotFound, null, null);
        }

        var validation = TestScoreValidation.ValidateUpdate(body);
        if (!validation.Ok)
        {
            return new TestScoreWriteOutcome(TestScoreWriteStatus.ValidationError, null, validation.Message);
        }

        var fields = validation.Fields!;
        var assignments = new List<Assignment>();
        AppendValidatedColumns(assignments, fields);
        if (fields.TestDatePresent)
        {
            // A present testDate always writes the column: a valid string -> the instant; an empty/whitespace
            // string -> NULL (so update clears any prior date), matching legacy `d.testDate ? new Date : null`.
            assignments.Add(TestDateAssignment(fields.TestDateRaw));
        }

        // @updatedAt bumps on every update (even a body that set no other field — .partial() allows {}).
        assignments.Add(new Assignment("updatedAt", NowMs(), Bind.Timestamp));

        var setClause = string.Join(", ", assignments.Select(a => $"{Quote(a.Column)} = {Placeholder(a)}"));
        var sql = $"""
            UPDATE "student_test_scores" SET {setClause}
            WHERE "id" = @id
            RETURNING {TestScoreRowMapper.Projection}
            """;

        // The id parameter is used by the WHERE clause; add it as a plain (non-emitted) parameter.
        var parameters = new List<Assignment>(assignments) { new("id", id, Bind.Text) };
        var row = await ExecuteReturningAsync(session, sql, parameters, cancellationToken);
        await session.CommitAsync(cancellationToken);

        logger.LogInformation(
            "audit.assessment.testscore.updated testScoreId={TestScoreId} actorUserId={ActorUserId}", id, userId);

        return new TestScoreWriteOutcome(TestScoreWriteStatus.Ok, row, null);
    }

    public async Task<bool> DeleteAsync(
        RequestContext context, string userId, string id, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);

        if (!await OwnsActiveRowAsync(session, id, userId, cancellationToken))
        {
            return false; // missing / not-owned / already-inactive -> 404 (2nd delete is idempotently 404).
        }

        await using (var command = session.Connection.CreateCommand())
        {
            command.Transaction = session.Transaction;
            command.CommandText = """UPDATE "student_test_scores" SET "isActive" = false, "updatedAt" = @ts WHERE "id" = @id""";
            AddParameter(command, "id", id, Bind.Text);
            AddParameter(command, "ts", NowMs(), Bind.Timestamp);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await session.CommitAsync(cancellationToken);

        logger.LogInformation(
            "audit.assessment.testscore.deleted testScoreId={TestScoreId} actorUserId={ActorUserId}", id, userId);

        return true;
    }

    private static async Task<bool> OwnsActiveRowAsync(
        FormMapsDatabaseSession session, string id, string userId, CancellationToken cancellationToken)
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "userId", "isActive" FROM "student_test_scores" WHERE "id" = @id""";
        AddParameter(command, "id", id, Bind.Text);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return false; // missing
        }

        var ownerId = reader.GetString(0);
        var isActive = reader.GetBoolean(1);
        return string.Equals(ownerId, userId, StringComparison.Ordinal) && isActive;
    }

    private static async Task<TestScoreRow> ExecuteReturningAsync(
        FormMapsDatabaseSession session, string sql, IReadOnlyList<Assignment> parameters, CancellationToken cancellationToken)
    {
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        foreach (var assignment in parameters)
        {
            AddParameter(command, assignment.Column, assignment.Value, assignment.Bind);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("test-scores write RETURNING produced no row");
        }

        return TestScoreRowMapper.Read(reader);
    }

    private static void AppendValidatedColumns(List<Assignment> assignments, TestScoreWriteFields fields)
    {
        foreach (var (column, value) in fields.Columns)
        {
            assignments.Add(new Assignment(column, value.Value, value.IsJsonb ? Bind.Jsonb : Bind.Plain));
        }
    }

    // Legacy `d.testDate ? new Date(d.testDate) : null`: ONLY the empty string "" is falsy -> store NULL. Any
    // other value (including whitespace-only "   ", which is TRUTHY in JS) falls through to the parse; an
    // unparseable value throws -> 500 (JS `new Date("   ")` -> Invalid Date -> write error). Bound
    // tz-independently (DBNull for the null case). Matches legacy truthiness exactly (IsNullOrEmpty, not
    // IsNullOrWhiteSpace).
    private static Assignment TestDateAssignment(string? raw)
    {
        object value = string.IsNullOrEmpty(raw) ? DBNull.Value : ParseTestDate(raw);
        return new Assignment("testDate", value, Bind.Timestamp);
    }

    // Legacy `new Date(testDate)`: the client sends an ISO/date string; store the instant. Parse assuming UTC
    // when no offset is present (matches JS date-only parsing), convert to UTC, bind tz-independently. An
    // unparseable value throws here -> 500, matching legacy where an Invalid Date fails at the Prisma write.
    private static DateTime ParseTestDate(string? raw)
    {
        var parsed = DateTime.Parse(
            raw ?? string.Empty,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
        return TruncateToMilliseconds(DateTime.SpecifyKind(parsed, DateTimeKind.Unspecified));
    }

    private static DateTime NowMs() =>
        TruncateToMilliseconds(DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified));

    private static DateTime TruncateToMilliseconds(DateTime value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerMillisecond), value.Kind);

    private static string Quote(string column) => $"\"{column}\"";

    private static string Placeholder(Assignment assignment) =>
        assignment.Bind == Bind.Jsonb ? $"@{assignment.Column}::jsonb" : $"@{assignment.Column}";

    private static void AddParameter(DbCommand command, string name, object value, Bind bind)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        if (bind == Bind.Timestamp)
        {
            parameter.DbType = DbType.DateTime2; // Postgres `timestamp` (no tz) — matches Prisma @db.Timestamp.
        }

        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private enum Bind
    {
        Plain,
        Text,
        Timestamp,
        Jsonb,
    }

    private sealed record Assignment(string Column, object Value, Bind Bind);
}
