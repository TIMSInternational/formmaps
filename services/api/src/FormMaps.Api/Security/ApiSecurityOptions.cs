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
}

public sealed class FixedWindowRateLimitOptions
{
    public int PermitLimit { get; set; }

    public int WindowSeconds { get; set; }
}
