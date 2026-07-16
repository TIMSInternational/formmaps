namespace FormMaps.Application.Assessments;

// Legacy getSession returns the full pca_exam_sessions row (findUnique, no select) — the same shape
// as the history/all-results rows, so it reuses PcaHistorySession (full-row DTO with ISO-Z string
// timestamps). See IExamSessionReader.GetSessionAsync.

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

/// <summary>
/// Legacy getCompletedExams row subset. Timestamps are pre-formatted JS-toISOString Z-strings (NOT
/// DateTimeOffset, which STJ would render as +00:00 instead of Node's Z).
/// </summary>
public sealed record CompletedExamRow(
    string Id,
    string ExamId,
    string ExamName,
    string ExamType,
    double ScorePercentage,
    string StartTime,
    string? EndTime);
