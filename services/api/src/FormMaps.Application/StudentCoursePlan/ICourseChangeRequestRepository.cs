using System.Text.Json;
using FormMaps.Application.Auth;

namespace FormMaps.Application.StudentCoursePlan;

/// <summary>
/// Student course change-requests CRUD (FM-DOTNET-085 — routes/course-plan.ts L92-143, mounted /api/v1/student).
/// Self-scoped (RequireIdentity, caller Identity/tenant RLS); every endpoint gated by the same requireSchoolMembership
/// rail as FM-084 (a fresh users read of the caller's OWN {schoolId, gradeLevel}). POST creates a courseChangeRequest
/// (raw-body JS-|| coalescing + Prisma type-500s deferred past the membership 400 + dueDate = body||settings default);
/// GET paginates the caller's active rows (?status enum-cast → invalid label 500); DELETE cancels a pending owned row.
/// </summary>
public interface ICourseChangeRequestRepository
{
    /// <summary>POST /course-plan/change-requests. <paramref name="body"/> is the already-parsed Object/Array body
    /// (malformed/primitive → 500 in the endpoint before this call).</summary>
    Task<CreateChangeRequestOutcome> CreateAsync(
        RequestContext context, string studentId, JsonElement body, CancellationToken cancellationToken = default);

    /// <summary>GET /course-plan/change-requests. School-less caller → <see cref="ChangeRequestsView.HasSchool"/> false
    /// (the endpoint emits the empty envelope). <paramref name="status"/> = raw ?status (null/empty → no filter; a
    /// non-empty invalid enum label → Postgres cast error → 500, reproducing Prisma's enum validation).</summary>
    Task<ChangeRequestsView> ListAsync(
        RequestContext context, string studentId, string? status, int page, int limit, CancellationToken cancellationToken = default);

    /// <summary>DELETE /course-plan/change-requests/:requestId. Soft-cancel a PENDING row owned by the caller in the
    /// caller's school; any gate miss → "Cannot cancel".</summary>
    Task<DeleteChangeRequestStatus> DeleteAsync(
        RequestContext context, string studentId, string requestId, CancellationToken cancellationToken = default);
}

/// <summary>A raw courseChangeRequest row — verbatim Prisma passthrough (schema field order). credits is a Decimal →
/// JSON STRING (trim_scale::text, decimal.js toString); action/status are the enum labels (::text); dates ISO-Z.</summary>
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

public enum CreateChangeRequestStatus
{
    NoSchool,      // 400 NO_SCHOOL_MESSAGE
    InvalidBody,   // 500 (Prisma create rejects a bad courseId/credits/gradeLevel/action/dueDate/nullable-string type)
    Created        // 201 { success:true, data:<row> }
}

public sealed record CreateChangeRequestOutcome(CreateChangeRequestStatus Status, CourseChangeRequestRow? Row);

/// <summary>GET result. When <see cref="HasSchool"/> is false the endpoint emits { data:[], total:0, page, limit,
/// totalPages:0 }.</summary>
public sealed record ChangeRequestsView(bool HasSchool, IReadOnlyList<CourseChangeRequestRow> Data, int Total);

public enum DeleteChangeRequestStatus
{
    NoSchool,     // 400 NO_SCHOOL_MESSAGE
    CannotCancel, // 400 "Cannot cancel" (missing / not owner / wrong school / not pending)
    Cancelled     // 200 { success:true }
}
