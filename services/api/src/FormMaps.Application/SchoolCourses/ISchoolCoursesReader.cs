using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolCourses;

/// <summary>
/// The school-courses READ surface (FM-DOTNET-054 — routes/school-courses.ts GET /courses; service listCourses).
/// Runs under the caller's read-only RLS session, school-scoped by the schoolId the endpoint already resolved via
/// <see cref="FormMaps.Application.SchoolAdmin.ISchoolAdminScopeResolver"/> (the reader never re-derives scope). The
/// no-school (null/empty schoolId) case is handled by the ENDPOINT (400 "No school"), never here.
///
/// <para>Reads school_courses (WHERE schoolId=@sid AND isActive, filters, ORDER BY code ASC + id ASC tie-break,
/// paginated) + a single groupBy over student_course_plans for enrollmentCount (NO N+1) + — when includeFramework —
/// the enabled curriculum_frameworks types and their framework_courses (un-paginated, the FULL matching set). All
/// four table reads run in ONE read-only session.</para>
/// </summary>
public interface ISchoolCoursesReader
{
    Task<CoursesListResult> ListCoursesAsync(
        RequestContext context, string schoolId, SchoolCoursesQuery query, CancellationToken cancellationToken = default);
}
