namespace FormMaps.Application.Auth;

public sealed record AuthUserRow(
    string Id, string Name, string Email, string? PasswordHash,
    string RoleId, string RoleName, string? SchoolId, bool IsActive);

public sealed record LockoutStatus(bool IsLocked, DateTimeOffset? LockedUntil);

/// <summary>
/// Result of a successful <see cref="IAuthRepository.RotateRefreshTokenAsync"/> call: the freshly
/// minted replacement token and the user it belongs to. A <c>null</c> return from that method
/// (rather than this record) is the collapsed-null contract covering every invalid case --
/// unknown/revoked/expired token or a since-deactivated user -- matching legacy rotateRefreshToken.
/// </summary>
public sealed record RotateResult(string NewToken, string UserId);

/// <summary>
/// Profile read backing GET /auth/profile (authService.ts's getProfile). <c>SubscriptionStatus</c>
/// is the latest "isActive" "user_subscriptions" row's "status" for this user, or "none" when no
/// active subscription row exists -- matching legacy's
/// `user.subscriptions[0]?.status || "none"` exactly.
/// </summary>
public sealed record ProfileRow(
    string Id, string Name, string Email, string RoleId, string RoleName, string? SchoolId, string SubscriptionStatus);

/// <summary>
/// Result of <see cref="IAuthRepository.ChangeEmailAsync"/>. <c>Conflict</c> covers BOTH the
/// pre-existing-duplicate case (pre-check SELECT) and the concurrent-insert-race case (caught
/// Postgres 23505 unique-violation on the UPDATE itself) -- see that method's doc comment for why
/// the pre-check alone is not a sufficient guard.
/// </summary>
public enum ChangeEmailResult { Ok, NotFound, SameEmail, Conflict }

/// <summary>
/// Result of a successful <see cref="IAuthRepository.ChangeRoleAsync"/> call. A <c>null</c> return
/// from that method (rather than this record) is the collapsed-null contract covering every
/// invalid case -- target user not found, role id not found/inactive, or the user already has this
/// role -- same convention as <see cref="RotateResult"/>.
/// </summary>
public sealed record ChangeRoleResult(
    string Id, string Name, string Email, string OldRoleId, string OldRoleName, string NewRoleId, string NewRoleName);

/// <summary>
/// Invitation-token lookup result backing school-admin registration completion (authService.ts's
/// completeSchoolAdminRegistration). Deliberately NOT the collapsed-null pattern used elsewhere in
/// this file (<see cref="RotateResult"/>, <see cref="ChangeRoleResult"/>): <c>InvitationTokenExpiresAt</c>
/// is returned as-is, unfiltered, because legacy performs the expiry check as a SEPARATE step AFTER
/// the find --
/// <c>const school = await prisma.school.findFirst({ where: { invitationToken: invToken, isActive: true } });
/// if (!school) return { success: false, status: 400, message: "Invalid invitation token" };
/// if (school.invitationTokenExpiresAt &amp;&amp; school.invitationTokenExpiresAt &lt; new Date()) return
/// { success: false, status: 400, message: "Invitation token has expired" };</c> -- two distinct error
/// messages for two distinct causes. Folding the expiry check into this method (returning null for
/// both "unknown token" and "found but expired") would destroy that distinction. Task 12 must
/// perform the expiry comparison itself using this field.
/// </summary>
public sealed record SchoolInviteRow(string Id, string AdminEmail, DateTimeOffset? InvitationTokenExpiresAt);

/// <summary>
/// Password-reset-token lookup result backing forgot/reset-password (authService.ts's
/// requestPasswordReset/resetPassword). Deliberately NOT the collapsed-null pattern used by
/// <see cref="RotateResult"/>/<see cref="ChangeRoleResult"/> -- same reasoning as
/// <see cref="SchoolInviteRow"/>: <c>ExpiresAt</c>, <c>UsedAt</c>, and <c>UserIsActive</c> are
/// returned as-is, unfiltered, so Task 12's endpoint handler can perform the expired/already-used/
/// inactive-user checks itself and return three distinct error messages for three distinct causes,
/// rather than this method collapsing all of them into a single null and losing that distinction.
/// </summary>
public sealed record ResetTokenRow(string Id, string UserId, DateTimeOffset ExpiresAt, DateTimeOffset? UsedAt, bool UserIsActive);

