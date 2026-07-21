using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolReads;

/// <summary>
/// The school:manage method-unambiguous read surface (FM-DOTNET-050 — routes/school.ts GETs
/// /dashboard/stats, /counselor-assignments/all, /notes, /counselor-workload; service schoolService.ts
/// getDashboardStats / getAllCounselorAssignments / getSchoolNotes / getCounselorWorkload). Every read is
/// school-scoped by the schoolId the endpoint resolved via
/// <see cref="FormMaps.Application.SchoolAdmin.ISchoolAdminScopeResolver"/> (passed in explicitly — the reader
/// never re-derives scope). Reads run under the caller's read-only RLS session. The no-school (null/empty
/// schoolId) case is handled by the ENDPOINT (per-endpoint 200 empty default), never here.
/// <para>Namespace deliberately distinct from SchoolAdmin/SchoolAnalytics to avoid DTO/name collisions.</para>
/// </summary>
public interface ISchoolReadsReader
{
    /// <summary>getDashboardStats — the school home KPI tile (all JSON numbers). schoolId is guaranteed non-null.</summary>
    Task<DashboardStats> GetDashboardStatsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>getAllCounselorAssignments — active (studentId, counselorId) pairs for counselors in the school.</summary>
    Task<IReadOnlyList<CounselorAssignment>> GetAllCounselorAssignmentsAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// getSchoolNotes — paginated counselor notes for the school's students, with student+author nested. Returns
    /// the SERVICE shape (data,total,page,limit) — including the empty-students case { [], 0, page, limit }. The
    /// endpoint's own no-school branch returns the DIFFERENT { data:[], total:0 } shape (no page/limit).
    /// </summary>
    Task<SchoolNotesPage> GetSchoolNotesAsync(
        RequestContext context, string schoolId, SchoolNotesQuery query, CancellationToken cancellationToken = default);

    /// <summary>getCounselorWorkload — per-counselor caseload rows, stably sorted studentCount-DESC over a name-ASC fetch.</summary>
    Task<IReadOnlyList<CounselorWorkloadRow>> GetCounselorWorkloadAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}

/// <summary>
/// getDashboardStats result (schoolService.ts:43-49). The endpoint expands this into the full 10-field payload
/// (activeStudents = totalStudents, pendingInvites = pendingRequests, upcomingSessions = 0). The endpoint's
/// no-school branch returns the DIFFERENT 6-field zeros object and never constructs this record.
/// AssessmentCompletionRate and AverageScore are 1-dp doubles (JS Math.round(x)/10); the rest are integers.
/// </summary>
public sealed record DashboardStats(
    int TotalStudents,
    int TotalCounselors,
    int TotalCourses,
    int PendingRequests,
    int CompletedAssessments,
    double AssessmentCompletionRate,
    double AverageScore);

/// <summary>One getAllCounselorAssignments pair — { studentId, counselorId } (schoolService.ts:152-157).</summary>
public sealed record CounselorAssignment(string StudentId, string CounselorId);

/// <summary>Resolved /notes query params (page/limit clamped, search/type JS-falsy-collapsed) — see the endpoint.</summary>
public sealed record SchoolNotesQuery(int Page, int Limit, long Skip, string? Search, string? Type);

/// <summary>
/// getSchoolNotes result. Carries page/limit (the service shape) so the empty-students case
/// { [], 0, page, limit } is faithfully distinct from the endpoint's no-school { data:[], total:0 }.
/// </summary>
public sealed record SchoolNotesPage(IReadOnlyList<SchoolNote> Data, int Total, int Page, int Limit);

/// <summary>
/// One counselor_notes row — a verbatim passthrough of the Prisma model's scalar columns (camelCase, timestamps
/// ISO-Z, nullables preserved) plus the nested <see cref="Student"/> and <see cref="Author"/> {id,name,email}.
/// </summary>
public sealed record SchoolNote(
    string Id,
    string StudentId,
    string AuthorId,
    string Type,
    string Content,
    bool IsPrivate,
    string? FollowUpDate,
    bool FollowUpCompleted,
    string? FollowUpCompletedAt,
    IReadOnlyList<string> Tags,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt,
    SchoolNoteUser Student,
    SchoolNoteUser Author);

/// <summary>A nested note relation ({ id, name, email }) — the student or the author.</summary>
public sealed record SchoolNoteUser(string Id, string Name, string Email);

/// <summary>
/// One getCounselorWorkload row (schoolService.ts:493-500): the counselor, their aggregate counts, and the
/// resolved assignedStudents list. studentCount = assignedStudents.Count.
/// </summary>
public sealed record CounselorWorkloadRow(
    string Id,
    string Name,
    string Email,
    int StudentCount,
    int SessionCount,
    int NoteCount,
    IReadOnlyList<CounselorWorkloadStudent> AssignedStudents);

/// <summary>One assignedStudents entry ({ id, name, email, gradeLevel, isActive }). gradeLevel is nullable.</summary>
public sealed record CounselorWorkloadStudent(
    string Id,
    string Name,
    string Email,
    int? GradeLevel,
    bool IsActive);
