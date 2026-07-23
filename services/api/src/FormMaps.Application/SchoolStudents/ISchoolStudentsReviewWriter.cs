using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// school:manage school-students review WRITES (FM-DOTNET-066 — routes/school-students.ts, mounted
/// /api/v1/school-admin). Second WRITE sub-slice: PUT /community-service/{entryId}/verify (verify/reject a service
/// entry) + PUT /students/{studentId}/course-plan/change-requests/{requestId}/review (approve/reject/pend a course
/// change, creating a plan row on approved+add). Faithful port of schoolStudentsService.ts verifyCommunityService /
/// reviewChangeRequest. Each write runs under ONE writable RLS session and commits. Both write native PG enums.
/// </summary>
public interface ISchoolStudentsReviewWriter
{
    /// <summary>
    /// Verify/reject a community-service entry. <paramref name="callerSchoolId"/> null = Super Admin (platform-wide);
    /// otherwise the entry must belong to that school. Returns the updated full row, or null (→ 404 "Entry not
    /// found") for a missing entry OR a cross-school entry. status is the enum label; note is sliced to 1000 or null.
    /// </summary>
    Task<CommunityServiceEntryRow?> VerifyCommunityServiceAsync(
        RequestContext context, string entryId, string userId, string? callerSchoolId,
        string status, string? note, CancellationToken cancellationToken = default);

    /// <summary>studentInCallerSchool DB half (shared shape): student exists AND schoolId == caller.</summary>
    Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Review a course-change request. Returns the updated full row, or null (→ 404 "Request not found") when the
    /// request is missing OR its studentId ≠ the route studentId. <paramref name="status"/> null = not updated;
    /// a non-null value is written (enum). counselorNote written only when non-empty. On approved+add, a
    /// student_course_plans row is created (when the admin has a school + a current academic year).
    /// </summary>
    Task<CourseChangeRequestRow?> ReviewChangeRequestAsync(
        RequestContext context, string adminUserId, string studentId, string requestId,
        string? status, string? counselorNote, CancellationToken cancellationToken = default);
}
