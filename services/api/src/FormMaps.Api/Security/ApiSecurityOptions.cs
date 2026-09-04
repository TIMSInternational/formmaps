namespace FormMaps.Api.Security;

public sealed class ApiSecurityOptions
{
    public const string SectionName = "ApiSecurity";

    public string[] AllowedOrigins { get; set; } = [];

    public int RequestTimeoutMilliseconds { get; set; } = 60_000;

    public long JsonBodyLimitBytes { get; set; } = 10 * 1024 * 1024;

    public RateLimitPolicyOptions RateLimits { get; set; } = new();
}

public sealed class RateLimitPolicyOptions
{
    public FixedWindowRateLimitOptions General { get; set; } = new()
    {
        PermitLimit = 3000,
        WindowSeconds = 15 * 60
    };

    public FixedWindowRateLimitOptions Auth { get; set; } = new()
    {
        PermitLimit = 10,
        WindowSeconds = 15 * 60
    };

    public FixedWindowRateLimitOptions Sensitive { get; set; } = new()
    {
        PermitLimit = 10,
        WindowSeconds = 60 * 60
    };

    public FixedWindowRateLimitOptions Ai { get; set; } = new()
    {
        PermitLimit = 10,
        WindowSeconds = 60
    };

    /// <summary>
    /// formmaps#63. Legacy's moderationLimiter is `windowMs: 60 * 60 * 1000, max: 30` — deliberately looser
    /// than Sensitive's 10/hour, because legitimate flagging bursts (a thread going bad) must not be capped
    /// at the password-change rate. The numbers are legacy's, not a re-derivation.
    /// </summary>
    public FixedWindowRateLimitOptions Moderation { get; set; } = new()
    {
        PermitLimit = 30,
        WindowSeconds = 60 * 60
    };
}

public sealed class FixedWindowRateLimitOptions
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}
