using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Auth;

public class FormMapsRolesTests
{
    [Theory]
    [InlineData("Super Admin", FormMapsRoles.SuperAdmin)]
    [InlineData("super_admin", FormMapsRoles.SuperAdmin)]
    [InlineData("admin", FormMapsRoles.SuperAdmin)]
    [InlineData("school admin", FormMapsRoles.SchoolAdmin)]
    [InlineData("school_admin", FormMapsRoles.SchoolAdmin)]
    [InlineData("user", FormMapsRoles.Student)]
    [InlineData("staff", FormMapsRoles.Parent)]
    [InlineData(null, FormMapsRoles.Student)]
    public void Normalize_matches_legacy_role_aliases(string? raw, string expected)
    {
        Assert.Equal(expected, FormMapsRoles.Normalize(raw));
    }
}