/// <summary>
/// Domain 10 (Auth) login + lockout reads/writes, backing routes/auth.ts's login flow. Runs entirely
/// under <see cref="RequestContext.System"/> -- these are pre-auth operations (there is no caller
/// identity yet), matching the plan's Global Constraints for this task. Grows in Tasks 7-10 with
/// refresh-token rotation/revoke, profile, change-*, school-admin registration, and forgot/reset-
/// password methods on this same interface/class.
/// </summary>
public interface IAuthRepository
{
    Task<AuthUserRow?> FindUserByEmailAsync(string normalizedEmail, CancellationToken cancellationToken = default);

    Task<LockoutStatus> GetLockoutStatusAsync(string email, CancellationToken cancellationToken = default);

    Task<int> RecordFailedLoginAsync(string email, string clientIp, CancellationToken cancellationToken = default);

    Task ClearLoginAttemptsAsync(string email, CancellationToken cancellationToken = default);

    Task<string> GetLanguageAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>Mints and persists a new opaque refresh token for <paramref name="userId"/>.</summary>
    Task<string> CreateRefreshTokenAsync(string userId, string clientIp, CancellationToken cancellationToken = default);

    /// <summary>
    /// Single-use refresh-token rotation: looks up <paramref name="oldToken"/>, revokes it, and (only
    /// if it was valid -- not unknown/already-revoked/expired, and its owning user is still active)
    /// mints and persists a replacement token in the same transaction. Returns <c>null</c> on any
    /// invalid case; see <see cref="RotateResult"/>.
    /// </summary>
    Task<RotateResult?> RotateRefreshTokenAsync(string oldToken, string clientIp, CancellationToken cancellationToken = default);

    /// <summary>Revokes every currently-active refresh token for <paramref name="userId"/> (logout-all-sessions).</summary>
    Task RevokeAllRefreshTokensAsync(string userId, string clientIp, CancellationToken cancellationToken = default);

