using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class RolePermissionsTests
{
    [Fact]
    public void SuperAdmin_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "admin:dashboard", "admin:users", "admin:schools", "admin:roles",
            "admin:plans", "admin:payouts", "admin:coaches",
            "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
            "students:read", "students:write", "students:import",
            "courses:read", "courses:write",
            "course-plans:read", "course-plans:write",
            "grades:read", "grades:import",
            "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
            "assessments:read",
            "evaluations:read", "evaluations:manage",
            "reports:read", "reports:school", "analytics:school",
            "alerts:read", "alerts:manage",
            "careers:read", "universities:read",
            "profile:read", "profile:write",
            "subscriptions:read", "subscriptions:manage",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.SuperAdmin).OrderBy(x => x));
    }

    [Fact]
    public void SchoolAdmin_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "school:manage", "school:users", "school:billing", "school:integrations", "school:data-mapping",
            "students:read", "students:write", "students:import",
            "courses:read", "courses:write",
            "course-plans:read", "course-plans:write", "course-plans:approve",
            "grades:read", "grades:import",
            "curriculum:manage", "prerequisites:manage", "graduation:manage", "calendar:manage",
            "assessments:read",
            "evaluations:read", "evaluations:manage",
            "reports:read", "reports:school", "analytics:school",
            "alerts:read", "alerts:manage",
            "careers:read", "universities:read",
            "profile:read", "profile:write",
            "subscriptions:read",
            "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.SchoolAdmin).OrderBy(x => x));
    }

    [Fact]
    public void Counselor_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read",
            "course-plans:read", "course-plans:write", "course-plans:approve",
            "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit",
            "reports:read", "alerts:read", "alerts:manage",
            "counselor:dashboard", "counselor:notes", "counselor:sessions",
            "careers:read", "universities:read", "profile:read", "profile:write",
            "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Counselor).OrderBy(x => x));
    }

    [Fact]
    public void Teacher_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit", "reports:read", "teacher:dashboard",
            "recommendations:respond", "careers:read", "universities:read", "profile:read", "profile:write",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Teacher).OrderBy(x => x));
    }

    [Fact]
    public void Student_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "courses:read", "course-plans:read", "course-plans:write", "grades:read",
            "assessments:take", "assessments:read", "evaluations:read", "reports:read",
            "coaching:book", "counselor:session-request", "careers:read", "universities:read",
            "resume:manage", "portfolio:manage", "learning:access", "profile:read", "profile:write",
            "subscriptions:read",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Student).OrderBy(x => x));
    }

    [Fact]
    public void Coach_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "coaching:dashboard", "coaching:sessions", "coaching:earnings", "coaching:profile",
            "profile:read", "profile:write", "recommendations:respond",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Coach).OrderBy(x => x));
    }

    [Fact]
    public void Parent_HasExactLegacyPermissionSet()
    {
        var expected = new[]
        {
            "students:read", "courses:read", "course-plans:read", "grades:read", "assessments:read",
            "evaluations:read", "evaluations:submit", "reports:read", "counselor:session-request",
            "parent:dashboard", "parent:children", "careers:read", "universities:read",
            "profile:read", "profile:write",
        };
        Assert.Equal(expected.OrderBy(x => x), RolePermissions.For(FormMapsRoles.Parent).OrderBy(x => x));
    }

    [Fact]
    public void UnknownOrRawAlias_NormalizesBeforeLookup()
    {
        // "admin" aliases to school_admin per FormMapsRoles.Normalize — permissions must follow.
        Assert.Equal(RolePermissions.For(FormMapsRoles.SchoolAdmin), RolePermissions.For("admin"));
        Assert.Empty(RolePermissions.For("totally-unknown-role").Except(RolePermissions.For(FormMapsRoles.Student)));
    }

    /// <summary>
    /// Permissions are baked into the access token at issuance (AuthEndpoints/AuthAdminEndpoints all
    /// call <see cref="RolePermissions.For"/> on the user's stored roleName), and requirePermission
    /// gates read them straight off the token. So the platform-only <c>admin:*</c> grants are the
    /// second, independent leg of the "admin" widening — separate from the RLS-bypass leg — and a
    /// bare "admin" principal must not receive any of them.
    /// </summary>
    [Fact]
    public void Bare_admin_gets_no_platform_admin_permissions()
    {
        var granted = RolePermissions.For("admin");

        Assert.DoesNotContain(granted, p => p.StartsWith("admin:", StringComparison.Ordinal));
        Assert.NotEqual(RolePermissions.For(FormMapsRoles.SuperAdmin), granted);
    }
}
