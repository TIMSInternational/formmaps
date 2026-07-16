using System.Text.Json;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Full <c>pca_exam_sessions</c> row passthrough — legacy <c>getSession</c> is a
/// <c>findUnique</c> with no <c>select</c>, so every column is returned. Property names mirror the
/// Prisma FIELD names so Web camelCase serialization matches legacy exactly; the three <c>@map</c>'d
/// columns (violation_count, flag_for_review) are aliased back in the reader. The pca_exam_answers
/// relation is NOT selected (no answer-key leak), matching legacy.
/// </summary>
public sealed record ExamSession(
    string Id,
    string ExamId,
    string UserId,
    string ExamName,
    string ExamType,
    DateTimeOffset StartTime,
    DateTimeOffset? EndTime,
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
    JsonElement? Violations,
    int ViolationCount,
    bool FlagForReview,
    bool IsActive,
    string? CreatedBy,
    DateTimeOffset CreatedDate,
    string? UpdatedBy,
    DateTimeOffset UpdatedAt);

/// <summary>
/// Legacy <c>getCompletedExams</c> return shape: the full completed-session list plus a de-duped
/// (by examId, newest-first) view and its count.
/// </summary>
public sealed record CompletedExams(
    IReadOnlyList<CompletedExamRow> Sessions,
    IReadOnlyList<CompletedExamRow> UniqueCompleted,
    int Count)
{
    /// <summary>
    /// De-dupes by examId keeping the first occurrence — callers pass rows newest-first (startTime
    /// DESC), so the first per exam is the newest, matching the legacy Map insertion order.
    /// </summary>
    public static CompletedExams FromSessions(IReadOnlyList<CompletedExamRow> sessions)
    {
        var uniqueCompleted = new List<CompletedExamRow>();
        var seenExamIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in sessions)
        {
            if (seenExamIds.Add(row.ExamId))
            {
                uniqueCompleted.Add(row);
            }
        }

        return new CompletedExams(sessions, uniqueCompleted, uniqueCompleted.Count);
    }
}

public sealed record CompletedExamRow(
    string Id,
    string ExamId,
    string ExamName,
    string ExamType,
    double ScorePercentage,
    DateTimeOffset StartTime,
    DateTimeOffset? EndTime);
