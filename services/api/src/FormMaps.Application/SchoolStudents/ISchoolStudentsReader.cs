using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// school:manage roster reads (FM-DOTNET-062 — routes/school-students.ts, mounted under /api/v1/school-admin).
/// The first sub-slice of the school-students domain: the three student-identity GETs — list, detail, and
/// community-service — that share the <c>school:manage</c> rail and the getSchoolId caller-school resolution.
/// Faithful port of schoolStudentsService.ts listStudents / getStudentDetail / getStudentCommunityService.
///
/// <para>Runs under the caller's read-only RLS session. <c>ListStudentsAsync</c> is the paginated roster;
/// <c>GetStudentDetailAsync</c>/<c>GetStudentCommunityServiceAsync</c> return <c>null</c> for a missing OR
/// cross-school student (the endpoint maps that to the uniform 404 "Student not found"). Deferred to later
/// sub-slices: the parents reads, the course-plan reads, the course-request-deadline read, and every write.</para>
/// </summary>
public interface ISchoolStudentsReader
{
    Task<StudentListPage> ListStudentsAsync(
        RequestContext context, string schoolId, StudentListQuery query, CancellationToken cancellationToken = default);

    /// <summary>Null = the student row is missing or belongs to another school (uniform 404 upstream).</summary>
    Task<StudentDetail?> GetStudentDetailAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Null = the student row is missing or belongs to another school (uniform 404 upstream).</summary>
    Task<StudentCommunityService?> GetStudentCommunityServiceAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);
}

/// <summary>Resolved pagination + optional search for the roster list (page/limit already clamped upstream).</summary>
public sealed record StudentListQuery(int Page, int Limit, long Skip, string? Search);

/// <summary>
/// One roster row: the legacy select (id, name, email, roleName, gradeLevel, isActive, createdDate) plus the
/// derived <c>status</c> (isActive ? "active" : "inactive"). Emitted in that key order.
/// </summary>
public sealed record StudentListItem(
    string Id,
    string Name,
    string Email,
    string RoleName,
    int? GradeLevel,
    bool IsActive,
    string CreatedDate,
    string Status);

/// <summary>The service's list envelope: { data, total, page, limit, totalPages } (emitted verbatim — NO success wrapper).</summary>
public sealed record StudentListPage(
    IReadOnlyList<StudentListItem> Data, int Total, int Page, int Limit, int TotalPages);

/// <summary>
/// The full student-detail payload (getStudentDetail). gpa is null when no completed+graded course maps to the
/// GPA scale; lastActive is ISO-Z (updatedAt ?? createdDate). Numbers are computed (Number()-ified) → JSON numbers.
/// </summary>
public sealed record StudentDetail(
    string Id,
    string Name,
    string Email,
    int? GradeLevel,
    string Status,
    double? Gpa,
    int AlertCount,
    string LastActive,
    StudentAssessmentStatus AssessmentStatus,
    StudentCreditProgress CreditProgress);

/// <summary>PCA / MIL / Eval360 status labels ("completed" | "in_progress" | "not_started"). Keys are PCA, MIL, Eval360.</summary>
public sealed record StudentAssessmentStatus(string Pca, string Mil, string Eval360);

/// <summary>earned/required are computed credit doubles; percentage is JsRound(earned/required*100) (0 when required ≤ 0).</summary>
public sealed record StudentCreditProgress(double Earned, double Required, int Percentage);

/// <summary>getStudentCommunityService payload: the active entries (date DESC) + the school's serviceHoursRequired (?? 0).</summary>
public sealed record StudentCommunityService(
    IReadOnlyList<CommunityServiceEntryRow> Entries, int TotalHoursRequired);

/// <summary>
/// A community_service_entries row as legacy emits it (raw Prisma passthrough) — every column in schema field
/// order. <c>Hours</c> is the RAW Prisma Decimal column → a JSON STRING (trim_scale::text), NOT a number.
/// date/verifiedAt/createdDate/updatedAt are ISO-Z; status is the ::text enum label.
/// </summary>
public sealed record CommunityServiceEntryRow(
    string Id,
    string StudentId,
    string SchoolId,
    string Organization,
    string? Description,
    string Hours,
    string Date,
    string? SupervisorName,
    string? SupervisorEmail,
    string Status,
    string? Note,
    string? VerifiedBy,
    string? VerifiedAt,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);
