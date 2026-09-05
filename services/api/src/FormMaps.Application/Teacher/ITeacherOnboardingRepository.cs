using FormMaps.Application.Auth;

namespace FormMaps.Application.Teacher;

/// <summary>
/// A <c>teacher_invites</c> row, returned UNFILTERED (the same deliberate non-collapsed-null convention as
/// <c>SchoolInviteRow</c> in IAuthRepository): <c>ExpiresAt</c> and <c>UsedAt</c> come back as they are so the
/// endpoint can reproduce legacy's THREE distinct verify statuses ("invalid" / "expired" / "used") and their
/// exact precedence. Folding the checks in here would collapse them into one null and lose that.
/// </summary>
public sealed record TeacherInviteRow(
    string Id, string Token, string Email, string? SchoolId, DateTime ExpiresAt, DateTime? UsedAt);

/// <summary>The active <c>roles</c> row named "teacher" (teacher.ts:47). Absent =&gt; legacy 500s.</summary>
public sealed record TeacherRoleRow(string Id, string Name);

public enum TeacherOnboardingOutcome
{
    /// <summary>User created or migrated, invite consumed.</summary>
    Completed,

    /// <summary>
    /// teacher.ts:55 -- a user row already exists for the invite's email WITH a password and WITHOUT
    /// <c>passwordNeedsMigration</c>. Legacy 409s and, importantly, does NOT consume the invite.
    /// </summary>
    AccountAlreadyExists,
}

/// <summary>
/// Outcome of <see cref="ITeacherOnboardingRepository.CompleteOnboardingAsync"/>.
///
/// <para><c>Name</c> and <c>Email</c> are legacy's <c>user.name</c>/<c>user.email</c> AS THEY READ AT RESPONSE
/// TIME, which on the update branch is the PRE-UPDATE row. teacher.ts:58-61 calls
/// <c>await prisma.user.update(...)</c> WITHOUT assigning the result, so the local <c>user</c> still holds the
/// row as it was before the write, and both the minted JWT (:71) and the response body (:78) carry the OLD
/// name even though the database now holds the new one. DIVERGENCE NOT MADE: returning the post-update name
/// would be the obvious "fix" and would change the JWT payload and the response body on flip.</para>
/// </summary>
public sealed record TeacherOnboardingResult(
    TeacherOnboardingOutcome Outcome, string UserId, string Name, string Email);

/// <summary>teacher.ts:93-96 select: id, name, email, schoolId.</summary>
public sealed record TeacherProfileRow(string Id, string Name, string Email, string? SchoolId);

/// <summary>teacher.ts:124-129 projection of an EvaluationGroup the caller is the evaluator on.</summary>
public sealed record TeacherPendingEvaluationRow(
    string EvaluationId, string StudentName, string Deadline, string Token);

/// <summary>
/// Data access for routes/teacher.ts (issue #62), mounted /api/v1/teacher at index.ts:356.
///
/// <para>THE SPLIT AUTH BOUNDARY IS PART OF THIS INTERFACE'S CONTRACT, and is why the methods do not all take a
/// <see cref="RequestContext"/>:</para>
/// <list type="bullet">
///   <item><description>PRE-AUTH (teacher.ts:18 and :33 mount <c>systemContext</c>, NOT <c>authenticate</c>):
///   <see cref="FindInviteByTokenAsync"/>, <see cref="FindSchoolNameAsync"/>,
///   <see cref="FindActiveTeacherRoleAsync"/>, <see cref="CompleteOnboardingAsync"/>. These take NO
///   RequestContext because there is none -- the teacher being onboarded has no session yet. They open under
///   <see cref="RequestContext.System"/>, which is the exact .NET equivalent of legacy's <c>runAsSystem</c>:
///   TenantGucPlanResolver maps IsSystem to Bypass, and RlsSessionCommandBuilder emits
///   <c>SELECT set_config('app.bypass_rls','on',true)</c> -- the same statement prismaRls.ts's <c>gucOp</c>
///   emits for <c>{ mode: "bypass" }</c>. The invite TOKEN is the only authorization on these two routes; see
///   TeacherEndpoints' class remarks for the full statement of what that does and does not protect.</description></item>
///   <item><description>AUTHENTICATED (declared AFTER <c>router.use(authenticate)</c> at teacher.ts:84 and
///   <c>router.use(tenantContext)</c> at :85): <see cref="GetProfileAsync"/>, <see cref="GetSchoolNameAsync"/>,
///   <see cref="ListPendingEvaluationsAsync"/>. These take the CALLER's <see cref="RequestContext"/> and open an
///   Identity-mode RLS session with it. Never a bypass session -- a bypass here would let a teacher read another
///   school's rows, which is precisely the exposure the boundary exists to prevent.</description></item>
/// </list>
/// </summary>
public interface ITeacherOnboardingRepository
{
    // ------------------------------------------------------------------ pre-auth (systemContext)

