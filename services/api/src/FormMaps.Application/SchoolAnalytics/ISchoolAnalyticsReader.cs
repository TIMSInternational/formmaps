using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolAnalytics;

/// <summary>
/// The school-analytics read surface (FM-DOTNET-049 — routes/school.ts /analytics/* GETs, service
/// schoolService.getAnalyticsOverview / getAnalyticsTrends / getTopPerformers). Every read is school-scoped by
/// the schoolId the endpoint resolved via <see cref="FormMaps.Application.SchoolAdmin.ISchoolAdminScopeResolver"/>
/// (passed in explicitly — the reader never re-derives scope). Reads run under the caller's read-only RLS session.
/// The no-school (null/empty schoolId) case is handled by the ENDPOINT (per-endpoint 200 empty default), never here.
/// </summary>
public interface ISchoolAnalyticsReader
{
    /// <summary>getAnalyticsOverview — the 6-field school dashboard summary (all JSON numbers).</summary>
    Task<AnalyticsOverview> GetOverviewAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// getAnalyticsTrends — bucketed time-series for a metric over a range. Backs BOTH /analytics/trends and
    /// /analytics/performance-trends (identical call). metric defaults to "completion_rate", range to "30d"
    /// (the endpoint applies the defaults). Unknown metric -> all-zero values.
    /// </summary>
    Task<AnalyticsTrends> GetTrendsAsync(
        RequestContext context, string schoolId, string metric, string range, CancellationToken cancellationToken = default);

    /// <summary>getTopPerformers — top-N students by GPA (stable, ties keep query order), gpa dropped from output.</summary>
    Task<IReadOnlyList<TopPerformer>> GetTopPerformersAsync(
        RequestContext context, string schoolId, int limit, int? gradeLevel, CancellationToken cancellationToken = default);
}

/// <summary>
/// getAnalyticsOverview result. All fields are JSON numbers: the four rates/counts are integers,
/// <see cref="AverageProgressScore"/> is a 1-dp double (Math.round(x*10)/10). Emitted verbatim as
/// { totalStudents, activeStudents, assessmentCompletionRate, averageProgressScore, studentsAtRisk, counselorCoverage }.
/// (The endpoint's no-school branch returns the DIFFERENT shape { totalStudents: 0 } ONLY — not this record.)
/// </summary>
public sealed record AnalyticsOverview(
    int TotalStudents,
    int ActiveStudents,
    int AssessmentCompletionRate,
    double AverageProgressScore,
    int StudentsAtRisk,
    int CounselorCoverage);

/// <summary>getAnalyticsTrends result: { metric, range, labels: yyyy-MM-dd[], values: int[] }.</summary>
public sealed record AnalyticsTrends(
    string Metric,
    string Range,
    IReadOnlyList<string> Labels,
    IReadOnlyList<int> Values);

/// <summary>
/// One getTopPerformers row (gpa deliberately absent — it is the sort key only, dropped from the payload).
/// gradeLevel is nullable (users.gradeLevel). progressScore is a 1-dp double.
/// </summary>
public sealed record TopPerformer(
    string StudentId,
    string Name,
    int? GradeLevel,
    double ProgressScore,
    string AssessmentStatus);
