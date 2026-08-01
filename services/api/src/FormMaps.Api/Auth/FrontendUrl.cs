namespace FormMaps.Api.Auth;

/// <summary>
/// Port of legacy lib/frontend-url.ts::frontendBaseUrl(). Single source of truth for the
/// user-facing frontend base URL used by redirects/links that leave the API (account-locked
/// notice, forgot-password reset link, school-admin registration, ...).
///
/// <c>FRONTEND_BASE_URL</c> is set explicitly in every deployed environment; this helper only
/// decides the fallback when it is missing:
///   - Production (ASPNETCORE_ENVIRONMENT == "Production") -> https://app.formmaps.com
///   - everything else (dev/test)                          -> http://localhost:3000
///
/// Matches <see cref="FormMaps.Api.Auth.AuthCookieWriter"/>'s existing environment-detection
/// convention (compares ASPNETCORE_ENVIRONMENT to "Production", not NODE_ENV -- there is no
/// NODE_ENV in a .NET process). A configured env value has its trailing slash(es) stripped,
/// same as legacy's <c>.replace(/\/+$/, "")</c>.
/// </summary>
public static class FrontendUrl
{
    private const string FrontendBaseUrlEnvironmentVariable = "FRONTEND_BASE_URL";
    private const string ProductionFrontendUrl = "https://app.formmaps.com";
    private const string DevelopmentFrontendUrl = "http://localhost:3000";

    public static string BaseUrl()
    {
        var fromEnv = Environment.GetEnvironmentVariable(FrontendBaseUrlEnvironmentVariable)?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return fromEnv.TrimEnd('/');
        }

        var isProd = string.Equals(
            Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Production", StringComparison.OrdinalIgnoreCase);
        return isProd ? ProductionFrontendUrl : DevelopmentFrontendUrl;
    }

    /// <summary>Convenience: base URL + a caller-supplied path/query string, concatenated verbatim.</summary>
    public static string Build(string path) => BaseUrl() + path;
}
