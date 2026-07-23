using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolStudents;

/// <summary>
/// school:manage parent-link reads (FM-DOTNET-063 — routes/school-students.ts, mounted /api/v1/school-admin).
/// Second sub-slice of school-students: the two GET reads over student_parent_links —
/// <c>GET /parents</c> (the school-wide grouped-by-email parent roster + stats) and
/// <c>GET /students/{studentId}/parents</c> (the Guardians tab for one student). Faithful port of
/// schoolStudentsService.ts listParents / listParentsForStudent. Runs under the caller's read-only RLS session.
///
/// <para>The per-student read is scoped by <c>studentInCallerSchool</c> in the endpoint (Super-Admin bypass, else
/// student.schoolId == caller.schoolId) — <see cref="IsStudentInCallerSchoolAsync"/> is the DB half. Its status
/// label needs the current time (accepted / expired-by-token / pending), injected via TimeProvider.</para>
/// </summary>
public interface ISchoolStudentsParentsReader
{
    /// <summary>
    /// studentInCallerSchool DB half: true iff a user row for <paramref name="studentId"/> exists AND its schoolId
    /// equals <paramref name="callerSchoolId"/>. (Super-Admin bypass + the no-caller-school short-circuit live in
    /// the endpoint.) A missing row or a null/mismatched schoolId → false → uniform 404.
    /// </summary>
    Task<bool> IsStudentInCallerSchoolAsync(
        RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Parent links for ONE student, in the Guardians-tab shape (status derived from now via TimeProvider).</summary>
    Task<IReadOnlyList<StudentParentLinkView>> ListParentsForStudentAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>The school-wide parent roster: paginated links grouped by lower(parentEmail) + school-wide stats.</summary>
    Task<ParentsListPage> ListParentsAsync(
        RequestContext context, string schoolId, ParentsListQuery query, CancellationToken cancellationToken = default);
}

/// <summary>
/// A single student's parent link (listParentsForStudent). status = accepted (isAccepted) | expired (a
/// tokenExpiresAt in the past) | pending. invitedAt/acceptedAt are ISO-Z (acceptedAt nullable).
/// </summary>
public sealed record StudentParentLinkView(
    string Id,
    string Name,
    string Email,
    string Relationship,
    string Status,
    string InvitedAt,
    string? AcceptedAt,
    string? ParentUserId);

/// <summary>Resolved pagination + optional (already-trimmed) search for the /parents roster.</summary>
public sealed record ParentsListQuery(int Page, int Limit, long Skip, string? Search);

/// <summary>
/// One grouped parent (keyed by lower(parentEmail), keep-FIRST link's scalar fields in createdDate-DESC order),
/// with every linked student appended. Emitted keys: id, parentName, parentEmail, parentUserId, isAccepted,
/// acceptedAt, createdDate, students.
/// </summary>
public sealed record ParentGroup(
    string Id,
    string ParentName,
    string ParentEmail,
    string? ParentUserId,
    bool IsAccepted,
    string? AcceptedAt,
    string CreatedDate,
    IReadOnlyList<ParentStudent> Students);

/// <summary>A student under a grouped parent: id, name (nullable), email, gradeLevel (nullable).</summary>
public sealed record ParentStudent(string Id, string? Name, string Email, int? GradeLevel);

/// <summary>The listParents envelope inner shape: data (grouped parents), total (LINK count), totalPages, page, stats.</summary>
public sealed record ParentsListPage(
    IReadOnlyList<ParentGroup> Data, int Total, int TotalPages, int Page, ParentsStats Stats);

/// <summary>School-wide (search-independent, un-paginated) stats: distinct parent emails / total active links / unaccepted links.</summary>
public sealed record ParentsStats(int TotalParents, int LinkedStudents, int PendingInvites);
