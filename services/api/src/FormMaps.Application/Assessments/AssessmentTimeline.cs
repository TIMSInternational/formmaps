using System.Text.Json.Serialization;

namespace FormMaps.Application.Assessments;

// Raw per-source rows fed to the pure builder (fetched by the reader). Dates stay DateTime so the
// builder can sort before formatting to ISO-Z strings.

/// <summary>A pca_exam_sessions row for the timeline (newest-first by startTime).</summary>
public sealed record PcaTimelineRow(string Id, string ExamName, string ExamType, bool IsCompleted, double ScorePercentage, DateTime StartTime);

/// <summary>An evaluation_groups row for the timeline (newest-first by createdDate).</summary>
public sealed record EvalTimelineRow(string Id, string GroupType, string EvaluatorName, bool IsEvaluationCompleted, DateTime CreatedDate);

/// <summary>A course_enrollments row for the timeline (newest-first by enrolledAt); event date = enrolledAt ?? createdDate.</summary>
public sealed record CourseTimelineRow(string Id, string CourseId, string Status, int Progress, DateTime? EnrolledAt, DateTime CreatedDate);

/// <summary>
/// One heterogeneous timeline event. <c>score</c> is present only on pca events (omitted on
/// evaluation/course, matching the legacy object literals); <c>metadata</c> is a per-type object.
/// </summary>
public sealed record TimelineEvent(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("date")] string Date,
    [property: JsonPropertyName("score")]
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    double? Score,
    [property: JsonPropertyName("metadata")] object Metadata);

/// <summary>getTimeline result: a page of merged events + counts.</summary>
public sealed record TimelineResult(
    [property: JsonPropertyName("events")] IReadOnlyList<TimelineEvent> Events,
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("page")] int Page,
    [property: JsonPropertyName("limit")] int Limit,
    [property: JsonPropertyName("totalPages")] int TotalPages,
    [property: JsonPropertyName("summary")] TimelineSummary Summary);

public sealed record TimelineSummary(
    [property: JsonPropertyName("pca")] int Pca,
    [property: JsonPropertyName("evaluations")] int Evaluations,
    [property: JsonPropertyName("courses")] int Courses);

/// <summary>getTimelineStats result (camelCase).</summary>
public sealed record TimelineStats(
    [property: JsonPropertyName("overallCompletion")] int OverallCompletion,
    [property: JsonPropertyName("assessmentBreakdown")] AssessmentBreakdown AssessmentBreakdown);

public sealed record AssessmentBreakdown(
    [property: JsonPropertyName("pca")] BreakdownItem Pca,
    [property: JsonPropertyName("evaluation")] BreakdownItem Evaluation,
    [property: JsonPropertyName("courses")] BreakdownItem Courses);

public sealed record BreakdownItem(
    [property: JsonPropertyName("completed")] int Completed,
    [property: JsonPropertyName("total")] int Total);

/// <summary>
/// Pure port of legacy getTimeline / getTimelineStats (assessmentService.ts). Merges the three
/// sources into heterogeneous events, STABLE-sorts by date DESC (JS Array.sort is stable — ties keep
/// pca &lt; evaluation &lt; course insertion order), paginates in memory, and computes the stats aggregate.
/// </summary>
public static class AssessmentTimeline
{
    public static TimelineResult BuildTimeline(
        IReadOnlyList<PcaTimelineRow> pca,
        IReadOnlyList<EvalTimelineRow> evals,
        IReadOnlyList<CourseTimelineRow> courses,
        int page,
        int limit)
    {
        // (event, sortKey) pairs so the stable sort uses the real DateTime, not the formatted string.
        var items = new List<(DateTime Date, TimelineEvent Event)>();

        foreach (var s in pca)
        {
            items.Add((s.StartTime, new TimelineEvent(
                Type: s.IsCompleted ? "mil" : "pca",
                Title: s.ExamName,
                Status: s.IsCompleted ? "completed" : "in_progress",
                Date: Iso(s.StartTime),
                Score: s.ScorePercentage,
                Metadata: new { sessionId = s.Id, examType = s.ExamType })));
        }

        foreach (var e in evals)
        {
            items.Add((e.CreatedDate, new TimelineEvent(
                Type: "evaluation",
                Title: $"360° Evaluation - {e.GroupType}",
                Status: e.IsEvaluationCompleted ? "completed" : "pending",
                Date: Iso(e.CreatedDate),
                Score: null,
                Metadata: new { groupId = e.Id, evaluator = e.EvaluatorName })));
        }

        foreach (var c in courses)
        {
            var date = c.EnrolledAt ?? c.CreatedDate;
            items.Add((date, new TimelineEvent(
                Type: "course",
                Title: $"Course: {c.CourseId}",
                Status: c.Status,
                Date: Iso(date),
                Score: null,
                Metadata: new { enrollmentId = c.Id, progress = c.Progress })));
        }

        // Stable sort by date DESC (OrderByDescending is stable, matching JS Array.sort).
        var sorted = items.OrderByDescending(i => i.Date).Select(i => i.Event).ToList();
        var paged = sorted.Skip((page - 1) * limit).Take(limit).ToList();
        var totalPages = (int)Math.Ceiling((double)sorted.Count / limit);

        return new TimelineResult(
            paged, sorted.Count, page, limit, totalPages,
            new TimelineSummary(pca.Count, evals.Count, courses.Count));
    }

    public static TimelineStats BuildStats(
        IReadOnlyList<PcaTimelineRow> pca,
        IReadOnlyList<EvalTimelineRow> evals,
        IReadOnlyList<CourseTimelineRow> courses)
    {
        var completedPca = pca.Count(s => s.IsCompleted);
        var completedEval = evals.Count(e => e.IsEvaluationCompleted);
        var completedCourses = courses.Count(c => c.Status == "completed");

        var totalItems = 5 + evals.Count + courses.Count; // legacy hardcodes 5 for pca
        var completedItems = completedPca + completedEval + completedCourses;
        var overall = totalItems > 0
            ? (int)Math.Round((double)completedItems / totalItems * 100, MidpointRounding.AwayFromZero)
            : 0;

        return new TimelineStats(
            overall,
            new AssessmentBreakdown(
                Pca: new BreakdownItem(completedPca, 5),
                Evaluation: new BreakdownItem(completedEval, evals.Count),
                Courses: new BreakdownItem(completedCourses, courses.Count)));
    }

    // JS-toISOString Z-string (3 ms digits + Z), UTC.
    private static string Iso(DateTime value)
    {
        var utc = DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", System.Globalization.CultureInfo.InvariantCulture);
    }
}
