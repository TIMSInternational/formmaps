using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// The school:users READ surface (FM-DOTNET-052 — routes/school.ts GET /users, GET /counselors/:counselorId/students;
/// service listSchoolUsers / getCounselorStudents). Reads run under the caller's read-only RLS session, school-scoped
/// by the schoolId the endpoint already resolved via
/// <see cref="FormMaps.Application.SchoolAdmin.ISchoolAdminScopeResolver"/> (the reader never re-derives scope). The
/// no-school (null/empty schoolId) case is handled by the ENDPOINT (its own 200 empty default), never here.
/// </summary>
public interface ISchoolUsersReader
{
    /// <summary>listSchoolUsers — paginated active users for the school, filtered by optional role (ILIKE) and search (name OR email ILIKE).</summary>
    Task<SchoolUsersPage> ListSchoolUsersAsync(
        RequestContext context, string schoolId, SchoolUsersQuery query, CancellationToken cancellationToken = default);

    /// <summary>
    /// getCounselorStudents — the counselor's active assignments' students, paginated. Enforces the counselor is in
    /// the caller's school (else the {error:"Counselor not in your school"} branch → 403 at the endpoint).
    /// </summary>
    Task<CounselorStudentsResult> GetCounselorStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, int page, int limit, long skip,
        CancellationToken cancellationToken = default);
}
