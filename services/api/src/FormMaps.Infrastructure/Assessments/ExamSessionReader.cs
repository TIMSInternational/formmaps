using System.Data.Common;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Assessments;

/// <summary>
/// Reproduces legacy <c>getSession</c> / <c>getCompletedExams</c> (services/assessmentService.ts)
/// under the caller's read-only RLS session. The session read is a full-row passthrough (reusing the
/// shared <see cref="PcaExamSessionRowMapper"/> full-row projection); the completed-exams read is a
/// column subset with ISO-Z string timestamps.
/// </summary>
public sealed class ExamSessionReader(
    IFormMapsDatabaseSessionFactory databaseSessionFactory) : IExamSessionReader
{
    private static readonly string SessionSql = $"""
        SELECT {PcaExamSessionRowMapper.Columns}
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

    public async Task<PcaHistorySession?> GetSessionAsync(
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

        return PcaExamSessionRowMapper.Map(reader);
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
                    StartTime: PcaExamSessionRowMapper.IsoZ(reader, "startTime")!,
                    EndTime: PcaExamSessionRowMapper.IsoZ(reader, "endTime")));
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
}
