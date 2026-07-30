using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Domain.Auth;

namespace FormMaps.UnitTests.Resumes;

/// <summary>
/// Pure port of resume.ts GET /:id's fallback target-id resolution (lib/access.ts resolveSecureUserId, pre-canAccessUser).
/// </summary>
public sealed class ResumeAccessResolutionTests
{
    private static RequestContext Caller(string userId, string role) =>
        RequestContext.Authenticated(
            new RequestActor(userId, role, "u@e.st", "User"),
            schoolId: null,
            permissions: Array.Empty<string>(),
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);

    [Fact]
    public void Non_privileged_caller_is_always_forced_to_self_regardless_of_requested_id()
    {
        var caller = Caller("student-1", FormMapsRoles.Student);
        Assert.Equal("student-1", ResumeAccessResolution.ResolveTargetUserId(caller, "someone-else"));
    }

    [Fact]
    public void Non_privileged_caller_with_null_requested_id_resolves_to_self()
    {
        var caller = Caller("student-1", FormMapsRoles.Student);
        Assert.Equal("student-1", ResumeAccessResolution.ResolveTargetUserId(caller, null));
    }

    [Theory]
    [InlineData(FormMapsRoles.SuperAdmin)]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    public void Privileged_caller_gets_requested_id_resolved(string role)
    {
        var caller = Caller("admin-1", role);
        Assert.Equal("target-9", ResumeAccessResolution.ResolveTargetUserId(caller, "target-9"));
    }

    [Theory]
    [InlineData(FormMapsRoles.SuperAdmin)]
    [InlineData(FormMapsRoles.SchoolAdmin)]
    [InlineData(FormMapsRoles.Counselor)]
    public void Privileged_caller_with_null_or_me_resolves_to_self(string role)
    {
        var caller = Caller("admin-1", role);
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, null));
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, "me"));
    }

    [Fact]
    public void Privileged_caller_requesting_own_id_resolves_to_self()
    {
        var caller = Caller("admin-1", FormMapsRoles.SuperAdmin);
        Assert.Equal("admin-1", ResumeAccessResolution.ResolveTargetUserId(caller, "admin-1"));
    }
}