    /// <summary>teacher.ts:23 / :42 -- <c>prisma.teacherInvite.findUnique({ where: { token } })</c>.</summary>
    Task<TeacherInviteRow?> FindInviteByTokenAsync(string token, CancellationToken cancellationToken = default);

    /// <summary>
    /// teacher.ts:28 -- <c>prisma.school.findUnique({ where: { id }, select: { name: true } })</c>, run pre-auth.
    /// Returns null when no such school row exists; the endpoint turns that into an OMITTED <c>schoolName</c> key.
    /// </summary>
    Task<string?> FindSchoolNameAsync(string schoolId, CancellationToken cancellationToken = default);

    /// <summary>teacher.ts:47 -- <c>prisma.role.findFirst({ where: { name: "teacher", isActive: true } })</c>.</summary>
    Task<TeacherRoleRow?> FindActiveTeacherRoleAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// teacher.ts:52-68 -- find-by-email, the account-takeover guard, the update-or-create, and marking the
    /// invite used. <paramref name="passwordHash"/> is hashed by the CALLER (the endpoint), matching this
    /// codebase's existing rule that hashing belongs in the endpoint layer, not the repository (see
    /// AuthEndpoints.CompleteSchoolAdminRegistrationAsync, item 9).
    ///
    /// <para>ATOMICITY DIVERGENCE, recorded rather than hidden: legacy issues findFirst / update-or-create /
    /// invite-update as three SEPARATE Prisma round trips, each its own transaction. This runs all of them in
    /// ONE writable session, matching UpsertSchoolAdminUserAsync's established shape in this codebase. The happy
    /// path and every error path are observationally identical; only the behaviour under a concurrent
    /// double-redeem of the same token differs, and it differs in the safer direction.</para>
    /// </summary>
    Task<TeacherOnboardingResult> CompleteOnboardingAsync(
        string token,
        string normalizedEmail,
        string? name,
        string passwordHash,
        TeacherRoleRow role,
        string? schoolId,
        CancellationToken cancellationToken = default);

    // ------------------------------------------------------------------ authenticated (caller's RLS session)

    /// <summary>teacher.ts:93-96, under the CALLER's Identity-mode session.</summary>
    Task<TeacherProfileRow?> GetProfileAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>teacher.ts:98, under the CALLER's Identity-mode session.</summary>
    Task<string?> GetSchoolNameAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// teacher.ts:113-120, under the CALLER's Identity-mode session throughout.
    ///
    /// <para>DIVERGENCE NOT MADE: ParentPortalRepository.ListPendingEvaluationsAsync deliberately re-opens the
    /// evaluation_groups read on a SYSTEM session (formmaps#121) because a PARENT evaluator is neither the
    /// evaluated user nor a member of that user's school, so the policy hid every row. That workaround is NOT
    /// copied here. A teacher is school staff, so the evaluation_groups policy's school branch
    /// (u."schoolId" = app.current_school_id) already admits their own school's rows -- exactly as it does for
    /// legacy's tenantContext session. Adding a bypass would widen what this route returns on flip.</para>
    /// </summary>
    Task<IReadOnlyList<TeacherPendingEvaluationRow>> ListPendingEvaluationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}
