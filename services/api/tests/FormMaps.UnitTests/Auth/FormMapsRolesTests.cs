using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class FormMapsRolesTests
{
    [Theory]
    [InlineData("Super Admin", FormMapsRoles.SuperAdmin)]
    [InlineData("super_admin", FormMapsRoles.SuperAdmin)]
    [InlineData("superadmin", FormMapsRoles.SuperAdmin)]
    [InlineData("school admin", FormMapsRoles.SchoolAdmin)]
    [InlineData("school_admin", FormMapsRoles.SchoolAdmin)]
    [InlineData("user", FormMapsRoles.Student)]
    [InlineData("staff", FormMapsRoles.Parent)]
    [InlineData(null, FormMapsRoles.Student)]
    public void Normalize_matches_legacy_role_aliases(string? raw, string expected)
    {
        Assert.Equal(expected, FormMapsRoles.Normalize(raw));
    }

    // ---------------------------------------------------------------- bare "admin" is school-scoped

    /// <summary>
    /// The bare token "admin" must NEVER resolve to the platform SuperAdmin role. That alias made any
    /// principal spelled "admin" a platform super admin, which in turn drives
    /// <c>TenantGucPlanResolver</c> to emit <c>app.bypass_rls='on'</c> — the single predicate every
    /// production RLS policy short-circuits on. Casing/padding variants are included because
    /// Normalize trims and lowercases before matching, so they are the same input class.
    /// </summary>
    [Theory]
    [InlineData("admin")]
    [InlineData("Admin")]
    [InlineData("ADMIN")]
    [InlineData("  admin  ")]
    public void Bare_admin_never_normalizes_to_super_admin(string raw)
    {
        Assert.NotEqual(FormMapsRoles.SuperAdmin, FormMapsRoles.Normalize(raw));
        Assert.Equal(FormMapsRoles.SchoolAdmin, FormMapsRoles.Normalize(raw));
    }

    /// <summary>
    /// The consequence that actually matters at the guard: a school-scoped role must be required to
    /// carry school context. SuperAdmin is exempt from this (RequiresSchoolContext is false for it),
    /// which is precisely how an "admin"-spelled principal used to skip tenant scoping entirely.
    /// </summary>
    [Fact]
    public void Bare_admin_requires_school_context_and_super_admin_does_not()
    {
        Assert.True(FormMapsRoles.RequiresSchoolContext("admin"));
        Assert.False(FormMapsRoles.RequiresSchoolContext(FormMapsRoles.SuperAdmin));
    }
}
