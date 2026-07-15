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
