namespace FormMaps.Application.Auth;

/// <summary>
/// The hard session limit: how long a sign-in lasts no matter how active the user is.
///
/// The refresh token's <c>"expiresAt"</c> IS the session deadline. A fresh sign-in gets
/// <see cref="NewDeadline"/>; every rotation INHERITS the presented token's deadline
/// (<see cref="CapRotation"/>), so refreshing keeps a session alive only until the moment the
/// sign-in itself expires. Before this, every rotation minted a fresh 14 days, so an active user
/// was never signed out at all.
///
/// Same contract as legacy lib/auth.ts (Node) — both services write the same "refresh_tokens"
/// table, so a deadline set by one must be honoured by the other. The idle timeout is a
/// frontend concern and is deliberately not modelled here.
/// </summary>
public sealed class SessionPolicy
{
    public const int DefaultMaxHours = 12;

    public SessionPolicy(TimeSpan maxSessionLength)
    {
        if (maxSessionLength <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(maxSessionLength), "Session length must be positive.");
        MaxSessionLength = maxSessionLength;
    }

    public static SessionPolicy Default { get; } = new(TimeSpan.FromHours(DefaultMaxHours));

    public TimeSpan MaxSessionLength { get; }

    /// <summary>
    /// <c>Auth:SessionMaxHours</c> wins, then the <c>SESSION_MAX_HOURS</c> env var (the name the
    /// Node service reads), then <see cref="DefaultMaxHours"/>. A value that is missing, not a
    /// whole number, or not positive falls through to the next source rather than failing
    /// startup — a typo in an env var must not be able to lengthen sessions or take the API down.
    /// </summary>
    public static SessionPolicy FromSettings(string? configured, string? environmentFallback)
    {
        var hours = ParsePositiveHours(configured) ?? ParsePositiveHours(environmentFallback) ?? DefaultMaxHours;
        return new SessionPolicy(TimeSpan.FromHours(hours));
    }

    /// <summary>Deadline for a brand-new sign-in (login, signup, onboarding).</summary>
    public DateTime NewDeadline(DateTime utcNow) => utcNow + MaxSessionLength;

    /// <summary>
    /// Deadline for a rotated token: the presented token's own deadline, never later than a fresh
    /// sign-in would get. The cap is what retires the 14-day tokens issued before this shipped —
    /// on their first refresh they drop to at most <see cref="MaxSessionLength"/> from now.
    /// </summary>
    public DateTime CapRotation(DateTime inheritedDeadlineUtc, DateTime utcNow)
    {
        var ceiling = NewDeadline(utcNow);
        return inheritedDeadlineUtc < ceiling ? inheritedDeadlineUtc : ceiling;
    }

    private static int? ParsePositiveHours(string? raw) =>
        int.TryParse(raw?.Trim(), out var hours) && hours > 0 ? hours : null;
}
