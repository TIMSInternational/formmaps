using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Golden tests for the pure exam-statistics aggregate (legacy getExamStatistics,
/// assessmentService.ts): totalAttempts, averageScore = round(avg*10)/10, highest/lowest raw, and
/// uniqueUsers. Empty -> all zeros.
/// </summary>
public class ExamStatisticsTests
{
    private static ExamScoreRow Row(double score, string userId) => new(score, userId);

    [Fact]
    public void Empty_is_all_zeros()
    {
        var s = ExamStatistics.Compute("exam-1", []);
        Assert.Equal("exam-1", s.ExamId);
        Assert.Equal(0, s.TotalAttempts);
        Assert.Equal(0, s.AverageScore);
        Assert.Equal(0, s.HighestScore);
        Assert.Equal(0, s.LowestScore);
        Assert.Equal(0, s.UniqueUsers);
    }

    [Fact]
    public void Aggregates_count_avg_max_min_unique()
    {
        var s = ExamStatistics.Compute("exam-1", [Row(90, "u1"), Row(80, "u2"), Row(70, "u1")]);
        Assert.Equal(3, s.TotalAttempts);
        Assert.Equal(80, s.AverageScore); // (90+80+70)/3 = 80
        Assert.Equal(90, s.HighestScore);
        Assert.Equal(70, s.LowestScore);
        Assert.Equal(2, s.UniqueUsers); // u1 counted once
    }

    [Fact]
    public void AverageScore_rounds_half_up_to_one_decimal()
    {
        // (66.6 + 66.7)/2 = 66.65 -> *10 = 666.5 -> round half-up 667 -> 66.7 (JS Math.round parity).
        var s = ExamStatistics.Compute("exam-1", [Row(66.6, "u1"), Row(66.7, "u2")]);
        Assert.Equal(66.7, s.AverageScore);
        // highest/lowest are the raw (unrounded) floats.
        Assert.Equal(66.7, s.HighestScore);
        Assert.Equal(66.6, s.LowestScore);
    }
}
