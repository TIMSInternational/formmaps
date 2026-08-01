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
}
