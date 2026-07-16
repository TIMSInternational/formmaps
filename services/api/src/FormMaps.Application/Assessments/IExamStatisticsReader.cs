using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Reads the score + user of every completed+active session for one exam (legacy getExamStatistics
/// input), under the caller's read-only RLS session. Aggregation is a pure step (<see cref="ExamStatistics"/>).
/// </summary>
public interface IExamStatisticsReader
{
    Task<IReadOnlyList<ExamScoreRow>> ReadScoresAsync(
        RequestContext context,
        string examId,
        CancellationToken cancellationToken = default);
}
