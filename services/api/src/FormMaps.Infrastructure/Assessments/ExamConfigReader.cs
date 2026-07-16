using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getExamInstructions / getExamConfig (assessmentService.ts) under the caller's
/// read-only RLS session. Both project the same pca_exams core; instructions == description, and
/// exam-config drops the separate description key. `type` (PG enum) is cast to text.
/// </summary>
public sealed class ExamConfigReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamConfigReader
{
    private const string CoreSql = """
        SELECT "id", "name", "description", "type"::text AS "type",
               "timeLimitMinutes", "totalQuestions"
        FROM "pca_exams"
        WHERE "id" = @examId
        """;

    public async Task<ExamInstructions?> GetInstructionsAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default)
    {
        var core = await ReadCoreAsync(context, examId, cancellationToken);
        return core is null
            ? null
            : new ExamInstructions(
                core.Id, core.Name, core.Type, core.TimeLimitMinutes, core.Description, core.TotalQuestions,
                Instructions: core.Description);
    }

    public async Task<ExamConfig?> GetConfigAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default)
    {
        var core = await ReadCoreAsync(context, examId, cancellationToken);
        return core is null
            ? null
            : new ExamConfig(
                core.Id, core.Name, core.Type, core.TimeLimitMinutes, core.TotalQuestions,
                Instructions: core.Description);
    }

    private async Task<ExamCoreRow?> ReadCoreAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = CoreSql;

        var parameter = command.CreateParameter();
        parameter.ParameterName = "examId";
        parameter.Value = examId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new ExamCoreRow(
            Id: reader.GetString(reader.GetOrdinal("id")),
            Name: reader.GetString(reader.GetOrdinal("name")),
            Type: reader.GetString(reader.GetOrdinal("type")),
            TimeLimitMinutes: reader.GetInt32(reader.GetOrdinal("timeLimitMinutes")),
            Description: reader.GetString(reader.GetOrdinal("description")),
            TotalQuestions: reader.GetInt32(reader.GetOrdinal("totalQuestions")));
    }

    private sealed record ExamCoreRow(
        string Id,
        string Name,
        string Type,
        int TimeLimitMinutes,
        string Description,
        int TotalQuestions);
}
