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
    /// updateUserRole (formmaps#114 + #120 — schoolService.ts updateUserRole AND the two things routes/school.ts
    /// does around it, which the .NET side had NEITHER of before this method existed):
    /// <list type="number">
    ///   <item>the guarded role write (G2 self, G3 same-school, G4 destination allowlist, G5 source allowlist,
    ///   role lookup, idempotence) — see <see cref="RoleUpdateStatus"/> for the branch-by-branch mapping;</item>
    ///   <item>an <c>audit_logs</c> row (USER_ROLE_CHANGE / User / targetUserId / { from, to });</item>
    ///   <item>revocation of the TARGET's outstanding refresh tokens.</item>
    /// </list>
    ///
    /// <para><b>The revocation must not run under the caller's RLS identity.</b> On 2026-08-09 the RLS apply
    /// (prisma/rls/007-self-scoped.sql) policied <c>refresh_tokens</c> owner-only, and legacy's revocation here
    /// silently became a no-op: it touched the TARGET's rows while the request ran under the CALLER's GUCs, the
    /// policy matched nothing, and Prisma's <c>updateMany</c> returned <c>{count:0}</c> WITHOUT THROWING — a
    /// re-roled user kept a working session and nothing anywhere said so (formmaps#117). Legacy's fix was
    /// <c>runAsSystem</c>; the .NET equivalent, and the shape this method uses, is
    /// <see cref="IAuthRepository.RevokeAllRefreshTokensAsync"/>, which opens its OWN session under
    /// <see cref="RequestContext.System"/> → <c>TenantGucPlanMode.Bypass</c>. Revoking another user's sessions is a
    /// legitimate cross-user administrative action; the identical call is already made by PUT /auth/change-password's
    /// admin branch (AuthEndpoints.cs:326). Do not "simplify" this onto the caller's writable session — that is
    /// literally the bug.</para>
    ///
    /// <para><b>Residual window, knowingly.</b> Permissions are baked into the access token at issuance and there is
    /// no JWT denylist in either codebase. Revoking refresh tokens stops a demoted user re-minting, but their live
    /// access token keeps the old permissions until it expires. Documented mitigation, not a fix — same as legacy.</para>
    ///
    /// <paramref name="callerEmail"/> and <paramref name="clientIp"/> feed the audit row's actorEmail/ipAddress and
    /// the revocation's revokedByIp; legacy reads them off the request (<c>req.userEmail || ""</c>, <c>req.ip</c>).
    /// <paramref name="roleName"/> is the already-validated, lowercased destination role.
    /// </summary>
    Task<UserRoleUpdateResult> UpdateUserRoleAsync(
        RequestContext context, string callerId, string callerEmail, string targetUserId, string roleName,
        string clientIp, CancellationToken cancellationToken = default);

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
