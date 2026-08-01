using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace FormMaps.UnitTests.Auth;

public class AuthCookieWriterTests
{
    [Fact]
    public void SetAuthCookies_WithRefreshToken_SetsAllThreeCookies_WithExactFlags()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.Contains("access_token=access.jwt.token", setCookies);
        Assert.Contains("refresh_token=refresh-token-value", setCookies);
        Assert.Contains("logged_in=true", setCookies);

        // path scoping: access_token and logged_in are path=/, refresh_token is path=/authapi
        Assert.Contains("path=/authapi", setCookies);

        // httpOnly on access_token and refresh_token, NOT on logged_in (JS-readable sentinel)
        var cookieLines = context.Response.Headers.SetCookie;
        var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
        var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));
        var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));
        Assert.Contains("httponly", accessCookie!.ToLowerInvariant());
        Assert.Contains("httponly", refreshCookie!.ToLowerInvariant());
        Assert.DoesNotContain("httponly", loggedInCookie!.ToLowerInvariant());
    }

    [Fact]
    public void SetAuthCookies_NoRefreshToken_DoesNotSetRefreshCookie_LoggedInUsesAccessTtl()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", refreshToken: null, accessExpiresSeconds: 3600);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.DoesNotContain("refresh_token=", setCookies);
        Assert.Contains("logged_in=true", setCookies);
    }

    [Fact]
    public void ClearAuthCookies_ExpiresAllThreeCookies()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.ClearAuthCookies(context.Response);

        var setCookies = context.Response.Headers.SetCookie.ToString();
        Assert.Contains("access_token=", setCookies);
        Assert.Contains("refresh_token=", setCookies);
        Assert.Contains("logged_in=", setCookies);
    }

    [Fact]
    public void SetAuthCookies_EachCookie_HasSameSiteLax()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var cookieLines = context.Response.Headers.SetCookie;
        var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
        var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));
        var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));

        Assert.Contains("samesite=lax", accessCookie!.ToLowerInvariant());
        Assert.Contains("samesite=lax", refreshCookie!.ToLowerInvariant());
        Assert.Contains("samesite=lax", loggedInCookie!.ToLowerInvariant());
    }

    [Fact]
    public void SetAuthCookies_PathScoping_AccessTokenAndLoggedInUseRootPath()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var cookieLines = context.Response.Headers.SetCookie;
        var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
        var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));

        Assert.Contains("path=/", accessCookie!);
        Assert.Contains("path=/", loggedInCookie!);
    }

    [Fact]
    public void SetAuthCookies_PathScoping_RefreshTokenUsesAuthApiPath()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var cookieLines = context.Response.Headers.SetCookie;
        var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));

        Assert.Contains("path=/authapi", refreshCookie!);
    }

    [Fact]
    public void SetAuthCookies_InProduction_SetsSecureFlag()
    {
        var originalEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Production");
            var context = new DefaultHttpContext();
            AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

            var cookieLines = context.Response.Headers.SetCookie;
            var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
            var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));
            var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));

            Assert.Contains("secure", accessCookie!.ToLowerInvariant());
            Assert.Contains("secure", refreshCookie!.ToLowerInvariant());
            Assert.Contains("secure", loggedInCookie!.ToLowerInvariant());
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", originalEnv);
        }
    }

    [Fact]
    public void SetAuthCookies_InDevelopment_DoesNotSetSecureFlag()
    {
        var originalEnv = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        try
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Development");
            var context = new DefaultHttpContext();
            AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

            var cookieLines = context.Response.Headers.SetCookie;
            var accessCookie = cookieLines.First(c => c!.StartsWith("access_token="));
            var refreshCookie = cookieLines.First(c => c!.StartsWith("refresh_token="));
            var loggedInCookie = cookieLines.First(c => c!.StartsWith("logged_in="));

            Assert.DoesNotContain("secure", accessCookie!.ToLowerInvariant());
            Assert.DoesNotContain("secure", refreshCookie!.ToLowerInvariant());
            Assert.DoesNotContain("secure", loggedInCookie!.ToLowerInvariant());
        }
        finally
        {
            Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", originalEnv);
        }
    }
}
