namespace FormMaps.Application.Auth;

public sealed record AuthUserRow(
    string Id, string Name, string Email, string? PasswordHash,
    string RoleId, string RoleName, string? SchoolId, bool IsActive);

public sealed record LockoutStatus(bool IsLocked, DateTimeOffset? LockedUntil);

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
}
