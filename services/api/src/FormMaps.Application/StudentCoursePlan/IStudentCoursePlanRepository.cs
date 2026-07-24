using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentCoursePlan;

/// <summary>
/// Student course-planning CRUD (FM-DOTNET-084 — routes/course-plan.ts, mounted /api/v1/student). Self-scoped
/// (RequireIdentity, caller Identity/tenant RLS — the route uses authenticate + tenantContext, no runAsSystem).
/// GET /course-plan returns the raw active studentCoursePlan rows (full passthrough) for the resolved academic year
/// plus the student's total completed credits; POST /course-plan/courses appends a planned enrollment; DELETE
/// /course-plan/courses/:courseId hard-removes the caller's planned rows for that course.
/// The <c>requireSchoolMembership</c> rail (a fresh users read of the caller's OWN schoolId) gates every endpoint:
/// on GET a school-less caller (missing user or null schoolId) gets the empty 200 shape, on POST/DELETE a 400.
/// </summary>
public interface IStudentCoursePlanRepository
{
    /// <summary>GET /course-plan. <paramref name="academicYearId"/> is the raw ?academicYearId query value (null/empty
    /// → resolve the current year). School-less caller → <see cref="CoursePlanView.HasSchool"/> false.</summary>
    Task<CoursePlanView> GetCoursePlanAsync(
        RequestContext context, string studentId, string? academicYearId, CancellationToken cancellationToken = default);

    /// <summary>POST /course-plan/courses. <paramref name="body"/> is the already-parsed request body (Object or Array;
    /// a malformed/primitive body is rejected as 500 in the endpoint before this call). courseId (required String) and
    /// semester→term (String?) are extracted here so their Prisma type-500s defer past the membership/current-year 400s.</summary>
    Task<CreateCoursePlanOutcome> CreateCourseAsync(
        RequestContext context, string studentId, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>DELETE /course-plan/courses/:courseId. Hard deleteMany of the caller's planned rows for the course
    /// (idempotent — always success once the caller has a school).</summary>
    Task<DeleteCoursePlanStatus> DeleteCourseAsync(
        RequestContext context, string studentId, string courseId, CancellationToken cancellationToken = default);
}

/// <summary>GET result. When <see cref="HasSchool"/> is false the endpoint emits the minimal
/// { plan:{ enrollments:[] }, recommendations:[] } shape (no studentId/gradeLevel/totalCreditsEarned keys).</summary>
public sealed record CoursePlanView(
    bool HasSchool,
    int? GradeLevel,
    IReadOnlyList<CoursePlanRow> Enrollments,
    double TotalCreditsEarned);

/// <summary>A raw studentCoursePlan row — verbatim Prisma passthrough (schema field order); term/status/notes/createdBy/
/// updatedBy are nullable; dates are ISO-Z strings; sortOrder an int.</summary>
public sealed record CoursePlanRow(
    string Id,
    string StudentId,
    string SchoolId,
    string AcademicYearId,
    string? Term,
    string CourseId,
    string? Status,
    int SortOrder,
    string? Notes,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

public enum CreateCoursePlanStatus
{
    NoSchool,       // 400 NO_SCHOOL_MESSAGE
    NoCurrentYear,  // 400 "No current academic year"
    InvalidBody,    // 500 (Prisma create rejects a missing/null/non-string courseId or a non-string term)
    Created         // 201
}

public sealed record CreateCoursePlanOutcome(CreateCoursePlanStatus Status);

public enum DeleteCoursePlanStatus
{
    NoSchool, // 400 NO_SCHOOL_MESSAGE
    Deleted   // 200 { success:true }
}
