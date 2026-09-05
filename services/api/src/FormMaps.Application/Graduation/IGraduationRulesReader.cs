using FormMaps.Application.Auth;

namespace FormMaps.Application.Graduation;

/// <summary>
/// Reads for the GRADUATION half of legacy routes/school-grades.ts (mounted /api/v1/school-admin, permission
/// <c>graduation:manage</c>). The calendar half of that file is already .NET under a different flag; the grade
/// IMPORT half stays in Node. Everything here runs under the caller's own read-only RLS session.
/// </summary>
public interface IGraduationRulesReader
{
    /// <summary>
    /// getGraduationRules(schoolId, academicYearId?). When no year is supplied it falls back to the school's
    /// CURRENT academic year, and returns null when there is neither a year to resolve nor a matching active
    /// rule set. Null is a 200 with <c>data: null</c>, not a 404.
    /// </summary>
    Task<GraduationRuleSetRow?> GetRulesAsync(
        RequestContext context, string schoolId, string? academicYearId, CancellationToken cancellationToken = default);

    /// <summary>getGraduationProgressList — roster-wide credit progress, filtered/sorted/paged in memory.</summary>
    Task<GraduationProgressPage> GetProgressListAsync(
        RequestContext context, string schoolId, int page, int limit, string? status, string? sortBy,
        CancellationToken cancellationToken = default);

    /// <summary>getStudentGraduationProgress — per-category credit rollup for one student.</summary>
    Task<StudentGraduationProgress> GetStudentProgressAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>getGapAnalysis — unmet categories plus up to five catalog courses that would fill each.</summary>
    Task<GapAnalysis> GetGapAnalysisAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);
}
