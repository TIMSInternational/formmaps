using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure MIL synthesis — the port of legacy getMilResults (assessmentService.ts:255-364). There is no
/// MIL table; results are derived. <see cref="FromLiaSession"/> is the tims-parity primary path (fed
/// the newest completed LIA session's percentiles); <see cref="FromExamSessions"/> is the legacy
/// pca_exam_sessions fallback. Neither ever throws / 404s on missing data — a user with nothing gets
/// a fully-populated zeros DTO (the endpoint only 404s on access denial).
/// </summary>
public static class MilResultsSynthesizer
{
    // ExamType -> canonical examId, in the legacy Object.entries iteration order (examResults order).
    private static readonly (string Type, string CanonicalId, string Subtest)[] ExamMap =
    [
        ("PatternRecognition", "feature-detection-001", "pattern_recognition"),
        ("VerbalReasoning", "verbal-reasoning-001", "verbal_reasoning"),
        ("WorkingMemory", "working-memory-001", "working_memory"),
        ("NumericVelocity", "numerical-speed-accuracy-001", "numerical_speed"),
        ("VisualRotation", "spatial-orientation-001", "visual_rotation"),
    ];

    public static MilResults FromLiaSession(
        string userId,
        JsonElement percentiles,
        JsonElement responseCounts,
        double globalPercentile,
        DateTime? completedAt)
    {
        var completedIso = ToIsoZ(completedAt);

        var examResults = new List<MilExamResult>(ExamMap.Length);
        foreach (var (type, canonicalId, subtest) in ExamMap)
        {
            var percentile = Math.Round(ReadNumber(percentiles, subtest), MidpointRounding.AwayFromZero);
            var correct = ReadCount(responseCounts, subtest, "correct");
            var incorrect = ReadCount(responseCounts, subtest, "incorrect");
            var unanswered = ReadCount(responseCounts, subtest, "unanswered");

            examResults.Add(new MilExamResult(
                ExamId: canonicalId,
                ExamName: type,
                ExamType: type,
                Status: "completed",
                ScorePercentage: percentile,
                Score: percentile,
                Percentile: percentile,
                CorrectAnswers: correct,
                IncorrectAnswers: incorrect,
                TotalQuestions: correct + incorrect + unanswered,
                CompletedAt: completedIso,
                TimeSpent: 0));
        }

        return new MilResults(
            UserId: userId,
            OverallScore: RoundToOneDecimal(globalPercentile),
            CompletedExams: 5,
            TotalExams: 5,
            LastCompletedAt: completedIso,
            ExamResults: examResults,
            WeightedComposite: MilComposite.Compute(ScoresByType(examResults)),
            CognitiveProfile: new MilCognitiveProfile(
                PatternRecognition: Math.Round(ReadNumber(percentiles, "pattern_recognition"), MidpointRounding.AwayFromZero),
                VerbalReasoning: Math.Round(ReadNumber(percentiles, "verbal_reasoning"), MidpointRounding.AwayFromZero),
                WorkingMemory: Math.Round(ReadNumber(percentiles, "working_memory"), MidpointRounding.AwayFromZero),
                NumericVelocity: Math.Round(ReadNumber(percentiles, "numerical_speed"), MidpointRounding.AwayFromZero),
                VisualRotation: Math.Round(ReadNumber(percentiles, "visual_rotation"), MidpointRounding.AwayFromZero)));
    }

    public static MilResults FromExamSessions(string userId, IReadOnlyList<MilExamSessionRow> sessions)
    {
        var examResults = new List<MilExamResult>(ExamMap.Length);
        foreach (var (type, canonicalId, _) in ExamMap)
        {
            // Prefer the latest COMPLETED session (rows are newest-first); else the first match; else none.
            var matches = sessions.Where(s => s.ExamType == type || s.ExamId == canonicalId).ToList();
            var session = matches.FirstOrDefault(s => s.IsCompleted) ?? matches.FirstOrDefault();

            var status = session is null ? "not_started" : session.IsCompleted ? "completed" : "in_progress";
            var score = TruthyOrZero(session?.ScorePercentage);

            examResults.Add(new MilExamResult(
                ExamId: canonicalId,
                ExamName: !string.IsNullOrEmpty(session?.ExamName) ? session!.ExamName : type,
                ExamType: type,
                Status: status,
                ScorePercentage: score,
                Score: score,
                Percentile: null,
                CorrectAnswers: session?.CorrectAnswers ?? 0,
                IncorrectAnswers: session?.IncorrectAnswers ?? 0,
                TotalQuestions: session?.TotalQuestions ?? 0,
                CompletedAt: ToIsoZ(session?.EndTime),
                TimeSpent: session?.TimeSpent ?? 0));
        }

        var completed = examResults.Where(e => e.Status == "completed").ToList();
        var overall = completed.Count > 0 ? completed.Sum(e => e.Score) / completed.Count : 0;

        return new MilResults(
            UserId: userId,
            OverallScore: RoundToOneDecimal(overall),
            CompletedExams: completed.Count,
            TotalExams: 5,
            LastCompletedAt: ToIsoZ(sessions.Count > 0 ? sessions[0].EndTime : null),
            ExamResults: examResults,
            WeightedComposite: MilComposite.Compute(ScoresByType(examResults)),
            CognitiveProfile: new MilCognitiveProfile(
                PatternRecognition: ScoreOf(examResults, "PatternRecognition"),
                VerbalReasoning: ScoreOf(examResults, "VerbalReasoning"),
                WorkingMemory: ScoreOf(examResults, "WorkingMemory"),
                NumericVelocity: ScoreOf(examResults, "NumericVelocity"),
                VisualRotation: ScoreOf(examResults, "VisualRotation")));
    }

    private static IReadOnlyDictionary<string, double> ScoresByType(IReadOnlyList<MilExamResult> examResults)
    {
        var map = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var e in examResults)
        {
            map[e.ExamType] = e.Score;
        }

        return map;
    }

    private static double ScoreOf(IReadOnlyList<MilExamResult> examResults, string type) =>
        TruthyOrZero(examResults.FirstOrDefault(e => e.ExamType == type)?.Score);

    // JS `x || 0`: any non-truthy number (0, NaN, missing) collapses to 0.
    private static double TruthyOrZero(double? value) =>
        value is { } v && v != 0 && !double.IsNaN(v) ? v : 0;

    // Math.round(globalPercentile * 10) / 10 — one-decimal display rounding.
    private static double RoundToOneDecimal(double value) =>
        Math.Round(value * 10, MidpointRounding.AwayFromZero) / 10;

    // percentiles[key] ?? 0 (raw jsonb number).
    private static double ReadNumber(JsonElement obj, string key) =>
        obj.ValueKind == JsonValueKind.Object
        && obj.TryGetProperty(key, out var el)
        && el.ValueKind == JsonValueKind.Number
            ? el.GetDouble()
            : 0;

    // responseCounts[subtest]?.<field> ?? 0.
    private static int ReadCount(JsonElement counts, string subtest, string field)
    {
        if (counts.ValueKind == JsonValueKind.Object
            && counts.TryGetProperty(subtest, out var entry)
            && entry.ValueKind == JsonValueKind.Object
            && entry.TryGetProperty(field, out var value)
            && value.ValueKind == JsonValueKind.Number)
        {
            return value.GetInt32();
        }

        return 0;
    }

    private static string? ToIsoZ(DateTime? value)
    {
        if (value is null)
        {
            return null;
        }

        var utc = DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
}
