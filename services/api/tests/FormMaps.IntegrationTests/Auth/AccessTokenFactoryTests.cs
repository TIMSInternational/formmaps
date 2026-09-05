using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

// Proves AccessTokenFactory-issued tokens round-trip, unchanged, through the already-LIVE
// LegacyJwtRequestContextFactory.Create(HttpContext) verification path -- the same path a real
// request hits. This is an interop test by construction, not by assertion: if the claim shapes
// ever diverge, LegacyJwtRequestContextFactory.Create rejects the token exactly as it would reject
// any other malformed token.
[Collection(nameof(JwtSecretCollection))]
public class AccessTokenFactoryTests : IDisposable
{
    // formmaps#37: restores whatever JWT_SECRET was before this class ran. Membership in
    // JwtSecretCollection serializes these classes; this scope stops the value leaking
    // between them (ApiSecurityUtilityTests asserts it is ABSENT).
    private readonly JwtSecretScope jwtSecretScope = new(Secret);
    public void Dispose() => jwtSecretScope.Dispose();

    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";
    private const string Issuer = "formmaps-api";
    private const string Audience = "formmaps-frontend";

    // AccessTokenFactory is modeled on RealtimeTicketFactory, which reads JWT_SECRET directly from
    // the environment (ignoring LegacyJwtOptions.SecretOverride) -- so the signer's options below
    // deliberately omit SecretOverride, and tests that sign a token set JWT_SECRET via env var.
    private static AccessTokenFactory CreateFactory() =>
        new(Options.Create(new LegacyJwtOptions
        {
            Issuer = Issuer,
            Audience = Audience,
            ClockSkew = TimeSpan.Zero
        }));

    private static LegacyJwtRequestContextFactory CreateVerifier() =>
        new(
            Options.Create(new LegacyJwtOptions
            {
                Issuer = Issuer,
                Audience = Audience,
                SecretOverride = Secret,
                ClockSkew = TimeSpan.Zero
            }),
            new TestHostEnvironment());

    // The OTHER direction of interop, which the round-trip test above cannot see: once
    // FORMMAPS_ROUTE_AUTH_TO_DOTNET flips, every route still owned by Node validates this token
    // with jsonwebtoken and assigns the claim straight to req.permissions, then calls
    // .includes(permission) on it (legacy middleware/authenticate.ts). Node's own generateAccessToken
    // signs `permissions: string[]`, so the payload must carry a JSON ARRAY. Written as a plain
    // string claim it decodes to the text "[\"a\",\"b\"]" -- a substring test in Node and a string
    // handed to the SPA through GET /api/v1/user/me where string[] is expected. This decodes the raw
    // payload, bypassing every .NET claim reader, and pins the wire shape.
    [Fact]
    public void CreateAccessToken_WritesPermissions_AsAJsonArrayOnTheWire()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        try
        {
            var token = CreateFactory().CreateAccessToken(new AccessTokenClaims(
                UserId: "user_123", Name: "Ada Lovelace", Email: "ada@example.com",
                Role: "school_admin", SchoolId: "school_1",
                Permissions: ["school:manage", "students:read"]));

            using var payload = JsonDocument.Parse(DecodeSegment(token.Split('.')[1]));
            var permissions = payload.RootElement.GetProperty("permissions");

            Assert.Equal(JsonValueKind.Array, permissions.ValueKind);
            Assert.Equal(
                new[] { "school:manage", "students:read" },
                permissions.EnumerateArray().Select(e => e.GetString()).ToArray());
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    private static string DecodeSegment(string base64Url)
    {
        var padded = base64Url.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Encoding.UTF8.GetString(Convert.FromBase64String(padded));
    }

    [Fact]
    public void CreateAccessToken_RoundTripsThrough_LegacyJwtRequestContextFactory()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        try
        {
            var factory = CreateFactory();
            var claims = new AccessTokenClaims(
                UserId: "user_123", Name: "Ada Lovelace", Email: "ada@example.com",
                Role: "school_admin", SchoolId: "school_1",
                Permissions: ["school:manage", "students:read"]);

            var token = factory.CreateAccessToken(claims);

            // The already-LIVE verification path -- proves interop by construction, not just assertion.
            var httpContext = new DefaultHttpContext();
            httpContext.Request.Headers.Authorization = $"Bearer {token}";
            var context = CreateVerifier().Create(httpContext);

            Assert.True(context.IsAuthenticated);
            Assert.Equal("user_123", context.Actor!.UserId);
            Assert.Equal("Ada Lovelace", context.Actor.Name);
            Assert.Equal("ada@example.com", context.Actor.Email);
            Assert.Equal("school_admin", context.Actor.NormalizedRole);
            Assert.Equal("school_1", context.Tenant?.SchoolId);
            Assert.Contains("school:manage", context.Permissions);
            Assert.Contains("students:read", context.Permissions);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    [Fact]
    public void CreateAccessToken_NoSchoolId_ClaimIsEmptyString_NotNull()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        try
        {
            var factory = CreateFactory();
            var claims = new AccessTokenClaims("user_1", "Sam", "sam@example.com", "student", "", []);
            var token = factory.CreateAccessToken(claims);

            var httpContext = new DefaultHttpContext();
            httpContext.Request.Headers.Authorization = $"Bearer {token}";
            var context = CreateVerifier().Create(httpContext);

            Assert.True(context.IsAuthenticated);
            Assert.Null(context.Tenant?.SchoolId);
            Assert.Empty(context.Permissions);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    [Fact]
    public void ExpiresInSeconds_DefaultsTo3600_HonorsEnvOverride()
    {
        Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", null);
        try
        {
            Assert.Equal(3600, CreateFactory().ExpiresInSeconds);

            Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", "30");
            Assert.Equal(1800, CreateFactory().ExpiresInSeconds);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_EXPIRES_IN_MINUTES", null);
        }
    }

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";

        public string ApplicationName { get; set; } = "FormMaps.IntegrationTests";

        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
