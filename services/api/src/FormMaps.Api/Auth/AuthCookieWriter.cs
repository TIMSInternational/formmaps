using System.Globalization;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Auth;

/// <summary>
/// Port of legacy lib/authCookies.ts::setAuthCookies. Cookie contract is pinned exactly —
/// see docs/migration/auth-tenant-context-contract.md's "Cookie Contract" section:
///   access_token       httpOnly, sameSite=lax, path=/,        maxAge = min(access TTL, time to deadline)
///   refresh_token      httpOnly, sameSite=lax, path=/authapi, maxAge = time to the session deadline
///   logged_in          JS-readable, sameSite=lax, path=/,     maxAge = time to the session deadline if
///                      a refresh token is present, else access TTL — it must OUTLIVE the access token
///                      so the frontend's 401-refresh interceptor (gated on this cookie) fires correctly.
///   session_expires_at JS-readable, sameSite=lax, path=/,     value = the session deadline as epoch
///                      MILLISECONDS; lets the frontend sign the user out AT the deadline instead of on
///                      their next request after it. Not a credential: it only reveals when the
///                      session ends. Same contract as legacy lib/authCookies.ts.
/// The session deadline is the refresh token's "expiresAt" (see SessionPolicy).
/// </summary>
public static class AuthCookieWriter
{
    public const string SessionExpiresAtCookie = "session_expires_at";

    /// <param name="sessionDeadlineUtc">
    /// The session's hard deadline. Required whenever <paramref name="refreshToken"/> is set; if a
    /// caller ever omits it, the cookies fall back to one default-length session rather than to
    /// the old 14 days.
    /// </param>
    public static void SetAuthCookies(
        HttpResponse response, string accessToken, string? refreshToken, int accessExpiresSeconds,
        DateTime? sessionDeadlineUtc = null)
    {
        var isProd = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Production", StringComparison.OrdinalIgnoreCase);
        var accessTtl = TimeSpan.FromSeconds(accessExpiresSeconds);

        DateTime? deadline = refreshToken is null
            ? sessionDeadlineUtc
            : sessionDeadlineUtc ?? SessionPolicy.Default.NewDeadline(DateTime.UtcNow);
        TimeSpan? remaining = deadline is { } d ? Positive(d - DateTime.UtcNow) : null;
        if (remaining is { } r && r < accessTtl) accessTtl = r;

        response.Cookies.Append("access_token", accessToken, new CookieOptions
        {
            HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = accessTtl, Path = "/",
        });

        response.Cookies.Append("logged_in", "true", new CookieOptions
        {
            HttpOnly = false, Secure = isProd, SameSite = SameSiteMode.Lax,
            MaxAge = refreshToken is not null && remaining is { } sessionLeft ? sessionLeft : accessTtl, Path = "/",
        });

        if (refreshToken is not null)
        {
            response.Cookies.Append("refresh_token", refreshToken, new CookieOptions
            {
                HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = remaining, Path = "/authapi",
            });
        }

        if (deadline is { } expiresAt && remaining is { } left)
        {
            var epochMs = new DateTimeOffset(DateTime.SpecifyKind(expiresAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds();
            response.Cookies.Append(SessionExpiresAtCookie, epochMs.ToString(CultureInfo.InvariantCulture), new CookieOptions
            {
                HttpOnly = false, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = left, Path = "/",
            });
        }
    }

    public static void ClearAuthCookies(HttpResponse response)
    {
        response.Cookies.Delete("access_token", new CookieOptions { Path = "/" });
        response.Cookies.Delete("refresh_token", new CookieOptions { Path = "/authapi" });
        response.Cookies.Delete("logged_in", new CookieOptions { Path = "/" });
        response.Cookies.Delete(SessionExpiresAtCookie, new CookieOptions { Path = "/" });
    }

    /// <summary>ISO-8601 UTC for the response bodies' <c>sessionExpiresAt</c> ("2026-09-29T05:00:00.000Z").</summary>
    public static string ToIsoUtc(DateTime deadlineUtc) =>
        DateTime.SpecifyKind(deadlineUtc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    // A MaxAge of zero or less deletes the cookie outright; a deadline already reached (clock
    // skew, a request landing in the last millisecond) gets one second instead.
    private static TimeSpan Positive(TimeSpan span) => span > TimeSpan.Zero ? span : TimeSpan.FromSeconds(1);

    public static string GetClientIp(HttpRequest request)
    {
        var forwardedFor = request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwardedFor)) return forwardedFor.Split(',')[0].Trim();
        return request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
    }
}
