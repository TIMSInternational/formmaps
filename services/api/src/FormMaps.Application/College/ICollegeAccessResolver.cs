using FormMaps.Application.Auth;

namespace FormMaps.Application.College;

/// <summary>
/// Boolean access gate for routes/college.ts <c>getStudentAccess</c> (college.ts:14-30). Every college.ts caller
/// collapses ANY access failure to a uniform 404 "Not found" (the internal 400/403/404 distinction is dead), so this
/// returns only accessible / not-accessible. Semantics (all under the CALLER's read-only RLS session, a FRESH DB read
/// of the caller's own role — NOT the JWT claim):
/// caller row missing OR schoolId null → false;
/// role (lower-cased) == "student" and caller != target → false;
/// role == "counselor" → requires an active counselor_student_assignments row to the target;
/// role == "school_admin" → requires the target to exist and share the caller's school;
/// role not in { student, counselor, school_admin, super admin } → false;
/// otherwise (super admin) → true.
/// </summary>
public interface ICollegeAccessResolver
{
    Task<bool> CanAccessAsync(RequestContext context, string studentId, CancellationToken cancellationToken = default);
}
