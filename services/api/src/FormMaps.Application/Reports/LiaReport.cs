namespace FormMaps.Application.Reports;

/// <summary>
/// Reproduces the legacy GET /lia/:userId response payload (api/src/routes/report.ts).
/// <see cref="CognitiveProfile"/> keeps the five PascalCase cognitive keys in their legacy
/// insertion order (PatternRecognition, VerbalReasoning, WorkingMemory, NumericVelocity,
/// VisualRotation). Values are the percentile remap (Math.round) when a completed parity LIA
/// session exists, otherwise the per-type exam scorePercentage fallback (raw, may be fractional).
/// The dictionary is serialized with the default (null) DictionaryKeyPolicy so the PascalCase
/// keys are preserved verbatim — matching the legacy object keys exactly.
/// </summary>
public sealed record LiaReport(
    string StudentId,
    string StudentName,
    IReadOnlyDictionary<string, double> CognitiveProfile,
    double OverallScore,
    int CompletedExams,
    int TotalExams,
    IReadOnlyList<string> Strengths,
    IReadOnlyList<string> AreasForGrowth,
    DateTimeOffset GeneratedAt);
