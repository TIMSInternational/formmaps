using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the pure MIL synthesis (legacy getMilResults, assessmentService.ts:255-364): the primary
/// path (from the newest completed LIA session's percentiles) and the pca_exam_sessions fallback,
/// including the never-404 "synthesize zeros" behavior and the exam ordering / remaps.
/// </summary>
public class MilResultsSynthesizerTests
{
    private static JsonElement Json(string raw)
    {
        using var doc = JsonDocument.Parse(raw);
        return doc.RootElement.Clone();
    }

    // ---- primary (LIA session) ----

    [Fact]
    public void Primary_maps_five_exams_in_mil_exam_map_order()
    {
        var result = Primary();
        Assert.Equal(
            new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" },
            result.ExamResults.Select(e => e.ExamType).ToArray());
        Assert.Equal(
            new[] { "feature-detection-001", "verbal-reasoning-001", "working-memory-001", "numerical-speed-accuracy-001", "spatial-orientation-001" },
            result.ExamResults.Select(e => e.ExamId).ToArray());
    }

    [Fact]
    public void Primary_exam_uses_rounded_percentile_and_counts()
    {
        var pr = Primary().ExamResults[0]; // PatternRecognition, subtest pattern_recognition = 63
        Assert.Equal("completed", pr.Status);
        Assert.Equal(63, pr.Percentile);
        Assert.Equal(63, pr.Score);
        Assert.Equal(63, pr.ScorePercentage);
        Assert.Equal(20, pr.CorrectAnswers);
        Assert.Equal(10, pr.IncorrectAnswers);
        Assert.Equal(30, pr.TotalQuestions); // 20 + 10 + 0 unanswered
        Assert.Equal(0, pr.TimeSpent);
        Assert.Equal("2026-07-16T12:20:00.000Z", pr.CompletedAt);
    }

    [Fact]
    public void Primary_overall_is_global_percentile_one_decimal_and_five_of_five()
    {
        var result = Primary(); // globalPercentile 39.35
        Assert.Equal(39.4, result.OverallScore);
        Assert.Equal(5, result.CompletedExams);
        Assert.Equal(5, result.TotalExams);
        Assert.Equal("2026-07-16T12:20:00.000Z", result.LastCompletedAt);
    }

    [Fact]
    public void Primary_cognitive_profile_reads_snake_keys_to_camel()
    {
        var p = Primary().CognitiveProfile;
        Assert.Equal(63, p.PatternRecognition);
        Assert.Equal(10, p.VerbalReasoning);
        Assert.Equal(30, p.WorkingMemory);
        Assert.Equal(40, p.NumericVelocity); // from numerical_speed
        Assert.Equal(55, p.VisualRotation);
    }

    [Fact]
    public void Primary_weighted_composite_matches_scoring()
    {
        // scores PR63 VR55 NV40 WM30 Verbal10 -> raw 119.6 -> 120; exactPercent 39.87 -> 40; Bajo.
        var c = Primary().WeightedComposite;
        Assert.Equal(120, c.Raw);
        Assert.Equal(40, c.Percent);
        Assert.Equal("Bajo", c.Band);
    }

    private static MilResults Primary() =>
        MilResultsSynthesizer.FromLiaSession(
            userId: "u1",
            percentiles: Json("""{"pattern_recognition":63,"verbal_reasoning":10,"numerical_speed":40,"working_memory":30,"visual_rotation":55}"""),
            responseCounts: Json("""{"pattern_recognition":{"correct":20,"incorrect":10,"unanswered":0}}"""),
            globalPercentile: 39.35,
            completedAt: new DateTime(2026, 7, 16, 12, 20, 0, DateTimeKind.Utc));

    // ---- fallback (pca_exam_sessions) ----

    [Fact]
    public void Fallback_prefers_completed_and_computes_average_overall()
    {
        var rows = new List<MilExamSessionRow>
        {
            new("spatial-orientation-001", "Spatial", "VisualRotation", IsCompleted: true, ScorePercentage: 80,
                CorrectAnswers: 24, IncorrectAnswers: 6, TotalQuestions: 30,
                EndTime: new DateTime(2026, 7, 15, 9, 0, 0, DateTimeKind.Utc), TimeSpent: 1200),
            new("feature-detection-001", "", "PatternRecognition", IsCompleted: false, ScorePercentage: 0,
                CorrectAnswers: 0, IncorrectAnswers: 0, TotalQuestions: 0, EndTime: null, TimeSpent: 0),
        };
        var result = MilResultsSynthesizer.FromExamSessions("u1", rows);

        var byType = result.ExamResults.ToDictionary(e => e.ExamType);
        Assert.Equal("completed", byType["VisualRotation"].Status);
        Assert.Equal(80, byType["VisualRotation"].Score);
        Assert.Null(byType["VisualRotation"].Percentile); // fallback percentile always null
        Assert.Equal("Spatial", byType["VisualRotation"].ExamName);
        Assert.Equal("in_progress", byType["PatternRecognition"].Status);
        Assert.Equal("PatternRecognition", byType["PatternRecognition"].ExamName); // empty examName -> type
        Assert.Equal("not_started", byType["VerbalReasoning"].Status);

        Assert.Equal(1, result.CompletedExams);
        Assert.Equal(80, result.OverallScore); // avg of the single completed
        Assert.Equal("2026-07-15T09:00:00.000Z", result.LastCompletedAt); // rows[0].endTime
        Assert.Equal(80, result.CognitiveProfile.VisualRotation);
        Assert.Equal(27, result.WeightedComposite.Percent); // raw 80 -> exact 26.67 -> 27, Bajo
    }

    [Fact]
    public void Empty_synthesizes_zeros_and_never_throws()
    {
        var result = MilResultsSynthesizer.FromExamSessions("u1", new List<MilExamSessionRow>());

        Assert.Equal(5, result.ExamResults.Count);
        Assert.All(result.ExamResults, e =>
        {
            Assert.Equal("not_started", e.Status);
            Assert.Equal(0, e.Score);
            Assert.Null(e.Percentile);
        });
        Assert.Equal(0, result.OverallScore);
        Assert.Equal(0, result.CompletedExams);
        Assert.Equal(5, result.TotalExams);
        Assert.Null(result.LastCompletedAt);
        Assert.Equal(0, result.CognitiveProfile.PatternRecognition);
        Assert.Equal("Insuficiente", result.WeightedComposite.Band);
    }
}
