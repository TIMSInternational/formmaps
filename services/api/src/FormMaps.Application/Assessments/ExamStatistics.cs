namespace FormMaps.Application.Assessments;

/// <summary>A completed exam session's score + user (input to the statistics aggregate).</summary>
public sealed record ExamScoreRow(double Score, string UserId);

/// <summary>getExamStatistics result — camelCase on the wire.</summary>
public sealed record ExamStatisticsDto(
    string ExamId,
    int TotalAttempts,
    double AverageScore,
    double HighestScore,
    double LowestScore,
    int UniqueUsers);

/// <summary>
/// Pure port of legacy getExamStatistics (assessmentService.ts): aggregate over completed+active
/// sessions for one exam. averageScore = Math.round(avg*10)/10 (JS half-up ≡ AwayFromZero on the
/// non-negative score domain); highest/lowest are the raw floats; empty -> all zeros.
/// </summary>
public static class ExamStatistics
{
    public static ExamStatisticsDto Compute(string examId, IReadOnlyList<ExamScoreRow> rows)
    {
        if (rows.Count == 0)
        {
            return new ExamStatisticsDto(examId, 0, 0, 0, 0, 0);
        }

        double sum = 0;
        var max = rows[0].Score;
        var min = rows[0].Score;
        var users = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            sum += row.Score;
            if (row.Score > max) max = row.Score;
            if (row.Score < min) min = row.Score;
            users.Add(row.UserId);
        }

        var average = Math.Round(sum / rows.Count * 10, MidpointRounding.AwayFromZero) / 10;

        return new ExamStatisticsDto(examId, rows.Count, average, max, min, users.Count);
    }
}
