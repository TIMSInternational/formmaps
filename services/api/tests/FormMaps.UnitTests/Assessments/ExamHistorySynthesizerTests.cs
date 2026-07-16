using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure history synthesis (legacy getExamHistory): 5 partial LIA rows prepended to the full
/// real rows, dedup-by-examId (synth wins), and the synthesized field values.
/// </summary>
public class ExamHistorySynthesizerTests
{
    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    private static PcaHistorySession Real(string examId, string examType) => new(
        Id: "s-" + examId, ExamId: examId, UserId: "u1", ExamName: "Real", ExamType: examType,
        StartTime: "2026-06-01T00:00:00.000Z", EndTime: "2026-06-01T00:10:00.000Z", TotalTimeSpent: 600,
        TotalQuestions: 10, QuestionsAnswered: 10, CorrectAnswers: 7, IncorrectAnswers: 3,
        UnansweredQuestions: 0, ScorePercentage: 70, AccuracyPercentage: 70, IsTimeExpired: false,
        IsCompleted: true, Status: "Completed", Violations: Json("[]"), ViolationCount: 0,
        FlagForReview: false, IsActive: true, CreatedBy: null, CreatedDate: "2026-06-01T00:00:00.000Z",
        UpdatedBy: null, UpdatedAt: "2026-06-01T00:10:00.000Z");

    private static LiaHistorySource Lia() => new(
        Id: "lia1",
        StartedAt: new DateTime(2026, 7, 1, 8, 0, 0, DateTimeKind.Utc),
        CompletedAt: new DateTime(2026, 7, 1, 8, 30, 0, DateTimeKind.Utc),
        Percentiles: Json("""{"pattern_recognition":63,"verbal_reasoning":10,"numerical_speed":40,"working_memory":30,"visual_rotation":55}"""),
        ResponseCounts: Json("""{"pattern_recognition":{"correct":18,"incorrect":6,"unanswered":0}}"""),
        SubtestTimes: Json("""{"pattern_recognition":{"durationMs":90000}}"""));

    [Fact]
    public void No_lia_is_real_rows_only_with_dedup()
    {
        var a = Real("feature-detection-001", "PatternRecognition");
        var b = Real("verbal-reasoning-001", "VerbalReasoning");
        var dup = Real("feature-detection-001", "PatternRecognition");
        var result = ExamHistorySynthesizer.Build("u1", [a, b, dup], lia: null);

        Assert.Equal(3, result.Sessions.Count);
        Assert.IsType<PcaHistorySession>(result.Sessions[0]);
        Assert.Equal(2, result.Latest.Count); // deduped by examId
    }

    [Fact]
    public void With_lia_prepends_five_synth_rows_in_mil_order()
    {
        var result = ExamHistorySynthesizer.Build("u1", [Real("feature-detection-001", "PatternRecognition")], Lia());

        Assert.Equal(6, result.Sessions.Count); // 5 synth + 1 real
        var synth = result.Sessions.Take(5).Cast<SynthesizedHistoryRow>().ToList();
        Assert.Equal(
            new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" },
            synth.Select(s => s.ExamType).ToArray());
        Assert.Equal(
            new[] { "feature-detection-001", "verbal-reasoning-001", "working-memory-001", "numerical-speed-accuracy-001", "spatial-orientation-001" },
            synth.Select(s => s.ExamId).ToArray());
    }

    [Fact]
    public void Synth_row_values_match_legacy()
    {
        var pr = (SynthesizedHistoryRow)ExamHistorySynthesizer.Build("u1", [], Lia()).Sessions[0];
        Assert.Equal("lia-lia1-pattern_recognition", pr.Id);
        Assert.Equal("u1", pr.UserId);
        Assert.Equal("PatternRecognition", pr.ExamName);
        Assert.Equal(63, pr.ScorePercentage);              // round(percentile)
        Assert.Equal(18, pr.CorrectAnswers);
        Assert.Equal(6, pr.IncorrectAnswers);
        Assert.Equal(24, pr.QuestionsAnswered);            // 18+6
        Assert.Equal(24, pr.TotalQuestions);               // answered + 0 unanswered
        Assert.Equal(75, pr.AccuracyPercentage);           // round(18/24*1000)/10 = 75
        Assert.Equal(90, pr.TotalTimeSpent);               // round(90000/1000)
        Assert.Equal("Completed", pr.Status);
        Assert.True(pr.IsCompleted);
        Assert.Equal("2026-07-01T08:00:00.000Z", pr.StartTime);   // startedAt
        Assert.Equal("2026-07-01T08:30:00.000Z", pr.EndTime);     // completedAt

        // subtest with no counts -> zeros, accuracy 0.
        var vr = (SynthesizedHistoryRow)ExamHistorySynthesizer.Build("u1", [], Lia()).Sessions[1];
        Assert.Equal("VerbalReasoning", vr.ExamType);
        Assert.Equal(10, vr.ScorePercentage);
        Assert.Equal(0, vr.CorrectAnswers);
        Assert.Equal(0, vr.AccuracyPercentage);
        Assert.Equal(0, vr.TotalTimeSpent);
    }

    [Fact]
    public void Latest_dedup_prefers_synth_over_real_for_canonical_examId()
    {
        // real row also has examId feature-detection-001; synth (prepended) wins in `latest`.
        var result = ExamHistorySynthesizer.Build("u1", [Real("feature-detection-001", "PatternRecognition")], Lia());
        Assert.Equal(5, result.Latest.Count); // 5 canonical, real's dup dropped
        Assert.All(result.Latest, r => Assert.IsType<SynthesizedHistoryRow>(r));
    }
}
