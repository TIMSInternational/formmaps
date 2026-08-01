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
}
