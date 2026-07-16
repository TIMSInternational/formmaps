using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>getSession</c> / <c>getCompletedExams</c> (services/assessmentService.ts)
/// under the caller's read-only RLS session. The session read is a full-row passthrough; the
/// @map'd columns violation_count / flag_for_review are aliased to the Prisma field names, enum
/// columns are cast to text, and the violations jsonb is passed through as raw JSON.
/// </summary>
public sealed class ExamSessionReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamSessionReader
{
    private const string SessionSql = """
        SELECT
            "id", "examId", "userId", "examName", "examType"::text AS "examType",
            "startTime", "endTime", "totalTimeSpent", "totalQuestions", "questionsAnswered",
            "correctAnswers", "incorrectAnswers", "unansweredQuestions", "scorePercentage",
            "accuracyPercentage", "isTimeExpired", "isCompleted", "status"::text AS "status",
            "violations"::text AS "violations", "violation_count" AS "violationCount",
            "flag_for_review" AS "flagForReview", "isActive", "createdBy", "createdDate",
            "updatedBy", "updatedAt"
        FROM "pca_exam_sessions"
        WHERE "id" = @sessionId
        """;

    // Legacy: where { userId, isCompleted: true, isActive: true }, orderBy startTime desc,
    // select { id, examId, examName, examType, scorePercentage, startTime, endTime }.
    private const string CompletedSql = """
        SELECT "id", "examId", "examName", "examType"::text AS "examType",
               "scorePercentage", "startTime", "endTime"
        FROM "pca_exam_sessions"
        WHERE "userId" = @userId AND "isCompleted" = true AND "isActive" = true
        ORDER BY "startTime" DESC
        """;

    public async Task<ExamSession?> GetSessionAsync(
        RequestContext context,
        string sessionId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SessionSql;
        AddParameter(command, "sessionId", sessionId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new ExamSession(
            Id: reader.GetString(reader.GetOrdinal("id")),
            ExamId: reader.GetString(reader.GetOrdinal("examId")),
            UserId: reader.GetString(reader.GetOrdinal("userId")),
            ExamName: reader.GetString(reader.GetOrdinal("examName")),
            ExamType: reader.GetString(reader.GetOrdinal("examType")),
            StartTime: ReadDateTimeOffsetUtc(reader, "startTime"),
            EndTime: ReadNullableDateTimeOffsetUtc(reader, "endTime"),
            TotalTimeSpent: ReadNullableInt(reader, "totalTimeSpent"),
            TotalQuestions: reader.GetInt32(reader.GetOrdinal("totalQuestions")),
            QuestionsAnswered: reader.GetInt32(reader.GetOrdinal("questionsAnswered")),
            CorrectAnswers: reader.GetInt32(reader.GetOrdinal("correctAnswers")),
            IncorrectAnswers: reader.GetInt32(reader.GetOrdinal("incorrectAnswers")),
            UnansweredQuestions: reader.GetInt32(reader.GetOrdinal("unansweredQuestions")),
            ScorePercentage: reader.GetDouble(reader.GetOrdinal("scorePercentage")),
            AccuracyPercentage: reader.GetDouble(reader.GetOrdinal("accuracyPercentage")),
            IsTimeExpired: reader.GetBoolean(reader.GetOrdinal("isTimeExpired")),
            IsCompleted: reader.GetBoolean(reader.GetOrdinal("isCompleted")),
            Status: reader.GetString(reader.GetOrdinal("status")),
            Violations: ReadNullableJson(reader, "violations"),
            ViolationCount: reader.GetInt32(reader.GetOrdinal("violationCount")),
            FlagForReview: reader.GetBoolean(reader.GetOrdinal("flagForReview")),
            IsActive: reader.GetBoolean(reader.GetOrdinal("isActive")),
            CreatedBy: ReadNullableString(reader, "createdBy"),
            CreatedDate: ReadDateTimeOffsetUtc(reader, "createdDate"),
            UpdatedBy: ReadNullableString(reader, "updatedBy"),
            UpdatedAt: ReadDateTimeOffsetUtc(reader, "updatedAt"));
    }

    public async Task<CompletedExams> GetCompletedExamsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = CompletedSql;
        AddParameter(command, "userId", userId);

        var sessions = new List<CompletedExamRow>();
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                sessions.Add(new CompletedExamRow(
                    Id: reader.GetString(reader.GetOrdinal("id")),
                    ExamId: reader.GetString(reader.GetOrdinal("examId")),
                    ExamName: reader.GetString(reader.GetOrdinal("examName")),
                    ExamType: reader.GetString(reader.GetOrdinal("examType")),
                    ScorePercentage: reader.GetDouble(reader.GetOrdinal("scorePercentage")),
                    StartTime: ReadDateTimeOffsetUtc(reader, "startTime"),
                    EndTime: ReadNullableDateTimeOffsetUtc(reader, "endTime")));
            }
        }

        return CompletedExams.FromSessions(sessions);
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

    private static int? ReadNullableInt(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
    }

    private static JsonElement? ReadNullableJson(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        using var document = JsonDocument.Parse(reader.GetString(ordinal));
        return document.RootElement.Clone();
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var value = reader.GetDateTime(reader.GetOrdinal(name));
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
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
