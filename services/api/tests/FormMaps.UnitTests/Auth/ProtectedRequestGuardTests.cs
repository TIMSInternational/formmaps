using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class ProtectedRequestGuardTests
{
    private readonly ProtectedRequestGuard guard = new();

    [Fact]
    public void RequireTenantContext_denies_anonymous_requests()
    {
        var decision = guard.RequireTenantContext(RequestContext.Anonymous());

        Assert.False(decision.Allowed);
        Assert.Equal(401, decision.StatusCode);
        Assert.Equal("missing_identity", decision.Code);
    }

    [Fact]
    public void RequireTenantContext_denies_school_scoped_roles_without_school()
    {
        var context = BuildContext(FormMapsRoles.Counselor, schoolId: null);

        var decision = guard.RequireTenantContext(context);

        Assert.False(decision.Allowed);
        Assert.Equal(403, decision.StatusCode);
        Assert.Equal("missing_school_context", decision.Code);
    }

    [Fact]
    public void RequireTenantContext_allows_students_without_school_context_when_user_identity_exists()
    {
        var context = BuildContext(FormMapsRoles.Student, schoolId: null);

        var decision = guard.RequireTenantContext(context);

        Assert.True(decision.Allowed);
    }

    [Fact]
    public void RequireTenantContext_allows_super_admin_without_school_context()
    {
        var context = BuildContext(FormMapsRoles.SuperAdmin, schoolId: null);

        var decision = guard.RequireTenantContext(context);

        Assert.True(decision.Allowed);
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
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
    }
}
