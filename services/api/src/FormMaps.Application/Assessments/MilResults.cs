namespace FormMaps.Application.Assessments;

/// <summary>
/// Synthesized MIL results payload (legacy getMilResults). All keys are camelCase on the wire (the
/// app's default JSON policy maps these PascalCase properties to camelCase), matching the legacy
/// object literal. Timestamps are pre-formatted JS-toISOString strings.
/// </summary>
public sealed record MilResults(
    string UserId,
    double OverallScore,
    int CompletedExams,
    int TotalExams,
    string? LastCompletedAt,
    IReadOnlyList<MilExamResult> ExamResults,
    MilCompositeResult WeightedComposite,
    MilCognitiveProfile CognitiveProfile);

public sealed record MilExamResult(
    string ExamId,
    string ExamName,
    string ExamType,
    string Status,
    double ScorePercentage,
    double Score,
    double? Percentile,
    int CorrectAnswers,
    int IncorrectAnswers,
    int TotalQuestions,
    string? CompletedAt,
    int TimeSpent);

public sealed record MilCognitiveProfile(
    double PatternRecognition,
    double VerbalReasoning,
    double WorkingMemory,
    double NumericVelocity,
    double VisualRotation);

/// <summary>A pca_exam_sessions row consumed by the MIL fallback synthesis.</summary>
public sealed record MilExamSessionRow(
    string ExamId,
    string ExamName,
    string ExamType,
    bool IsCompleted,
    double ScorePercentage,
    int CorrectAnswers,
    int IncorrectAnswers,
    int TotalQuestions,
    DateTime? EndTime,
    int TimeSpent);
