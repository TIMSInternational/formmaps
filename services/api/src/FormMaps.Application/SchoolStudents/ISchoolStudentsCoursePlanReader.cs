using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// Course-planning reads (FM-DOTNET-064 — routes/school-students.ts, mounted /api/v1/school-admin). Third sub-slice
/// of school-students: GET /students/{studentId}/course-plan (the merged plan+grades enrollment view) +
/// GET /students/{studentId}/course-plan/change-requests (the student's course-change requests) +
/// GET /course-request-deadline (the school's deadline). Faithful port of schoolStudentsService.ts
/// getStudentCoursePlan / getStudentChangeRequests / getCourseRequestDeadline. Read-only RLS session.
///
/// <para>The first two are role-gated (school_admin/Super Admin) + studentInCallerSchool in the endpoint;
/// the deadline read is school:manage. Shipped DARK.</para>
/// </summary>
public interface ISchoolStudentsCoursePlanReader
{
    /// <summary>studentInCallerSchool DB half (shared shape with the parents reader): true iff the student exists AND schoolId == caller.</summary>
    Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The merged course-plan view. Null = the student has no schoolId (or no student row) → the endpoint renders the
    /// minimal { plan: { enrollments: [] }, recommendations: [] } early-return shape.
    /// </summary>
    Task<StudentCoursePlanResult?> GetStudentCoursePlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>The student's course-change requests (full-row passthrough) + total, optional status enum filter.</summary>
    Task<ChangeRequestsResult> GetStudentChangeRequestsAsync(
        RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default);

    /// <summary>The school's courseRequestDeadline (ISO-Z) or null.</summary>
    Task<string?> GetCourseRequestDeadlineAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}

/// <summary>
/// The full course-plan payload (when the student has a school). enrollments = graded rows FIRST (each carries a
/// grade key) then plan rows (no grade key). Credits/required are computed → JSON numbers.
/// </summary>
public sealed record StudentCoursePlanResult(
    string StudentId,
    int? GradeLevel,
    IReadOnlyList<CoursePlanEnrollment> Enrollments,
    double TotalCreditsEarned,
    double TotalCreditsRequired,
    bool IsOnTrack);

/// <summary>
/// One enrollment. IsGraded distinguishes a completed-grade row (emits a <c>grade</c> key, possibly null) from a
/// plan row (NO grade key). Order in the list is graded-first then plan (the legacy spread order). GradeLevel is
/// NULLABLE: a graded row whose academic-year string fails JS parseInt propagates NaN → JSON null (legacy
/// Math.max(9, x - NaN) = NaN → null); plan rows always carry a real level (user.gradeLevel || 11).
/// </summary>
public sealed record CoursePlanEnrollment(
    string Id,
    string CourseId,
    string CourseCode,
    string CourseName,
    double Credits,
    string Category,
    int? GradeLevel,
    string Semester,
    string Status,
    bool IsGraded,
    string? Grade);

/// <summary>getStudentChangeRequests: the full course_change_requests rows + the (filter-scoped) total.</summary>
public sealed record ChangeRequestsResult(IReadOnlyList<CourseChangeRequestRow> Data, int Total);

/// <summary>
/// A course_change_requests row as legacy emits it (raw Prisma passthrough) — every column in schema field order.
/// <c>Credits</c> is the RAW Prisma Decimal column → a JSON STRING (trim_scale::text). action/status are ::text enum
/// labels; dueDate/reviewedAt/createdDate/updatedAt are ISO-Z.
/// </summary>
public sealed record CourseChangeRequestRow(
    string Id,
    string StudentId,
    string SchoolId,
    string CourseId,
    string? CourseCode,
    string? CourseName,
    string Credits,
    int GradeLevel,
    string? Semester,
    string Action,
    string? DueDate,
    string? StudentNote,
    string Status,
    string? CounselorNote,
    string? ReviewedBy,
    string? ReviewedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
