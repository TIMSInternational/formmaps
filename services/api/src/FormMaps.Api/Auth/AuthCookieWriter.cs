namespace FormMaps.Api.Auth;

/// <summary>
/// Port of legacy lib/authCookies.ts::setAuthCookies. Cookie contract is pinned exactly —
/// see docs/migration/auth-tenant-context-contract.md's "Cookie Contract" section:
///   access_token  httpOnly, sameSite=lax, path=/,        maxAge = access token TTL
///   refresh_token httpOnly, sameSite=lax, path=/authapi, maxAge = 14 days
///   logged_in     JS-readable, sameSite=lax, path=/,     maxAge = refresh TTL if a refresh token
///                 is present, else access TTL — it must OUTLIVE the access token so the
///                 frontend's 401-refresh interceptor (gated on this cookie) fires correctly.
/// </summary>
public static class AuthCookieWriter
{
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(14);

    public static void SetAuthCookies(HttpResponse response, string accessToken, string? refreshToken, int accessExpiresSeconds)
    {
        var isProd = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Production", StringComparison.OrdinalIgnoreCase);
        var accessTtl = TimeSpan.FromSeconds(accessExpiresSeconds);

        response.Cookies.Append("access_token", accessToken, new CookieOptions
        {
            HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = accessTtl, Path = "/",
        });

        response.Cookies.Append("logged_in", "true", new CookieOptions
        {
            HttpOnly = false, Secure = isProd, SameSite = SameSiteMode.Lax,
            MaxAge = refreshToken is not null ? RefreshTokenLifetime : accessTtl, Path = "/",
        });

        if (refreshToken is not null)
        {
            response.Cookies.Append("refresh_token", refreshToken, new CookieOptions
            {
                HttpOnly = true, Secure = isProd, SameSite = SameSiteMode.Lax, MaxAge = RefreshTokenLifetime, Path = "/authapi",
            });
        }
    }

    public static void ClearAuthCookies(HttpResponse response)
    {
        response.Cookies.Delete("access_token", new CookieOptions { Path = "/" });
        response.Cookies.Delete("refresh_token", new CookieOptions { Path = "/authapi" });
        response.Cookies.Delete("logged_in", new CookieOptions { Path = "/" });
    }

    public static string GetClientIp(HttpRequest request)
    {
        var forwardedFor = request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwardedFor)) return forwardedFor.Split(',')[0].Trim();
        return request.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
    }
}
