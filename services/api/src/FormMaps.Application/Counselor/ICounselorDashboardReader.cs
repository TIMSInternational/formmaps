using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Counselor dashboard self-contained reads (FM-DOTNET-067 — routes/counselor.ts, mounted /api/v1/counselor). The
/// FIRST counselor slice. Four <c>counselor:dashboard</c> reads: GET /dashboard (KPIs + follow-up/recent-note lists),
/// GET /dashboard/change-requests (pending course-change requests for the caseload), and the identical pair
/// GET /me/students/{studentId} + GET /students/{studentId} (assignment-gated student detail). Read-only RLS session.
///
/// <para>All are scoped to the calling counselor's own <c>req.userId</c> (assignments / authored notes / owned
/// sessions). The enriched caseload GET /me/students (the listEnrichedStudents service) is DEFERRED to its own
/// slice. Onboarding verify/complete stay in Node (email/token invite flow).</para>
/// </summary>
public interface ICounselorDashboardReader
{
    /// <summary>The /dashboard payload: caseload count + KPI counts + the pending-follow-up and recent-note lists.</summary>
    Task<CounselorDashboardResult> GetDashboardAsync(
        RequestContext context, string counselorId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The /dashboard/change-requests payload: the caseload's pending, active course-change requests (schoolId-scoped
    /// to the caller's school) + <c>total</c> = the returned page length (NOT a full COUNT — legacy quirk). Returns an
    /// empty result when the caller has no school or an empty caseload.
    /// </summary>
    Task<CounselorChangeRequestsResult> GetDashboardChangeRequestsAsync(
        RequestContext context, string counselorId, int limit, CancellationToken cancellationToken = default);

    /// <summary>ensureCounselorStudentAccess DB half: true iff an ACTIVE assignment (counselorId, studentId) exists.</summary>
    Task<bool> HasActiveAssignmentAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>The minimal student identity select (id/name/email/gradeLevel/schoolId/createdDate). Null = no user row.</summary>
    Task<CounselorStudentDetail?> GetStudentDetailAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);
}

/// <summary>The /dashboard payload. Counts are ints; the two lists are capped at 5 rows each.</summary>
public sealed record CounselorDashboardResult(
    int TotalStudents,
    int PendingRequests,
    int UpcomingSessions,
    int FollowUps,
    int OverdueFollowUps,
    IReadOnlyList<CounselorDashboardNote> PendingFollowUpsList,
    IReadOnlyList<CounselorDashboardNote> RecentNotes);

/// <summary>
/// A counselor_notes row shaped by the legacy noteView: studentName is the RESOLVED display value (name || "Student");
/// content is truncated to the first 200 chars; followUpDate is ISO-Z or null; createdAt = the row's createdDate.
/// </summary>
public sealed record CounselorDashboardNote(
    string Id,
    string StudentId,
    string StudentName,
    string Type,
    string Content,
    string? FollowUpDate,
    string CreatedAt);

/// <summary>getDashboardChangeRequests: the (limited) rows + total = rows.Count (page length, not a full COUNT).</summary>
public sealed record CounselorChangeRequestsResult(IReadOnlyList<CounselorChangeRequestRow> Data, int Total);

/// <summary>
/// A course_change_requests row as legacy emits it (raw Prisma passthrough, schema field order) PLUS the joined
/// student name. <c>StudentName</c> is the RAW users.name (may be null) — the endpoint emits both the nested
/// <c>student: { name }</c> object (raw) and <c>studentName</c> (name || "Student"). <c>Credits</c> is the RAW Decimal
/// column → JSON STRING (trim_scale::text). action/status are ::text enum labels; dates are ISO-Z.
/// </summary>
public sealed record CounselorChangeRequestRow(
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
    string UpdatedAt,
    string? StudentName);

/// <summary>The student-detail select for /me/students/{id} and /students/{id}: exactly these 6 fields.</summary>
public sealed record CounselorStudentDetail(
    string Id,
    string? Name,
    string? Email,
    int? GradeLevel,
    string? SchoolId,
    string CreatedDate);
