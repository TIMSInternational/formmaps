using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Insights;

/// <summary>
/// <see cref="IInsightsTrigger"/> via a server-to-server call to the legacy Node API's own
/// <c>POST /api/v1/assessment/generate-insights</c> route (formmaps#144) — the "internal call to the
/// generate-insights route" option from the issue, chosen over an outbox because it needs NO schema, NO
/// Node change and NO new poller, and stays trivially deletable once insights generation itself moves
/// to .NET. The route's handler IS legacy checkAndTriggerInsights with an HTTP face: it re-checks the
/// completion gate server-side (checkAssessmentCompletion) and only then backgrounds generation, which
/// is itself fingerprint-idempotent (generateInsightsBackground skips the AI when the assessment
/// fingerprint is unchanged). Gate logic and idempotency therefore live in exactly ONE place — Node —
/// for the whole mixed era, with zero drift risk from a ported copy, and a spurious or duplicate fire
/// from .NET degrades to a cheap no-op there.
///
/// AUTH: mints a short-lived (60s) HS256 JWT for the EVALUATED user — role/school read from the users
/// row so Node's authenticate + RLS tenant context behave exactly as they do for the student's own
/// request. Signed with the shared JWT_SECRET through the same SecretOverride-then-env precedence as
/// RealtimeTicketFactory/LegacyJwtRequestContextFactory (the formmaps#41 lesson: every mint path must
/// resolve the secret identically to the validating side), and the same claim shape as
/// AccessTokenFactory. Node has no service-principal auth path, so a user-scoped token is the ONLY
/// credential its authenticate middleware accepts; the 60s TTL (vs the ~60min session TTL) plus the
/// server-to-server-only transport bound the blast radius of the full-session shape.
///
/// FAIL-SOFT-BUT-LOUD (formmaps#137): TriggerAsync NEVER throws. Every failure mode — missing
/// LEGACY_API_BASE_URL, unknown user, missing secret, unreachable Node, non-2xx (429 from Node's
/// shared per-IP aiLimiter is the realistic one) — logs at Error with userId + source, which is the
/// full backfill key (legacy generateInsightsBackground(userId)), and the assessment write that
/// carried the trigger always succeeds. A lost NON-FINAL fire is self-healing (any later gate event
/// re-fires), but a lost FINAL-gate fire is NOT: neither frontend references generate-insights or
/// any lazy generation path (verified 2026-08-14 — zero grep hits in apps/web and the legacy
/// frontend), so this server-side trigger is the ONLY generation mechanism in the product, and a
/// failed final fire is recoverable solely via the Error-log backfill key above. That is why the
/// Error level and the userId in the log line are load-bearing, not decoration.
///
/// 429 exposure, decided 2026-08-14: Node's aiLimiter is 10/min per IP shared across all AI
/// endpoints, and every fire from this class shares one egress IP, so a burst of same-minute
/// completions (a 360 email campaign, a classroom finishing LIA) can 429 some fires. Chosen
/// mitigation: an internal-caller exemption in Node's aiLimiter keyGenerator, bundled with the
/// Node-side personality trigger that formmaps#144 already requires — one Node change, both fixes.
/// Until that lands, a 429'd final-gate fire needs the manual backfill; the log line carries
/// everything needed.
/// </summary>
public sealed class LegacyApiInsightsTrigger(
    HttpClient httpClient,
    IAuthRepository authRepository,
    IOptions<LegacyJwtOptions> options,
    InsightsTriggerOptions triggerOptions,
    ILogger<LegacyApiInsightsTrigger> logger) : IInsightsTrigger
{
    public const string GenerateInsightsPath = "/api/v1/assessment/generate-insights";

    /// <summary>
    /// 60s: long enough for the 5s-capped HTTP call under any retry policy, and nothing like the
    /// ~60min session TTL — this token exists for exactly one internal request.
    /// </summary>
    public static readonly TimeSpan TriggerTokenLifetime = TimeSpan.FromSeconds(60);

    // Node's jwt.verify applies ZERO clock tolerance (unlike the .NET validating side, which grants
    // LegacyJwtOptions.ClockSkew), so a .NET clock even one second ahead of Node's would fail `nbf`
    // on every trigger. Backdate nbf by the same 30s the .NET side tolerates in the other direction.
    private static readonly TimeSpan NotBeforeBackdate = TimeSpan.FromSeconds(30);

    private const string JwtSecretEnvironmentVariable = "JWT_SECRET";
    private readonly LegacyJwtOptions jwtOptions = options.Value;

    public async Task TriggerAsync(string userId, string source, CancellationToken cancellationToken = default)
    {
        try
        {
            if (triggerOptions.LegacyApiBaseUrl is not { Length: > 0 } baseUrl)
            {
                logger.LogError(
                    "insights.trigger skipped: LEGACY_API_BASE_URL is not configured userId={UserId} source={Source} — set it to the legacy Node API origin, or backfill this student via legacy generateInsightsBackground",
                    userId, source);
                return;
            }

            // Real role/school from the users row: the RLS tenant context Node establishes from these
            // claims must match what the student's own request would get, or the gate queries could
            // silently come back empty and read as "not ready".
            var user = await authRepository.FindUserByIdWithRoleAsync(userId, cancellationToken);
            if (user is null)
            {
                logger.LogError(
                    "insights.trigger skipped: user not found userId={UserId} source={Source}", userId, source);
                return;
            }

            var token = MintTriggerToken(user);
            if (token is null)
            {
                logger.LogError(
                    "insights.trigger skipped: JWT_SECRET is not configured userId={UserId} source={Source}",
                    userId, source);
                return;
            }

            using var request = new HttpRequestMessage(HttpMethod.Post, baseUrl + GenerateInsightsPath);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // The route reads no body, but an explicit empty JSON object keeps any body-parser strictness happy.
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");

            using var response = await httpClient.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogError(
                    "insights.trigger failed: legacy API returned {StatusCode} userId={UserId} source={Source} body={Body}",
                    (int)response.StatusCode, userId, source, Truncate(body));
                return;
            }

            // Node replies 200 for BOTH outcomes; data.status distinguishes "generating" (gate open,
            // generation kicked off) from "not_ready" (gate still closed — the routine case for every
            // non-final assessment event). Surfaced for funnel observability.
            logger.LogInformation(
                "insights.trigger fired userId={UserId} source={Source} status={Status}",
                userId, source, ReadDataStatus(body));
        }
        catch (Exception ex)
        {
            // Deliberate catch-all: the fail-soft-BUT-LOUD contract (see class doc). Covers timeouts
            // (the typed client's 5s cap surfaces as TaskCanceledException), DNS/connect failures and
            // caller-side cancellation alike — all leave the same backfillable Error.
            logger.LogError(ex, "insights.trigger failed userId={UserId} source={Source}", userId, source);
        }
    }

    /// <summary>
    /// Mints the trigger token with the SAME claim shape as <see cref="AccessTokenFactory"/> (Node's
    /// authenticate reads sub/name/email/role/schoolId/permissions; the target route itself requires
    /// no permission) but the short <see cref="TriggerTokenLifetime"/> instead of the session TTL.
    /// </summary>
    private string? MintTriggerToken(AuthUserRow user)
    {
        var secret = ResolveSecret();
        if (string.IsNullOrWhiteSpace(secret))
        {
            return null;
        }

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var permissionsJson = JsonSerializer.Serialize(RolePermissions.For(user.RoleName));

        var token = new JwtSecurityToken(
            issuer: jwtOptions.Issuer,
            audience: jwtOptions.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id),
                new Claim("name", user.Name),
                new Claim("email", user.Email),
                new Claim("role", user.RoleName),
                // Legacy generateAccessToken writes `schoolId: user.schoolId || ""` — mirror the
                // empty-string (never absent) shape.
                new Claim("schoolId", user.SchoolId ?? string.Empty),
                new Claim("permissions", permissionsJson),
            ],
            notBefore: now - NotBeforeBackdate,
            expires: now + TriggerTokenLifetime,
            signingCredentials: credentials);

        return handler.WriteToken(token);
    }

    /// <summary>
    /// Same precedence as the validating side (LegacyJwtRequestContextFactory.ResolveSecret):
    /// LegacyJwt:SecretOverride first, then JWT_SECRET — the formmaps#41 rule that every mint path
    /// must keep textually identical to the validator's.
    /// </summary>
    private string? ResolveSecret() =>
        string.IsNullOrWhiteSpace(jwtOptions.SecretOverride)
            ? Environment.GetEnvironmentVariable(JwtSecretEnvironmentVariable)
            : jwtOptions.SecretOverride;

    private static string ReadDataStatus(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("data", out var data)
                && data.ValueKind == JsonValueKind.Object
                && data.TryGetProperty("status", out var status)
                && status.ValueKind == JsonValueKind.String
                ? status.GetString()!
                : "unknown";
        }
        catch (JsonException)
        {
            return "unknown";
        }
    }

    // Bounded so a proxy error page can never bloat the log line; 500 chars keeps Node's real
    // {success:false,message} payloads intact.
    private static string Truncate(string value) => value.Length > 500 ? value[..500] : value;
}
