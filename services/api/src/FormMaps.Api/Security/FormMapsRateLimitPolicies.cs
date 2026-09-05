namespace FormMaps.Api.Security;

public static class FormMapsRateLimitPolicies
{
    public const string Auth = "auth";
    public const string Sensitive = "sensitive";
    public const string Ai = "ai";

    /// <summary>
    /// formmaps#63. Legacy's <c>moderationLimiter</c> (api/src/middleware/rateLimiter.ts:26) — 30 per hour,
    /// keyed per user, on POST /moderation/report and POST/DELETE /moderation/block/:userId. A rate limit
    /// present in legacy and absent in .NET is a real divergence on an abuse-facing surface: without it the
    /// flag flip would remove the only cap on report-queue and block-row flooding.
    /// </summary>
    public const string Moderation = "moderation";
}
