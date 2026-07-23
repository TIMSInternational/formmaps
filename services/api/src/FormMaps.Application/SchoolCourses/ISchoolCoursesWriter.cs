using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolCourses;

/// <summary>
/// The school-courses WRITE surface (FM-DOTNET-054 POST /courses; FM-DOTNET-061 PUT/DELETE /courses/:courseId —
/// routes/school-courses.ts; service createCourse / updateCourse / deleteCourse). Runs under the caller's WRITABLE
/// RLS session (CommitAsync). This slice is the .NET write-owner for INSERT/UPDATE(soft-delete) on school_courses via
/// the POST + PUT + DELETE /courses routes.
///
/// <para>Legacy does NO app-level validation: it forwards the raw body with prisma-side <c>||</c> defaults (create) or
/// an undefined-omit allow-list copy (update). code / name are String NOT NULL with no default — a missing/non-string
/// value flows to the DB NOT-NULL/type path → route catch → 500 (replicated). The unique (schoolId, code) violation →
/// CreateCourseResult.Duplicate (endpoint 409).</para>
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

    /// <summary>
    /// updateCourse (FM-DOTNET-061 PUT /courses/:courseId): read-then-write in ONE writable session. findUnique(select
    /// schoolId) on <paramref name="courseId"/>; a missing row OR a schoolId mismatch → <c>null</c> (the ownership
    /// gate; endpoint maps to 403 "Course not in your school" — uniform, a non-existent id is NOT a 404). Else the SET
    /// clause is built from ONLY the 12 allow-list keys the body actually carried (undefined-omit — code, name,
    /// department, credits, gradeLevels, prerequisites, corequisites, frameworkType, description, maxEnrollment,
    /// isHonors, status), an absent key keeping its existing value; "updatedAt" ALWAYS bumps (@updatedAt, even when no
    /// allow-list key is present — legacy Prisma update({data:{}}) still touches updatedAt). Per-field typing mirrors
    /// Prisma's column rules (wrong-typed present values → fail-closed 500; a present JSON null on a nullable column →
    /// NULL). Returns the <paramref name="courseId"/> on success.
    /// </summary>
    Task<string?> UpdateCourseAsync(
        RequestContext context, string schoolId, string courseId, JsonElement body,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// deleteCourse (FM-DOTNET-061 DELETE /courses/:courseId): read-then-write in ONE writable session. findUnique
    /// (select schoolId); missing row OR schoolId mismatch → <c>false</c> (endpoint maps to 403 "Course not in your
    /// school"). Else a SOFT delete — UPDATE isActive=false, status='archived', "updatedAt"=now() (@updatedAt bump);
    /// the row is NOT removed. Returns <c>true</c> on the soft-delete.
    /// </summary>
    Task<bool> DeleteCourseAsync(
        RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default);
}
