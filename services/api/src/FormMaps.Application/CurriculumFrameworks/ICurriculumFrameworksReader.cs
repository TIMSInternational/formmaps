using FormMaps.Application.Auth;

namespace FormMaps.Application.CurriculumFrameworks;

/// <summary>
/// curriculum:manage READS (FM-DOTNET-055 — routes/school-courses.ts GET /curriculum/frameworks + GET
/// /curriculum/frameworks/:type/courses). Faithful port of schoolCoursesService.ts listFrameworks /
/// listFrameworkCourses. Runs under the caller's read-only RLS session. All SQL parameterized.
/// </summary>
public interface ICurriculumFrameworksReader
{
    /// <summary>
    /// listFrameworks: the school's curriculum_frameworks rows joined against a GLOBAL framework_courses count
    /// (grouped by frameworkType, isActive), projected onto the four fixed types in order.
    /// </summary>
    Task<IReadOnlyList<FrameworkSummary>> ListFrameworksAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// listFrameworkCourses: GLOBAL framework_courses catalog (NO school scope) filtered by the raw (case-sensitive)
    /// frameworkType + isActive, optional name|code ILIKE search, ordered code ASC (id ASC tie-break), paged.
    /// </summary>
    Task<FrameworkCoursesPage> ListFrameworkCoursesAsync(
        RequestContext context, string frameworkType, int page, int limit, long skip, string? search,
        CancellationToken cancellationToken = default);
}
