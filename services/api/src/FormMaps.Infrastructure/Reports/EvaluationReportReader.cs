using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Application.Reports;

namespace FormMaps.Infrastructure.Reports;

/// <summary>
/// Reproduces the legacy GET /api/v1/reports/evaluation/:sessionId handler (api/src/routes/report.ts).
/// Runs under the CALLER's read-only RLS session in two phases:
///   1) resolve the evaluation group by id (no isActive filter) so the endpoint can gate access on
///      the group's evaluatedUserId via canAccessUser;
///   2) once access is approved, load the student name and active feedback rows.
///
/// Sensitive group columns (evaluatorEmail, invitationToken, token/email flags) and the feedback
/// evaluatorEmail are never selected. averageRating (Decimal?) is read as trim_scale()::text to
/// reproduce Prisma's decimal.js JSON-string output; feedbackItems (jsonb) is passed through as raw
/// JSON.
/// </summary>
public sealed class EvaluationReportReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IEvaluationReportReader
{
    // findUnique({ where: { id } }) — NO isActive filter (legacy resolves active AND inactive groups).
    // Explicit whitelist: sensitive columns are never selected.
    private const string GroupSql = """
        SELECT
            "id",
            "evaluatedUserId",
            "evaluatorName",
            "groupType",
            "relation",
            "isEvaluationCompleted",
            "evaluationCompletedDate"
        FROM "evaluation_groups"
        WHERE "id" = @sessionId
        """;

    // Legacy select { id, name }; student?.name is optional (null when the row is absent/hidden).
    private const string StudentSql = """
        SELECT "name"
        FROM "users"
        WHERE "id" = @userId
        """;

    // Active feedback only (legacy: where { evaluationGroupId, isActive: true }, NO orderBy).
    // averageRating (Decimal?) -> trim_scale()::text reproduces Prisma's decimal.js toString
    // (canonical, trailing zeros stripped) as a JSON string / null; a numeric(65,30) value would
    // otherwise overflow System.Decimal, so it is deliberately carried as text.
    // feedbackItems (jsonb) -> ::text, re-parsed to a JsonElement so it emits as raw JSON.
    // evaluatorEmail / relation / groupType / isCompleted are never selected (not in the payload).
    private const string FeedbackSql = """
        SELECT
            "id",
            trim_scale("averageRating")::text AS "averageRating",
            "totalQuestions",
            "answeredQuestions",
            "feedbackItems"::text AS "feedbackItems",
            "completedAt"
        FROM "evaluation_feedbacks"
        WHERE "evaluationGroupId" = @groupId AND "isActive" = true
        """;

    public async Task<EvaluationGroupCore?> ResolveGroupAsync(
        RequestContext requestContext,
        string sessionId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);

        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = GroupSql;
        AddParameter(command, "sessionId", sessionId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new EvaluationGroupCore(
            GroupId: reader.GetString(reader.GetOrdinal("id")),
            EvaluatedUserId: reader.GetString(reader.GetOrdinal("evaluatedUserId")),
            EvaluatorName: reader.GetString(reader.GetOrdinal("evaluatorName")),
            GroupType: reader.GetString(reader.GetOrdinal("groupType")),
            Relation: reader.GetString(reader.GetOrdinal("relation")),
            IsCompleted: reader.GetBoolean(reader.GetOrdinal("isEvaluationCompleted")),
            CompletedDate: ReadNullableDateTimeOffsetUtc(reader, "evaluationCompletedDate"));
    }

    public async Task<EvaluationReport> ReadReportAsync(
        RequestContext requestContext,
        EvaluationGroupCore group,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            requestContext,
            cancellationToken);

        // 1) Student name — optional, matching legacy student?.name.
        string? studentName = null;
        await using (var studentCommand = session.Connection.CreateCommand())
        {
            studentCommand.Transaction = session.Transaction;
            studentCommand.CommandText = StudentSql;
            AddParameter(studentCommand, "userId", group.EvaluatedUserId);

            await using var studentReader = await studentCommand.ExecuteReaderAsync(cancellationToken);
            if (await studentReader.ReadAsync(cancellationToken))
            {
                studentName = ReadNullableString(studentReader, "name");
            }
        }

        // 2) Active feedback rows (unordered, matching the legacy findMany without orderBy).
        var feedback = new List<EvaluationFeedbackEntry>();
        await using (var feedbackCommand = session.Connection.CreateCommand())
        {
            feedbackCommand.Transaction = session.Transaction;
            feedbackCommand.CommandText = FeedbackSql;
            AddParameter(feedbackCommand, "groupId", group.GroupId);

            await using var feedbackReader = await feedbackCommand.ExecuteReaderAsync(cancellationToken);
            while (await feedbackReader.ReadAsync(cancellationToken))
            {
                feedback.Add(new EvaluationFeedbackEntry(
                    Id: feedbackReader.GetString(feedbackReader.GetOrdinal("id")),
                    AverageRating: ReadNullableString(feedbackReader, "averageRating"),
                    TotalQuestions: feedbackReader.GetInt32(feedbackReader.GetOrdinal("totalQuestions")),
                    AnsweredQuestions: feedbackReader.GetInt32(feedbackReader.GetOrdinal("answeredQuestions")),
                    FeedbackItems: ReadJson(feedbackReader, "feedbackItems"),
                    CompletedAt: ReadNullableDateTimeOffsetUtc(feedbackReader, "completedAt")));
            }
        }

        return new EvaluationReport(
            GroupId: group.GroupId,
            StudentId: group.EvaluatedUserId,
            StudentName: studentName,
            EvaluatorName: group.EvaluatorName,
            GroupType: group.GroupType,
            Relation: group.Relation,
            IsCompleted: group.IsCompleted,
            CompletedDate: group.CompletedDate,
            Feedback: feedback,
            GeneratedAt: DateTimeOffset.UtcNow);
    }

    private static void AddParameter(DbCommand command, string name, string value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    // feedbackItems is non-nullable (Json @default("[]")); the "[]" fallback is a defensive guard.
    // Parse-then-reserialize strips Postgres jsonb::text spacing and preserves key order, matching
    // legacy's compact JSON.stringify. Known micro-divergence: JsonElement.WriteTo preserves the raw
    // numeric token, so a jsonb value like 5.0 emits "5.0" whereas legacy round-trips through a JS
    // number and emits "5". Unreachable for the integer 1-5 rating payloads this field carries.
    private static JsonElement ReadJson(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var raw = reader.IsDBNull(ordinal) ? "[]" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static DateTimeOffset? ReadNullableDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
