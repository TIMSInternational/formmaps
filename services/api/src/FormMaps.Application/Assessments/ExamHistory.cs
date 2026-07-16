using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// getExamHistory result: the combined session list + the newest-per-exam view. Both are
/// heterogeneous — real rows are full <see cref="PcaHistorySession"/>, synthesized LIA rows are the
/// partial <see cref="SynthesizedHistoryRow"/>; kept as object so STJ serializes each by runtime type.
/// </summary>
public sealed record ExamHistory(
    IReadOnlyList<object> Sessions,
    IReadOnlyList<object> Latest);

/// <summary>
/// A full pca_exam_sessions row (legacy findMany, no select). Timestamps are pre-formatted
/// JS-toISOString strings (NOT DateTimeOffset — STJ would emit +00:00 instead of Z). violations is a
/// raw jsonb passthrough.
/// </summary>
public sealed record PcaHistorySession(
    string Id,
    string ExamId,
    string UserId,
    string ExamName,
    string ExamType,
    string StartTime,
    string? EndTime,
    int? TotalTimeSpent,
    int TotalQuestions,
    int QuestionsAnswered,
    int CorrectAnswers,
    int IncorrectAnswers,
    int UnansweredQuestions,
    double ScorePercentage,
    double AccuracyPercentage,
    bool IsTimeExpired,
    bool IsCompleted,
    string Status,
    JsonElement Violations,
    int ViolationCount,
    bool FlagForReview,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>
/// A synthesized per-subtest history row from the parity LIA session. PARTIAL — legacy omits
/// violations/violationCount/flagForReview/isActive/createdBy/createdDate/updatedBy/updatedAt (the
/// object literal never sets them), so this DTO carries only the ~18 fields the literal populates.
/// </summary>
public sealed record SynthesizedHistoryRow(
    string Id,
    string ExamId,
    string UserId,
    string ExamName,
    string ExamType,
    string StartTime,
    string? EndTime,
    int TotalTimeSpent,
    int TotalQuestions,
    int QuestionsAnswered,
    int CorrectAnswers,
    int IncorrectAnswers,
    int UnansweredQuestions,
    double ScorePercentage,
    double AccuracyPercentage,
    bool IsTimeExpired,
    bool IsCompleted,
    string Status);

/// <summary>The newest completed+active LIA session feeding the history synthesis (percentiles truthy).</summary>
public sealed record LiaHistorySource(
    string Id,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    JsonElement Percentiles,
    JsonElement ResponseCounts,
    JsonElement SubtestTimes);
