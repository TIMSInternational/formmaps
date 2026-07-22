using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolCourses;

/// <summary>
/// The school-courses WRITE surface (FM-DOTNET-054 — routes/school-courses.ts POST /courses; service createCourse).
/// Runs under the caller's WRITABLE RLS session (CommitAsync). This slice is the .NET write-owner for INSERTs into
/// school_courses via the POST /courses route (the PUT/DELETE /courses/:courseId writes stay Node — out of scope).
///
/// <para>Legacy does NO app-level validation: it forwards the raw body with prisma-side <c>||</c> defaults. code /
/// name are String NOT NULL with no default — a missing/non-string value flows to the DB NOT-NULL path → route
/// catch → 500 (replicated). The unique (schoolId, code) violation → CreateCourseResult.Duplicate (endpoint 409).</para>
/// </summary>
public interface ISchoolCoursesWriter
{
    /// <summary>
    /// createCourse: INSERT school_courses with the legacy <c>||</c> defaults applied to the raw JSON body
    /// (<paramref name="body"/>). id = gen_random_uuid(); isActive/status take DB defaults (true / 'active');
    /// createdDate/updatedAt = now(); createdBy/updatedBy stay NULL. Returns { id, code } on success, or
    /// <see cref="CreateCourseResult.Duplicate"/> on the (schoolId, code) unique violation.
    /// </summary>
    Task<CreateCourseResult> CreateCourseAsync(
        RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default);
}
