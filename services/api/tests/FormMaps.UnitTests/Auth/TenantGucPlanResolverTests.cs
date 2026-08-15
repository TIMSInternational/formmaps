using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class TenantGucPlanResolverTests
{
    [Fact]
    public void Resolve_denies_missing_context_by_default()
    {
        var plan = TenantGucPlanResolver.Resolve(context: null);

        Assert.Equal(TenantGucPlanMode.Deny, plan.Mode);
    }

    [Fact]
    public void Resolve_bypasses_missing_context_only_with_explicit_opt_out()
    {
        var plan = TenantGucPlanResolver.Resolve(context: null, allowMissingContextBypass: true);

        Assert.Equal(TenantGucPlanMode.Bypass, plan.Mode);
    }

    [Fact]
    public void Resolve_bypasses_system_context()
    {
        var plan = TenantGucPlanResolver.Resolve(RequestContext.System());

        Assert.Equal(TenantGucPlanMode.Bypass, plan.Mode);
    }

    [Fact]
    public void Resolve_bypasses_super_admin_context()
    {
        var plan = TenantGucPlanResolver.Resolve(BuildContext(FormMapsRoles.SuperAdmin, schoolId: null));

        Assert.Equal(TenantGucPlanMode.Bypass, plan.Mode);
    }

    [Fact]
    public void Resolve_sets_identity_context_for_school_users()
    {
        var plan = TenantGucPlanResolver.Resolve(BuildContext(FormMapsRoles.Counselor, "school-123"));

        Assert.Equal(TenantGucPlanMode.Identity, plan.Mode);
        Assert.Equal("school-123", plan.SchoolId);
        Assert.Equal("user-123", plan.UserId);
    }

    [Fact]
    public void Resolve_sets_empty_school_identity_for_no_school_users()
    {
        var plan = TenantGucPlanResolver.Resolve(BuildContext(FormMapsRoles.Student, schoolId: null));

        Assert.Equal(TenantGucPlanMode.Identity, plan.Mode);
        Assert.Equal(string.Empty, plan.SchoolId);
        Assert.Equal("user-123", plan.UserId);
    }

    [Fact]
    public void Resolve_denies_anonymous_context()
    {
        var plan = TenantGucPlanResolver.Resolve(RequestContext.Anonymous());

        Assert.Equal(TenantGucPlanMode.Deny, plan.Mode);
    }

    /// <summary>
    /// This is the RLS leg of the "admin" widening, asserted on the real production decision function
    /// rather than on any repository. Bypass mode makes
    /// <see cref="FormMaps.Infrastructure.Data.RlsSessionCommandBuilder"/> emit
    /// <c>set_config('app.bypass_rls','on')</c>, and every vendored production policy
    /// (TestSupport/Rls/*.sql) begins with <c>current_setting('app.bypass_rls', true) = 'on'</c> —
    /// so Bypass is total cross-tenant visibility, not a narrowing. A bare "admin" principal must get
    /// Identity mode, scoped to its own school, exactly like any other school-level role.
    /// </summary>
    [Theory]
    [InlineData("admin")]
    [InlineData("Admin")]
    [InlineData("ADMIN")]
    public void Resolve_does_not_bypass_rls_for_bare_admin(string role)
    {
        var plan = TenantGucPlanResolver.Resolve(BuildContext(role, "school-123"));

        Assert.NotEqual(TenantGucPlanMode.Bypass, plan.Mode);
        Assert.Equal(TenantGucPlanMode.Identity, plan.Mode);
        Assert.Equal("school-123", plan.SchoolId);
        Assert.Equal("user-123", plan.UserId);
    }

    /// <summary>
    /// The cross-tenant case specifically: a bare "admin" carrying NO school context must not fall
    /// back to Bypass. It gets an empty-school identity, and every production policy's
    /// <c>current_setting('app.current_school_id', true) &lt;&gt; ''</c> guard then makes the
    /// school-match arm unsatisfiable — so the row set collapses to its own records instead of
    /// widening to every tenant.
    /// </summary>
    [Fact]
    public void Resolve_does_not_bypass_rls_for_bare_admin_without_school()
    {
        var plan = TenantGucPlanResolver.Resolve(BuildContext("admin", schoolId: null));

        Assert.Equal(TenantGucPlanMode.Identity, plan.Mode);
        Assert.Equal(string.Empty, plan.SchoolId);
    }

    private static RequestContext BuildContext(string role, string? schoolId)
    {
        var actor = new RequestActor(
            UserId: "user-123",
            Role: role,
            Email: "user@example.test",
            Name: "Test User");

        return RequestContext.Authenticated(
            actor,
            schoolId,
            permissions: [FormMapsPermissions.ProfileRead],
            tokenSource: TokenSource.AuthorizationBearer,
            isDevelopmentOverride: false);
    }
}
