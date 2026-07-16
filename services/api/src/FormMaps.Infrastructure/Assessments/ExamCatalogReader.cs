using System.Data.Common;
using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy listExams / getExamWithQuestions (services/assessmentService.ts) under the
/// caller's read-only RLS session. The question SELECT deliberately OMITS correctAnswer and
/// explanation so the answer key can never leave the server (legacy strips them in code).
/// </summary>
public sealed class ExamCatalogReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamCatalogReader
{
    // Legacy: pCAExam.findMany({ where: { isActive: true } }) — no orderBy.
    private const string ListExamsSql = """
        SELECT "id", "name", "description", "type"::text AS "type", "timeLimitMinutes",
               "totalQuestions", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "pca_exams"
        WHERE "isActive" = true
        """;

    private const string ExamSql = """
        SELECT "id", "name", "description", "type"::text AS "type", "timeLimitMinutes",
               "totalQuestions", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "pca_exams"
        WHERE "id" = @examId
        """;

    // Answer key EXCLUDED: correctAnswer + explanation are never selected. isActive questions only,
    // ordered by questionNumber ASC (legacy include order).
    private const string QuestionsSql = """
        SELECT "id", "examId", "questionNumber", "questionText", "type"::text AS "type",
               "data"::text AS "data", "isActive", "createdBy", "createdDate", "updatedBy", "updatedAt"
        FROM "pca_questions"
        WHERE "examId" = @examId AND "isActive" = true
        ORDER BY "questionNumber" ASC
        """;

    public async Task<IReadOnlyList<ExamSummary>> ListExamsAsync(
        RequestContext context,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = ListExamsSql;

        var exams = new List<ExamSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            exams.Add(ReadExamSummary(reader));
        }

        return exams;
    }

    public async Task<ExamWithQuestions?> GetExamWithQuestionsAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);

        ExamSummary exam;
        await using (var examCommand = session.Connection.CreateCommand())
        {
            examCommand.Transaction = session.Transaction;
            examCommand.CommandText = ExamSql;
            AddParameter(examCommand, "examId", examId);

            await using var reader = await examCommand.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                return null;
            }

            exam = ReadExamSummary(reader);
        }

        var questions = new List<ExamQuestion>();
        await using (var questionsCommand = session.Connection.CreateCommand())
        {
            questionsCommand.Transaction = session.Transaction;
            questionsCommand.CommandText = QuestionsSql;
            AddParameter(questionsCommand, "examId", examId);

            await using var reader = await questionsCommand.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                questions.Add(new ExamQuestion(
                    Id: reader.GetString(reader.GetOrdinal("id")),
                    ExamId: reader.GetString(reader.GetOrdinal("examId")),
                    QuestionNumber: reader.GetInt32(reader.GetOrdinal("questionNumber")),
                    QuestionText: reader.GetString(reader.GetOrdinal("questionText")),
                    Type: reader.GetString(reader.GetOrdinal("type")),
                    Data: ReadJson(reader, "data"),
                    IsActive: reader.GetBoolean(reader.GetOrdinal("isActive")),
                    CreatedBy: ReadNullableString(reader, "createdBy"),
                    CreatedDate: ReadDateTimeOffsetUtc(reader, "createdDate"),
                    UpdatedBy: ReadNullableString(reader, "updatedBy"),
                    UpdatedAt: ReadDateTimeOffsetUtc(reader, "updatedAt")));
            }
        }

        return new ExamWithQuestions(
            Id: exam.Id,
            Name: exam.Name,
            Description: exam.Description,
            Type: exam.Type,
            TimeLimitMinutes: exam.TimeLimitMinutes,
            TotalQuestions: exam.TotalQuestions,
            IsActive: exam.IsActive,
            CreatedBy: exam.CreatedBy,
            CreatedDate: exam.CreatedDate,
            UpdatedBy: exam.UpdatedBy,
            UpdatedAt: exam.UpdatedAt,
            Questions: questions);
    }

    private static ExamSummary ReadExamSummary(DbDataReader reader) => new(
        Id: reader.GetString(reader.GetOrdinal("id")),
        Name: reader.GetString(reader.GetOrdinal("name")),
        Description: reader.GetString(reader.GetOrdinal("description")),
        Type: reader.GetString(reader.GetOrdinal("type")),
        TimeLimitMinutes: reader.GetInt32(reader.GetOrdinal("timeLimitMinutes")),
        TotalQuestions: reader.GetInt32(reader.GetOrdinal("totalQuestions")),
        IsActive: reader.GetBoolean(reader.GetOrdinal("isActive")),
        CreatedBy: ReadNullableString(reader, "createdBy"),
        CreatedDate: ReadDateTimeOffsetUtc(reader, "createdDate"),
        UpdatedBy: ReadNullableString(reader, "updatedBy"),
        UpdatedAt: ReadDateTimeOffsetUtc(reader, "updatedAt"));

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

    private static JsonElement ReadJson(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        var raw = reader.IsDBNull(ordinal) ? "null" : reader.GetString(ordinal);
        using var document = JsonDocument.Parse(raw);
        return document.RootElement.Clone();
    }

    private static DateTimeOffset ReadDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var value = reader.GetDateTime(reader.GetOrdinal(name));
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
