using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Http;

namespace FormMaps.IntegrationTests.Auth;

public class DevelopmentRequestContextFactoryTests
{
    [Fact]
    public void TryCreate_builds_context_from_development_headers()
    {
        var headers = new HeaderDictionary
        {
            [DevelopmentRequestContextFactory.UserIdHeader] = "user-123",
            [DevelopmentRequestContextFactory.RoleHeader] = "counselor",
            [DevelopmentRequestContextFactory.SchoolIdHeader] = "school-123",
            [DevelopmentRequestContextFactory.EmailHeader] = "user@example.test",
            [DevelopmentRequestContextFactory.NameHeader] = "Counselor User",
            [DevelopmentRequestContextFactory.PermissionsHeader] = "students:read,reports:read"
        };

        var created = DevelopmentRequestContextFactory.TryCreate(headers, out var context);

        Assert.True(created);
        Assert.True(context.IsAuthenticated);
        Assert.Equal("user-123", context.Actor?.UserId);
        Assert.Equal("counselor", context.Actor?.NormalizedRole);
        Assert.Equal("school-123", context.Tenant?.SchoolId);
        Assert.Contains("students:read", context.Permissions);
        Assert.True(context.IsDevelopmentOverride);
    }

    [Fact]
    public void TryCreate_rejects_missing_required_development_headers()
    {
        var headers = new HeaderDictionary
        {
            [DevelopmentRequestContextFactory.UserIdHeader] = "user-123"
        };

        var created = DevelopmentRequestContextFactory.TryCreate(headers, out var context);

        Assert.False(created);
        Assert.False(context.IsAuthenticated);
    }
}
