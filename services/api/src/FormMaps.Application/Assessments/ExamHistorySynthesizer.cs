using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure port of legacy getExamHistory (assessmentService.ts:127-184): prepend 5 synthesized per-subtest
/// rows (from the newest completed LIA session) to the full real pca_exam_sessions rows, then dedup
/// by examId (synth first, so it wins) for the `latest` view. Never throws / 404s.
/// </summary>
public static class ExamHistorySynthesizer
{
    // ExamType -> (canonical examId, LIA subtest key), in legacy MIL_EXAM_MAP iteration order.
    private static readonly (string Type, string CanonicalId, string Subtest)[] ExamMap =
    [
        ("PatternRecognition", "feature-detection-001", "pattern_recognition"),
        ("VerbalReasoning", "verbal-reasoning-001", "verbal_reasoning"),
        ("WorkingMemory", "working-memory-001", "working_memory"),
        ("NumericVelocity", "numerical-speed-accuracy-001", "numerical_speed"),
        ("VisualRotation", "spatial-orientation-001", "visual_rotation"),
    ];

    public static ExamHistory Build(string userId, IReadOnlyList<PcaHistorySession> realSessions, LiaHistorySource? lia)
    {
        var all = new List<object>();

        if (lia is not null)
        {
            var startIso = ToIsoZ(lia.StartedAt ?? lia.CompletedAt);
            var endIso = ToIsoZ(lia.CompletedAt);
            foreach (var (type, canonicalId, subtest) in ExamMap)
            {
                var correct = ReadCount(lia.ResponseCounts, subtest, "correct");
                var incorrect = ReadCount(lia.ResponseCounts, subtest, "incorrect");
                var unanswered = ReadCount(lia.ResponseCounts, subtest, "unanswered");
                var answered = correct + incorrect;
                var pct = Math.Round(ReadNumber(lia.Percentiles, subtest), MidpointRounding.AwayFromZero);
                var durationMs = ReadDurationMs(lia.SubtestTimes, subtest);

                all.Add(new SynthesizedHistoryRow(
                    Id: $"lia-{lia.Id}-{subtest}",
                    ExamId: canonicalId,
                    UserId: userId,
                    ExamName: type,
                    ExamType: type,
                    StartTime: startIso!,
                    EndTime: endIso,
                    TotalTimeSpent: (int)Math.Round(durationMs / 1000, MidpointRounding.AwayFromZero),
                    TotalQuestions: answered + unanswered,
                    QuestionsAnswered: answered,
                    CorrectAnswers: correct,
                    IncorrectAnswers: incorrect,
                    UnansweredQuestions: unanswered,
                    ScorePercentage: pct,
                    AccuracyPercentage: answered > 0
                        ? Math.Round((double)correct / answered * 1000, MidpointRounding.AwayFromZero) / 10
                        : 0,
                    IsTimeExpired: false,
                    IsCompleted: true,
                    Status: "Completed"));
            }
        }

        foreach (var row in realSessions)
        {
            all.Add(row);
        }

        var latest = new List<object>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in all)
        {
            if (seen.Add(ExamIdOf(row)))
            {
                latest.Add(row);
            }
        }

        return new ExamHistory(all, latest);
    }

    private static string ExamIdOf(object row) => row switch
    {
        SynthesizedHistoryRow s => s.ExamId,
        PcaHistorySession p => p.ExamId,
        _ => throw new InvalidOperationException("Unknown history row type"),
    };

    private static double ReadNumber(JsonElement obj, string key) =>
        obj.ValueKind == JsonValueKind.Object && obj.TryGetProperty(key, out var el) && el.ValueKind == JsonValueKind.Number
            ? el.GetDouble() : 0;

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

    private static double ReadDurationMs(JsonElement times, string subtest)
    {
        if (times.ValueKind == JsonValueKind.Object
            && times.TryGetProperty(subtest, out var entry)
            && entry.ValueKind == JsonValueKind.Object
            && entry.TryGetProperty("durationMs", out var value)
            && value.ValueKind == JsonValueKind.Number)
        {
            return value.GetDouble();
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
