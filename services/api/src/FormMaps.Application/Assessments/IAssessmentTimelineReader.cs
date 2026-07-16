using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>The three self-scoped timeline sources (pca sessions, 360 groups, course enrollments).</summary>
public sealed record TimelineSources(
    IReadOnlyList<PcaTimelineRow> Pca,
    IReadOnlyList<EvalTimelineRow> Evals,
    IReadOnlyList<CourseTimelineRow> Courses);

/// <summary>
/// Reads the caller's own timeline sources (legacy getTimeline / getTimelineStats, self-scoped on
/// req.userId) under read-only RLS. Both endpoints derive from the same three source lists.
/// </summary>
public interface IAssessmentTimelineReader
{
    Task<TimelineSources> ReadSourcesAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
