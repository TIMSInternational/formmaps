using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Regression cover for the bare-"admin" privilege widening.
///
/// <para><b>Why these routes and not a fake.</b> These tests drive the REAL authorization path
/// end-to-end: a genuine HS256 token is signed with the host's configured secret, sent over HTTP, and
/// validated by the production <c>LegacyJwtRequestContextFactory</c>, which builds the production
/// <c>RequestActor</c> / <c>TenantScope</c>, which the production <c>ProtectedRequestGuard</c> then
/// judges. Nothing is stubbed and no repository is asserted on — the assertions are about what the
/// pipeline decides about a caller, which is the thing that was wrong.</para>
///
/// <para>The host runs in Production so the development header override
/// (<c>DevelopmentRequestContextFactory</c>) is inert and the JWT path is genuinely exercised; a test
/// that ran in Development could pass while the real token path stayed broken. The connection string
/// is a syntactically valid placeholder — <c>NpgsqlDataSource</c> is constructed eagerly during DI
/// resolution but never dialed, and neither route under test touches the database.</para>
///
/// <para><b>What used to happen.</b> <c>FormMapsRoles.Normalize</c> mapped the bare token "admin" to
/// <c>SuperAdmin</c>. That one alias made an "admin"-spelled principal a PLATFORM super admin:
/// <c>RequiresSchoolContext</c> is false for SuperAdmin, so <c>ProtectedRequestGuard</c> stopped
/// requiring a school; and <c>TenantGucPlanResolver</c> returned <c>Bypass</c>, which emits
/// <c>set_config('app.bypass_rls','on')</c> — the exact predicate every vendored production RLS
/// policy short-circuits on. RLS was therefore not an independent backstop.</para>
/// </summary>
public class BareAdminRoleEscalationTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";
    private const string Issuer = "formmaps-api";
    private const string Audience = "formmaps-frontend";

    private const string CurrentPath = "/api/v1/context/current";
    private const string ProtectedPath = "/api/v1/context/protected-smoke";

    /// <summary>
    /// The headline assertion. A token whose role claim is the bare string "admin" must not produce a
    /// super-admin tenant scope. <c>tenant.isSuperAdmin</c> is the flag that drives the RLS bypass, so
    /// this is the cross-tenant blast radius expressed as a single boolean.
    /// </summary>
    [Theory]
    [InlineData("admin")]
    [InlineData("Admin")]
    [InlineData("ADMIN")]
    public async Task Bare_admin_token_is_not_a_platform_super_admin(string role)
    {
        using var client = Client();

        var response = await client.SendAsync(Get(CurrentPath, Token(role, schoolId: "school-1")));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");

        Assert.True(data.GetProperty("isAuthenticated").GetBoolean());
        Assert.False(data.GetProperty("tenant").GetProperty("isSuperAdmin").GetBoolean());
        Assert.Equal("school_admin", data.GetProperty("actor").GetProperty("role").GetString());
    }

    /// <summary>
    /// A genuine Super Admin token still works — the fix must close the alias without breaking the
    /// role it was aliasing to. This is the positive control that keeps the test above honest: without
    /// it, deleting the SuperAdmin branch entirely would also pass.
    /// </summary>
    [Theory]
    [InlineData("Super Admin")]
    [InlineData("super_admin")]
    [InlineData("superadmin")]
    public async Task Canonical_super_admin_spellings_still_grant_super_admin(string role)
    {
        using var client = Client();

        var response = await client.SendAsync(Get(CurrentPath, Token(role, schoolId: null)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");

        Assert.True(data.GetProperty("tenant").GetProperty("isSuperAdmin").GetBoolean());
        Assert.Equal("Super Admin", data.GetProperty("actor").GetProperty("role").GetString());
    }

    /// <summary>
    /// The guard consequence, measured at a route that actually calls
    /// <c>IProtectedRequestGuard.RequireTenantContext</c>. A bare "admin" carrying NO school claim is
    /// now a school-scoped role without school context, so it must be refused with the specific
    /// <c>missing_school_context</c> code. Before the fix this returned 200: SuperAdmin is exempt from
    /// <c>RequiresSchoolContext</c>, so the principal sailed through with no tenant scoping at all.
    ///
    /// <para>This 403 is also the intended operational signal. If the production role census turns out
    /// to contain real PLATFORM administrators stored as "admin", they surface here as a loud, precise
    /// refusal rather than as silent partial access — see the PR notes.</para>
    /// </summary>
    [Fact]
    public async Task Bare_admin_without_school_context_is_refused_by_the_guard()
    {
        using var client = Client();

        var response = await client.SendAsync(Get(ProtectedPath, Token("admin", schoolId: null)));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_school_context", doc.RootElement.GetProperty("code").GetString());
    }

    /// <summary>
    /// The same principal WITH school context passes the guard — confirming the refusal above is about
    /// missing tenant scope, not about the role being rejected outright. A real school administrator
    /// stored as "admin" keeps working.
    /// </summary>
    [Fact]
    public async Task Bare_admin_with_school_context_passes_the_guard()
    {
        using var client = Client();

        var response = await client.SendAsync(Get(ProtectedPath, Token("admin", schoolId: "school-1")));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// A Super Admin has no school and must still pass — the exemption that makes platform admins work
    /// is intact. Paired with the test above, this pins the exemption to the canonical spellings only.
    /// </summary>
    [Fact]
    public async Task Canonical_super_admin_without_school_still_passes_the_guard()
    {
        using var client = Client();

        var response = await client.SendAsync(Get(ProtectedPath, Token("Super Admin", schoolId: null)));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // The second leg of the widening — the platform admin:* permission set that RolePermissions.For
    // handed to a bare "admin" — is asserted in FormMaps.UnitTests/Auth/RolePermissionsTests. It is
    // deliberately NOT re-asserted here: this pipeline echoes the token's own permissions claim and
    // never synthesizes grants, so an HTTP-level assertion would pass no matter what the role map
    // said, which is a vacuous test rather than a second line of defense.

    // ---- helpers ----

    private static HttpClient Client() => new Factory().CreateClient();

    private static HttpRequestMessage Get(string path, string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("Authorization", $"Bearer {token}");
        return request;
    }

    private static string Token(string role, string? schoolId)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, "user-under-test"),
            new("role", role),
        };

        if (schoolId is not null)
        {
            claims.Add(new Claim("schoolId", schoolId));
        }

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Secret)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            notBefore: DateTime.UtcNow.AddMinutes(-5),
            expires: DateTime.UtcNow.AddMinutes(30),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            // Production on purpose: it disables the development header override so the JWT path is
            // the only way in, which is what these tests exist to measure.
            builder.UseEnvironment(Environments.Production);
            builder.UseSetting("ConnectionStrings:FormMaps", "Host=localhost;Database=unused;Username=unused;Password=unused");
            builder.UseSetting($"{LegacyJwtOptions.SectionName}:SecretOverride", Secret);
            builder.UseSetting($"{LegacyJwtOptions.SectionName}:Issuer", Issuer);
            builder.UseSetting($"{LegacyJwtOptions.SectionName}:Audience", Audience);
        }
    }
}
