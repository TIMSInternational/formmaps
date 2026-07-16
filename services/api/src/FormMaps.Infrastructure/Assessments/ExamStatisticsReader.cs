using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy getExamStatistics' query (assessmentService.ts): every completed+active session
/// for one exam (all users, all schools — exams are global, no school scoping), under read-only RLS.
/// </summary>
public sealed class ExamStatisticsReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamStatisticsReader
{
    private const string Sql = """
        SELECT "scorePercentage", "userId"
        FROM "pca_exam_sessions"
        WHERE "examId" = @examId AND "isCompleted" = true AND "isActive" = true
        """;

    public async Task<IReadOnlyList<ExamScoreRow>> ReadScoresAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = Sql;

        var parameter = command.CreateParameter();
        parameter.ParameterName = "examId";
        parameter.Value = examId;
        command.Parameters.Add(parameter);

        var rows = new List<ExamScoreRow>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(new ExamScoreRow(
                reader.GetDouble(reader.GetOrdinal("scorePercentage")),
                reader.GetString(reader.GetOrdinal("userId"))));
        }

        return rows;
    }
}
