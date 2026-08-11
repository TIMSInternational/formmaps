namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// The school:users cluster models (FM-DOTNET-052 — routes/school.ts GET /users, PUT /users/:userId/grade-level,
/// POST+DELETE /counselors/:counselorId/assign-students, GET /counselors/:counselorId/students; service
/// schoolService.ts listSchoolUsers / updateUserGradeLevel / assignStudentsToCounselor /
/// unassignStudentsFromCounselor / getCounselorStudents). Every field is emitted camelCase on the wire; timestamps
/// are ISO-Z (Prisma Date→JSON); gradeLevel is number|null.
/// </summary>
public sealed record SchoolUsersQuery(int Page, int Limit, long Skip, string? Role, string? Search);

/// <summary>
/// One listSchoolUsers row: the selected user columns plus the two derived fields the service spreads on
/// (status = isActive?"active":"inactive"; joinedAt = createdDate, the SAME ISO-Z string as createdDate).
/// </summary>
public sealed record SchoolUserRow(
    string Id,
    string Name,
    string Email,
    string RoleName,
    int? GradeLevel,
    bool IsActive,
    string CreatedDate);

/// <summary>listSchoolUsers result — the SERVICE shape { data, total, page, limit, totalPages }.</summary>
public sealed record SchoolUsersPage(
    IReadOnlyList<SchoolUserRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

/// <summary>updateUserGradeLevel outcome. CrossSchool = the legacy {error:"Cannot modify users from another school"} branch (→403); Updated = the row was updated (→200).</summary>
public enum GradeLevelUpdateStatus
{
    Updated,
    CrossSchool,
}

/// <summary>
/// updateUserRole outcome (formmaps#114 / #120 — schoolService.ts updateUserRole plus the route's audit +
/// refresh-token revocation). One member per legacy return branch, in the order the legacy service evaluates them,
/// so the endpoint's status/message mapping is a total switch with nothing collapsed:
/// <list type="bullet">
///   <item><see cref="InvalidRole"/> — G4, destination not in ROLE_CHANGE_ALLOWED → 400 "Invalid role". Unreachable
///   through the route (<see cref="UserRoleValidation"/> already rejects it) and deliberately kept: legacy keeps the
///   same defence-in-depth duplicate because the service is callable from anywhere, not only the validated route.</item>
///   <item><see cref="SelfRoleChange"/> — G2, before any DB read → 403 "Cannot change your own role".</item>
///   <item><see cref="TargetNotFound"/> — 404 "User not found".</item>
///   <item><see cref="CrossSchool"/> — G3 → 403 "Cannot modify users from another school".</item>
///   <item><see cref="SourceIsAdministrator"/> / <see cref="SourceIsNotChangeable"/> — G5, the guard on the target's
///   CURRENT role → 403 "Cannot change an administrator's role" / "Cannot change a student's role". Legacy picks
///   between the two messages with normalizeRole; membership itself is tested against the literal allowlist
///   (fail-closed), because normalizeRole maps "staff" → Parent and would wrongly reject an allowed source role.</item>
///   <item><see cref="RoleNotFound"/> — no active "roles" row for the requested name → 400 "Role not found". NOT
///   inviteStaff's find-or-create: auto-creating a Role row from a user-supplied name is a write into the permission
///   model itself.</item>
///   <item><see cref="NoChange"/> — target already holds the role → 400 "User already has this role".</item>
///   <item><see cref="Updated"/> — roleId + roleName written, audit row committed with it, refresh tokens revoked.</item>
/// </list>
/// </summary>
public enum RoleUpdateStatus
{
    Updated,
    InvalidRole,
    SelfRoleChange,
    TargetNotFound,
    CrossSchool,
    SourceIsAdministrator,
    SourceIsNotChangeable,
    RoleNotFound,
    NoChange,
}

/// <summary>
/// updateUserRole result. On <see cref="RoleUpdateStatus.Updated"/> the two role fields carry the legacy
/// { roleName, previousRoleName } payload — <see cref="RoleName"/> is the "roles"."name" AS STORED (not the
/// lowercased request token), <see cref="PreviousRoleName"/> is the target's "users"."roleName" before the write.
/// Both are null on every non-Updated status.
/// </summary>
public sealed record UserRoleUpdateResult(RoleUpdateStatus Status, string? RoleName = null, string? PreviousRoleName = null);

/// <summary>
/// assignStudentsToCounselor result. <see cref="Error"/> non-null = a service {error} branch (→400): "studentIds[]
/// must contain student ids" / "Counselor not in your school" / "One or more students are not in your school".
/// Else the { assigned, counselorId } success payload (assigned = deduped validated id count, 0 when nothing valid).
/// </summary>
public sealed record AssignStudentsResult(string? Error, int Assigned, string CounselorId);

/// <summary>unassignStudentsFromCounselor result. <see cref="Error"/> non-null = a service {error} branch (→400); else the {success:true} payload.</summary>
public sealed record UnassignStudentsResult(string? Error);

/// <summary>One getCounselorStudents student ({ id, name, email, gradeLevel, createdDate }). createdDate ISO-Z; gradeLevel number|null.</summary>
public sealed record CounselorStudentRow(
    string Id,
    string Name,
    string Email,
    int? GradeLevel,
    string CreatedDate);

/// <summary>
/// getCounselorStudents result. <see cref="Error"/> non-null = the {error:"Counselor not in your school"} branch
/// (→403); else the { data, total, page, limit, totalPages } page.
/// </summary>
public sealed record CounselorStudentsResult(
    string? Error,
    IReadOnlyList<CounselorStudentRow> Data,
    int Total,
    int Page,
    int Limit,
    int TotalPages);

/// <summary>normalizeStudentIds outcome (pure). <see cref="Error"/> non-null = the studentIds[] element error; else the trimmed, order-preserving deduped ids.</summary>
public sealed record StudentIdNormalization(IReadOnlyList<string> Ids, string? Error);
