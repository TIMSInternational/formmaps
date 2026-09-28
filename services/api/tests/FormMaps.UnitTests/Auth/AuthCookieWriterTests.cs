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

    // ---- The hard session limit ----

    private static int MaxAge(string cookie)
    {
        var part = cookie.Split(';').Select(p => p.Trim()).Single(p => p.StartsWith("max-age=", StringComparison.OrdinalIgnoreCase));
        return int.Parse(part["max-age=".Length..], System.Globalization.CultureInfo.InvariantCulture);
    }

    [Fact]
    public void SetAuthCookies_WithDeadline_WritesSessionExpiresAt_AsEpochMs_JsReadable_RootPath()
    {
        var deadline = new DateTime(2099, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc);
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", 3600, deadline);

        var cookie = context.Response.Headers.SetCookie.First(c => c!.StartsWith("session_expires_at="))!;
        Assert.Equal($"session_expires_at={new DateTimeOffset(deadline).ToUnixTimeMilliseconds()}", cookie.Split(';')[0]);
        Assert.DoesNotContain("httponly", cookie.ToLowerInvariant());
        Assert.Contains("samesite=lax", cookie.ToLowerInvariant());
        Assert.Contains("path=/", cookie);
        Assert.DoesNotContain("path=/authapi", cookie);
    }

    [Fact]
    public void SetAuthCookies_WithDeadline_EveryCookieExpiresWithTheSession_AccessIsTheShorter()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", 3600, DateTime.UtcNow.AddHours(6));
        var lines = context.Response.Headers.SetCookie;

        Assert.InRange(MaxAge(lines.First(c => c!.StartsWith("refresh_token="))!), 6 * 3600 - 5, 6 * 3600);
        Assert.InRange(MaxAge(lines.First(c => c!.StartsWith("logged_in="))!), 6 * 3600 - 5, 6 * 3600);
        Assert.InRange(MaxAge(lines.First(c => c!.StartsWith("session_expires_at="))!), 6 * 3600 - 5, 6 * 3600);
        Assert.Equal(3600, MaxAge(lines.First(c => c!.StartsWith("access_token="))!)); // 1h < 6h left

        // Ten minutes left: the access cookie drops to the deadline too.
        var nearEnd = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(nearEnd.Response, "access.jwt.token", "refresh-token-value", 3600, DateTime.UtcNow.AddMinutes(10));
        Assert.InRange(MaxAge(nearEnd.Response.Headers.SetCookie.First(c => c!.StartsWith("access_token="))!), 595, 600);
    }

    [Fact]
    public void SetAuthCookies_RefreshTokenWithoutDeadline_FallsBackToOneDefaultSession_NotFourteenDays()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", "refresh-token-value", accessExpiresSeconds: 3600);

        var refresh = context.Response.Headers.SetCookie.First(c => c!.StartsWith("refresh_token="))!;
        Assert.InRange(MaxAge(refresh), 12 * 3600 - 5, 12 * 3600);
        Assert.Contains(context.Response.Headers.SetCookie, c => c!.StartsWith("session_expires_at="));
    }

    [Fact]
    public void SetAuthCookies_NoRefreshTokenNoDeadline_WritesNoSessionExpiresAt()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.SetAuthCookies(context.Response, "access.jwt.token", refreshToken: null, accessExpiresSeconds: 3600);

        Assert.DoesNotContain(context.Response.Headers.SetCookie, c => c!.StartsWith("session_expires_at="));
    }

    [Fact]
    public void ClearAuthCookies_AlsoExpiresSessionExpiresAt_OnRootPath()
    {
        var context = new DefaultHttpContext();
        AuthCookieWriter.ClearAuthCookies(context.Response);

        var cookie = context.Response.Headers.SetCookie.First(c => c!.StartsWith("session_expires_at="))!;
        Assert.Contains("expires=Thu, 01 Jan 1970", cookie);
        Assert.Contains("path=/", cookie);
    }

    [Fact]
    public void ToIsoUtc_IsMillisecondIso8601WithZ()
    {
        Assert.Equal("2099-01-02T03:04:05.678Z",
            AuthCookieWriter.ToIsoUtc(new DateTime(2099, 1, 2, 3, 4, 5, 678, DateTimeKind.Utc)));
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
