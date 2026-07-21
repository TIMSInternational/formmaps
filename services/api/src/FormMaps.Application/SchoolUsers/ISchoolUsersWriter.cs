using FormMaps.Application.Auth;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// The school:users WRITE surface (FM-DOTNET-052 — routes/school.ts PUT /users/:userId/grade-level,
/// POST+DELETE /counselors/:counselorId/assign-students; service updateUserGradeLevel /
/// assignStudentsToCounselor / unassignStudentsFromCounselor). Each write runs under the caller's WRITABLE RLS
/// session (CommitAsync). This slice is the .NET write-owner for users.gradeLevel and the
/// counselor_student_assignments table (via the school:users routes).
///
/// <para><b>Ratified deterministic-superset divergence (assign):</b> legacy runs the deactivate-others
/// <c>updateMany</c> and the per-id upserts in two separate statements/transactions (<c>prisma.updateMany</c>
/// then <c>basePrisma.$transaction([tenantGucOp, …upserts])</c> — the basePrisma+tenantGucOp dance only re-applies
/// the SAME Identity GUCs the .NET writable session sets natively). We run BOTH steps in ONE writable transaction:
/// identical committed end-state, strictly safer on partial failure. See <c>SchoolUsersWriter</c>.</para>
/// </summary>
public interface ISchoolUsersWriter
{
    /// <summary>
    /// updateUserGradeLevel: reads admin(caller) + target schoolIds; if either is null or they differ → CrossSchool
    /// (no write). Otherwise UPDATEs users.gradeLevel = <paramref name="gradeLevel"/> (already coerced by
    /// <see cref="GradeLevelParser"/>) WHERE id = target, and returns Updated.
    /// </summary>
    Task<GradeLevelUpdateStatus> UpdateUserGradeLevelAsync(
        RequestContext context, string callerId, string targetUserId, int? gradeLevel,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// assignStudentsToCounselor: counselor-in-school check + student validation, then (one writable tx) deactivate
    /// each student's OTHER active assignment and upsert-activate the (counselor, student) rows. <paramref name="ids"/>
    /// is the already-normalized (trimmed, deduped) id list. assignedBy is set on INSERT only.
    /// </summary>
    Task<AssignStudentsResult> AssignStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids, string assignedBy,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// unassignStudentsFromCounselor: same counselor-in-school + student-validation gate, then a HARD delete of the
    /// (counselor, student) rows (NOT soft, NOT filtered by isActive). <paramref name="ids"/> is already normalized.
    /// </summary>
    Task<UnassignStudentsResult> UnassignStudentsAsync(
        RequestContext context, string adminSchoolId, string counselorId, IReadOnlyList<string> ids,
        CancellationToken cancellationToken = default);
}