    /// <summary>Profile read for GET /auth/profile; see <see cref="ProfileRow"/>.</summary>
    Task<ProfileRow?> GetProfileAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Persists a new password hash for <paramref name="userId"/>. The caller (Task 12's
    /// change-password endpoint) has already authorized the change and verified the old password
    /// per authService.ts's changePassword ordering -- this method trusts that already happened.
    /// </summary>
    Task UpdatePasswordAsync(string userId, string newHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Looks up a user by id (rather than by email, unlike <see cref="FindUserByEmailAsync"/>).
    /// Used by Task 12 to resolve the ACTING caller's role/school for authorization checks, and to
    /// look up the TARGET user for change-email/change-password/change-role.
    /// </summary>
    Task<AuthUserRow?> FindUserByIdWithRoleAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Change-email happy/same-email/conflict, per authService.ts's changeEmail. Role-scoping and
    /// existence-hiding (uniform 403 before target lookup, cross-school 404) are NOT this method's
    /// concern -- see this interface's remarks; Task 12's endpoint layer authorizes the caller
    /// before calling this. See <see cref="ChangeEmailResult"/> for the conflict-detection
    /// contract.
    /// </summary>
    Task<ChangeEmailResult> ChangeEmailAsync(string userId, string newEmail, CancellationToken cancellationToken = default);

    /// <summary>Change-role happy path, per authService.ts's changeRole; see <see cref="ChangeRoleResult"/>.</summary>
    Task<ChangeRoleResult?> ChangeRoleAsync(string userId, string roleId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Standalone "is this role id a currently-active role" check -- added in Task 12 (post-review
    /// fix) as a lightweight, unambiguous precondition check so the endpoint layer can reproduce
    /// authService.ts's changeRole precedence exactly: legacy checks role validity FIRST
    /// (`prisma.role.findFirst({ where: { id: roleId, isActive: true } })`, "Role not found" if
    /// missing) and ONLY THEN checks whether the user already has that role ("User already has this
    /// role"). <see cref="ChangeRoleAsync"/>'s own internal ordering checks same-role BEFORE role
    /// validity (the inverse), which is why its collapsed <c>null</c> return cannot, by itself,
    /// reproduce legacy's exact precedence for the overlap case (a roleId that is simultaneously the
    /// user's current role AND has since been deactivated) -- see task-12-report.md's fix addendum.
    /// This method mirrors <see cref="ChangeRoleAsync"/>'s own role-lookup query exactly
    /// (`SELECT "name" FROM "roles" WHERE "id" = @roleId AND "isActive" = true`), just callable in
    /// isolation, before any same-role comparison.
    /// </summary>
    Task<bool> RoleExistsAndActiveAsync(string roleId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Looks up an invited school by its (still-live) invitation token, per authService.ts's
    /// `prisma.school.findFirst({ where: { invitationToken: invToken, isActive: true } })`. Returns
    /// <c>null</c> only for an unknown token or an inactive school -- NOT for an expired one; see
    /// <see cref="SchoolInviteRow"/> for why the expiry check is deliberately left to the caller.
    /// </summary>
    Task<SchoolInviteRow?> FindSchoolByInvitationTokenAsync(string token, CancellationToken cancellationToken = default);

    /// <summary>
    /// Find-or-create for the <c>school_admin</c> role, per authService.ts's
    /// `let adminRole = await prisma.role.findFirst({ where: { name: ROLES.SchoolAdmin, isActive: true } });
    /// if (!adminRole) adminRole = await prisma.role.create({ data: { name: ROLES.SchoolAdmin,
    /// description: "School Admin role" } });`. Returns the existing role's id on every call after
    /// the first; never creates a second `school_admin` row once one exists and is active.
    /// </summary>
    Task<string> EnsureSchoolAdminRoleAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Update-if-exists / create-if-not for the school admin user by (already-normalized) email, per
    /// authService.ts's `let user = await prisma.user.findUnique({ where: { email } }); if (user) {
    /// ...update... } else { ...create... }`. The update branch also clears
    /// `passwordNeedsMigration` to <c>false</c>, matching legacy exactly -- a lazily-migrated bcrypt
    /// hash getting overwritten by registration completion should not still be flagged for
    /// migration. <paramref name="email"/> must already be normalized (trim+lowercase) by the
    /// caller -- this method does not normalize it, same caller-responsibility convention as
    /// <see cref="ChangeEmailAsync"/>'s <c>newEmail</c> parameter.
    /// </summary>
    Task<AuthUserRow> UpsertSchoolAdminUserAsync(
        string schoolId, string email, string name, string passwordHash, string roleId, string roleName,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Activates a school on successful registration completion, per authService.ts's
    /// `await prisma.school.update({ where: { id: school.id }, data: { invitationToken: null,
    /// status: "active" } });` -- clears the (now-consumed, single-use) invitation token and flips
    /// `status` to `"active"`. Does not touch `isActive`.
    /// </summary>
    Task ActivateSchoolAsync(string schoolId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks every currently-unused password-reset token for <paramref name="userId"/> as used, per
    /// authService.ts's requestPasswordReset invalidating any previously-issued, still-live reset
    /// token whenever a new one is requested -- at most one live reset token per user at a time.
    /// </summary>
    Task InvalidatePriorResetTokensAsync(string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Persists a new password-reset token. <paramref name="sha256Hex"/> is already the SHA-256 hex
    /// digest of the raw token handed to the user -- the raw-token hashing happens in Task 12's
    /// endpoint handler (authService.ts's <c>hashResetToken</c>), not here; this repository only
    /// ever sees/stores the digest.
    /// </summary>
    Task CreatePasswordResetTokenAsync(string userId, string sha256Hex, TimeSpan lifetime, CancellationToken cancellationToken = default);

    /// <summary>
    /// Looks up a password-reset token by its SHA-256 hex digest. Returns <c>null</c> only for an
    /// unknown digest -- see <see cref="ResetTokenRow"/> for why expired/already-used/inactive-user
    /// cases still return a row rather than collapsing to null.
    /// </summary>
    Task<ResetTokenRow?> FindResetTokenAsync(string sha256Hex, CancellationToken cancellationToken = default);

    /// <summary>
    /// Applies a validated password reset: updates the password, marks the reset token used, and
    /// revokes every active refresh token for <paramref name="userId"/> (logging out every existing
    /// session) -- all three writes in a single transaction, all-or-nothing. Task 12's endpoint
    /// handler has already resolved and validated <paramref name="resetTokenId"/>/<paramref
    /// name="userId"/> via <see cref="FindResetTokenAsync"/> before calling this; this method trusts
    /// that already happened. A partial failure must never leave the password changed while an old
    /// session stays valid -- see AuthRepository.ApplyPasswordResetAsync's doc comment for exactly
    /// how that guarantee is implemented.
    /// </summary>
    Task ApplyPasswordResetAsync(string resetTokenId, string userId, string newHash, string clientIp, CancellationToken cancellationToken = default);
}
