using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Task 15: standing interop regression suite, distinct from Task 3's narrower
/// <see cref="AccessTokenFactoryTests"/> (which pins one representative role plus the
/// no-schoolId shape as part of driving that implementation). This suite exists purely as a
/// post-hoc regression guard across Tasks 1-14 -- it adds no new production code and asserts
/// no new behavior, only that:
///   1. every one of the 7 canonical <see cref="FormMapsRoles"/> round-trips through the
///      already-live <see cref="LegacyJwtRequestContextFactory"/> with the correct actor role,
///      tenant schoolId, and full <see cref="RolePermissions"/> set for that role;
///   2. the documented "no-school users use schoolId=&quot;&quot;" contract
///      (docs/migration/auth-tenant-context-contract.md, "Tenant Context" section) holds; and
///   3. PasswordHasher.Verify is truly bcryptjs-interoperable in both directions.
/// If any test here fails, that is a real regression in Tasks 1-14, not a spec for new work.
/// </summary>
public class CrossIssuerInteropTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";
    private const string Issuer = "formmaps-api";
    private const string Audience = "formmaps-frontend";

    public static TheoryData<string> AllCanonicalRoles =>
    [
        FormMapsRoles.SuperAdmin,
        FormMapsRoles.SchoolAdmin,
        FormMapsRoles.Counselor,
        FormMapsRoles.Teacher,
        FormMapsRoles.Student,
        FormMapsRoles.Coach,
        FormMapsRoles.Parent,
    ];

    [Theory]
    [MemberData(nameof(AllCanonicalRoles))]
    public void AccessToken_RoundTrips_ForEveryCanonicalRole_WithCorrectRoleTenantAndPermissions(string role)
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        try
        {
            var expectedPermissions = RolePermissions.For(role);
            var claims = new AccessTokenClaims(
                UserId: $"user_{role}",
                Name: "Interop Test User",
                Email: "interop@example.test",
                Role: role,
                SchoolId: "school_interop_1",
                Permissions: expectedPermissions);

            var token = CreateFactory().CreateAccessToken(claims);

            var httpContext = new DefaultHttpContext();
            httpContext.Request.Headers.Authorization = $"Bearer {token}";
            var context = CreateVerifier().Create(httpContext);

            Assert.True(context.IsAuthenticated);
            Assert.NotNull(context.Actor);
            Assert.Equal(role, context.Actor!.Role);
            Assert.Equal(role, context.Actor.NormalizedRole); // all 7 canonical constants are already normal form
            Assert.Equal("school_interop_1", context.Tenant?.SchoolId);
            Assert.Equal(role == FormMapsRoles.SuperAdmin, context.Tenant?.IsSuperAdmin);

            // Full permission set match, not just "contains a couple" -- proves RolePermissions.For(role)
            // (Task 2) and the claim round-trip (Task 3 + already-live LegacyJwtRequestContextFactory)
            // agree on the entire set, in both directions.
            Assert.Equal(
                expectedPermissions.ToHashSet(StringComparer.Ordinal),
                context.Permissions);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    [Fact]
    public void NoSchoolUser_EmptySchoolIdClaim_ProducesTenantScope_MatchingDocumentedContract()
    {
        // docs/migration/auth-tenant-context-contract.md, "Tenant Context" section:
        // "No-school users use schoolId=""" -- i.e. the wire claim (as issued by both the legacy
        // Node signer and this .NET AccessTokenFactory) is the literal empty string, not absent
        // and not null. LegacyJwtRequestContextFactory.BuildContext then runs the claim through
        // EmptyToNull before constructing TenantScope, so the in-process TenantScope.SchoolId for
        // a no-school user is null (own-user-filtering takes over from there, per the same doc
        // section) -- this test pins that exact translation from wire contract to TenantScope.
        Environment.SetEnvironmentVariable("JWT_SECRET", Secret);
        try
        {
            var claims = new AccessTokenClaims(
                UserId: "user_no_school",
                Name: "No School User",
                Email: "noschool@example.test",
                Role: FormMapsRoles.Student,
                SchoolId: "", // the documented wire-contract literal
                Permissions: RolePermissions.For(FormMapsRoles.Student));

            var token = CreateFactory().CreateAccessToken(claims);

            var httpContext = new DefaultHttpContext();
            httpContext.Request.Headers.Authorization = $"Bearer {token}";
            var context = CreateVerifier().Create(httpContext);

            Assert.True(context.IsAuthenticated);
            Assert.NotNull(context.Tenant);
            Assert.Null(context.Tenant!.SchoolId); // "" on the wire -> null in TenantScope, per contract
            Assert.False(context.Tenant.IsSuperAdmin);
            Assert.Equal(context.Actor!.UserId, context.Tenant.UserId); // own-user filtering still keyed correctly
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    [Fact]
    public void PasswordHasher_Verifies_RealBcryptjsFixtureHash()
    {
        // Fixture hash generated for THIS task (independent of Task 1's own fixture in
        // PasswordHasherTests.cs) by running the actual legacy bcryptjs install at
        // /Users/federicotafur/formmaps-platform/api (node_modules/bcryptjs), exactly like Task 1
        // did it -- never invented, never produced by .NET:
        //
        //   node -e "const bcrypt=require('bcryptjs'); \
        //     const h=bcrypt.hashSync('CrossIssuer1!Test',12); \
        //     console.log(h); console.log('self-check:', bcrypt.compareSync('CrossIssuer1!Test', h));"
        //
        // Output (2026-08-01):
        //   $2b$12$MB6RNThlPAJRngFpkjR/ZebpxV93lpTrtMBlKGLPMtMvrmAPYvJ2q
        //   self-check: true
        const string bcryptjsFixtureHash = "$2b$12$MB6RNThlPAJRngFpkjR/ZebpxV93lpTrtMBlKGLPMtMvrmAPYvJ2q";

        var result = PasswordHasher.Verify("CrossIssuer1!Test", bcryptjsFixtureHash);

        Assert.True(result.Valid);
        Assert.False(result.IsLegacyFormat);
    }

    // Manual cross-check performed 2026-08-01 (not automated -- Node is not a test dependency of
    // this suite, so this is recorded as a comment per the Task 15 brief, not re-run on every
    // `dotnet test`):
    //
    // 1. Generated a BCrypt.Net-Next hash of "TestPassword123!" (work factor 12) via a throwaway
    //    console app referencing the same BCrypt.Net-Next 4.2.0 package PasswordHasher.cs uses:
    //      dotnet run   (Program.cs: Console.WriteLine(BCrypt.Net.BCrypt.HashPassword("TestPassword123!", 12));)
    //    Output: $2a$12$dzj54LXb75kDCFiBWxb2Re7e8/IML81Wk/8xWKus6xXDhkcB5iMXu
    //
    // 2. Verified that hash with REAL bcryptjs (not BCrypt.Net-Next) from the legacy repo's own
    //    node_modules install:
    //      cd /Users/federicotafur/formmaps-platform/api
    //      node -e "const bcrypt=require('bcryptjs'); \
    //        console.log('bcryptjs.compareSync result:', \
    //        bcrypt.compareSync('TestPassword123!', '$2a$12$dzj54LXb75kDCFiBWxb2Re7e8/IML81Wk/8xWKus6xXDhkcB5iMXu'));"
    //    Output: bcryptjs.compareSync result: true
    //
    // This confirms cross-compatibility in the reverse direction from Task 1's fixture (which
    // proved bcryptjs-hash -> BCrypt.Net-Next.Verify); together they cover both directions.
    [Fact]
    public void ManualCrossCheck_BCryptNetNextHash_VerifiedAgainstRealBcryptjs_IsDocumentedAbove()
    {
        // This test is a placeholder anchor for the manual cross-check documented in the comment
        // above -- it re-asserts the .NET side of that same claim (Verify() accepts its own Hash()
        // output) so the suite still exercises real code, since the bcryptjs half of the check is
        // inherently a one-off manual step outside this test process.
        var hash = PasswordHasher.Hash("TestPassword123!");
        var result = PasswordHasher.Verify("TestPassword123!", hash);

        Assert.True(result.Valid);
        Assert.False(result.IsLegacyFormat);
    }

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

    private sealed class TestHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Production";

        public string ApplicationName { get; set; } = "FormMaps.IntegrationTests";

        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
