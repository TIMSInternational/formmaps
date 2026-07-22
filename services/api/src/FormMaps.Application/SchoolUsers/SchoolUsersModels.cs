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
