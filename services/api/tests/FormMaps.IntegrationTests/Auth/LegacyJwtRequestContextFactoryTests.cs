using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.IntegrationTests.Auth;

public class LegacyJwtRequestContextFactoryTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";
    private const string Issuer = "formmaps-api";
    private const string Audience = "formmaps-frontend";

    [Fact]
    public void Create_authenticates_legacy_access_token_cookie()
    {
        var token = CreateToken(
            [
                new Claim(JwtRegisteredClaimNames.Sub, "user-123"),
                new Claim("role", "counselor"),
                new Claim("schoolId", "school-123"),
                new Claim("email", "user@example.test"),
                new Claim("name", "Counselor User"),
                new Claim("permissions", "students:read"),
                new Claim("permissions", "reports:read")
            ]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Cookie = $"access_token={token}";

        var context = BuildFactory().Create(httpContext);

        Assert.True(context.IsAuthenticated);
        Assert.Equal(TokenSource.AccessCookie, context.TokenSource);
        Assert.Equal("user-123", context.Actor?.UserId);
        Assert.Equal("counselor", context.Actor?.NormalizedRole);
        Assert.Equal("school-123", context.Tenant?.SchoolId);
        Assert.Contains("students:read", context.Permissions);
        Assert.Contains("reports:read", context.Permissions);
        Assert.False(context.IsDevelopmentOverride);
    }

    [Fact]
    public void Create_authenticates_bearer_token_when_access_cookie_is_absent()
    {
        var token = CreateToken(
            [
                new Claim(JwtRegisteredClaimNames.Sub, "student-123"),
                new Claim("role", "student"),
                new Claim("permissions", """["profile:read","profile:write"]""")
            ]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Authorization = $"Bearer {token}";

        var context = BuildFactory().Create(httpContext);

        Assert.True(context.IsAuthenticated);
        Assert.Equal(TokenSource.AuthorizationBearer, context.TokenSource);
        Assert.Equal("student-123", context.Actor?.UserId);
        Assert.Null(context.Tenant?.SchoolId);
        Assert.Contains("profile:read", context.Permissions);
        Assert.Contains("profile:write", context.Permissions);
    }

    [Fact]
    public void Create_does_not_fall_back_to_bearer_when_access_cookie_is_invalid()
    {
        var validBearer = CreateToken(
            [
                new Claim(JwtRegisteredClaimNames.Sub, "student-123"),
                new Claim("role", "student")
            ]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Cookie = "access_token=not-a-jwt";
        httpContext.Request.Headers.Authorization = $"Bearer {validBearer}";

        var context = BuildFactory().Create(httpContext);

        Assert.False(context.IsAuthenticated);
        Assert.Equal(TokenSource.AccessCookie, context.TokenSource);
        Assert.Equal("invalid_token", context.FailureReason);
    }

    [Fact]
    public void Create_rejects_expired_tokens()
    {
        var token = CreateToken(
            [
                new Claim(JwtRegisteredClaimNames.Sub, "user-123"),
                new Claim("role", "student")
            ],
            expires: DateTime.UtcNow.AddMinutes(-5));
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Authorization = $"Bearer {token}";

        var context = BuildFactory().Create(httpContext);

        Assert.False(context.IsAuthenticated);
        Assert.Equal("token_expired", context.FailureReason);
    }

    [Fact]
    public void Create_rejects_tokens_missing_required_identity_claims()
    {
        var token = CreateToken([new Claim("role", "student")]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers.Authorization = $"Bearer {token}";

        var context = BuildFactory().Create(httpContext);

        Assert.False(context.IsAuthenticated);
        Assert.Equal("missing_required_claims", context.FailureReason);
    }

    [Fact]
    public void Create_authenticates_via_access_token_query_string_on_hub_path_only()
    {
        var token = CreateToken([new Claim(JwtRegisteredClaimNames.Sub, "user-123"), new Claim("role", "student")]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Path = "/hubs/messages/negotiate";
        httpContext.Request.QueryString = new QueryString($"?access_token={token}");

        var context = BuildFactory().Create(httpContext);

        Assert.True(context.IsAuthenticated);
        Assert.Equal("user-123", context.Actor?.UserId);
    }

    [Fact]
    public void Query_string_token_is_ignored_outside_the_hub_path()
    {
        var token = CreateToken([new Claim(JwtRegisteredClaimNames.Sub, "user-123"), new Claim("role", "student")]);
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Path = "/api/v1/messages/conversations";
        httpContext.Request.QueryString = new QueryString($"?access_token={token}");

        var context = BuildFactory().Create(httpContext);

        Assert.False(context.IsAuthenticated); // no cookie, no header — query string not honored off-hub
    }

    [Fact]
    public void Create_allows_development_headers_only_when_no_real_token_is_present()
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers[DevelopmentRequestContextFactory.UserIdHeader] = "dev-user";
        httpContext.Request.Headers[DevelopmentRequestContextFactory.RoleHeader] = "school_admin";
        httpContext.Request.Headers[DevelopmentRequestContextFactory.SchoolIdHeader] = "school-123";

        var context = BuildFactory(environmentName: Environments.Development).Create(httpContext);

        Assert.True(context.IsAuthenticated);
        Assert.True(context.IsDevelopmentOverride);
        Assert.Equal(TokenSource.DevelopmentHeader, context.TokenSource);
    }

    [Fact]
    public void Create_ignores_development_headers_outside_development()
    {
        var httpContext = new DefaultHttpContext();
        httpContext.Request.Headers[DevelopmentRequestContextFactory.UserIdHeader] = "dev-user";
        httpContext.Request.Headers[DevelopmentRequestContextFactory.RoleHeader] = "school_admin";

        var context = BuildFactory(environmentName: Environments.Production).Create(httpContext);

        Assert.False(context.IsAuthenticated);
        Assert.Equal("no_token", context.FailureReason);
    }

    private static LegacyJwtRequestContextFactory BuildFactory(string environmentName = "Production")
    {
        return new LegacyJwtRequestContextFactory(
            Options.Create(new LegacyJwtOptions
            {
                Issuer = Issuer,
                Audience = Audience,
                SecretOverride = Secret,
                ClockSkew = TimeSpan.Zero
            }),
            new TestHostEnvironment(environmentName));
    }

    private static string CreateToken(IEnumerable<Claim> claims, DateTime? expires = null)
    {
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            notBefore: DateTime.UtcNow.AddMinutes(-10),
            expires: expires ?? DateTime.UtcNow.AddMinutes(30),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;

        public string ApplicationName { get; set; } = "FormMaps.IntegrationTests";

        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
