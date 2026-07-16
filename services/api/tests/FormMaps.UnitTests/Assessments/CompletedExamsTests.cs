using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

public class CompletedExamsTests
{
    private static CompletedExamRow Row(string id, string examId, double score) =>
        new(Id: id, ExamId: examId, ExamName: examId, ExamType: "PatternRecognition",
            ScorePercentage: score, StartTime: "2026-06-01T00:00:00.000Z", EndTime: null);

    [Fact]
    public void Dedups_by_exam_id_keeping_first_occurrence()
    {
        // Rows arrive newest-first; the first row per examId (the newest attempt) is kept.
        var sessions = new List<CompletedExamRow>
        {
            Row("s1", "examA", 90), // newest examA
            Row("s2", "examB", 80),
            Row("s3", "examA", 70), // older examA attempt -> dropped from unique
        };

        var result = CompletedExams.FromSessions(sessions);

        Assert.Equal(3, result.Sessions.Count); // full list preserved
        Assert.Equal(2, result.UniqueCompleted.Count);
        Assert.Equal(2, result.Count);
        Assert.Equal("s1", result.UniqueCompleted[0].Id); // newest examA kept
        Assert.Equal("examA", result.UniqueCompleted[0].ExamId);
        Assert.Equal("examB", result.UniqueCompleted[1].ExamId);
    }

    [Fact]
    public void Empty_input_yields_empty_result()
    {
        var result = CompletedExams.FromSessions([]);
        Assert.Empty(result.Sessions);
        Assert.Empty(result.UniqueCompleted);
        Assert.Equal(0, result.Count);
    }
}
