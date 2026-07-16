using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using FormMaps.Domain.Auth;
using FormMaps.Infrastructure.Auth;

namespace FormMaps.UnitTests.Auth;

public class UserAccessGuardTests
{
    private const string CallerId = "caller-1";

    [Fact]
    public async Task Non_privileged_reading_other_id_is_denied_without_db()
    {
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext(FormMapsRoles.Student, schoolId: null),
            targetUserId: "other-user");

        Assert.False(allowed);
        Assert.False(factory.WasCalled);
    }

    [Fact]
    public async Task Non_privileged_reading_own_id_is_allowed_without_db()
    {
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext(FormMapsRoles.Student, schoolId: null),
            targetUserId: CallerId);

        Assert.True(allowed);
        Assert.False(factory.WasCalled);
    }

    [Fact]
    public async Task Privileged_reading_own_id_is_allowed_without_db()
    {
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext(FormMapsRoles.Counselor, schoolId: "school-1"),
            targetUserId: CallerId);

        Assert.True(allowed);
        Assert.False(factory.WasCalled);
    }

    [Fact]
    public async Task Super_admin_reading_other_id_is_allowed_without_db()
    {
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext(FormMapsRoles.SuperAdmin, schoolId: null),
            targetUserId: "other-user");

        Assert.True(allowed);
        Assert.False(factory.WasCalled);
    }

    [Fact]
    public async Task Raw_admin_alias_is_not_privileged_and_is_own_record_only()
    {
        // Legacy canAccessUser branches on the RAW role string. "admin" is NOT in
        // PRIVILEGED_ROLES, so it must be treated as own-record-only — never as Super Admin.
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext("admin", schoolId: null),
            targetUserId: "other-user");

        Assert.False(allowed);
        Assert.False(factory.WasCalled);
    }

    [Fact]
    public async Task School_admin_without_school_context_is_denied_without_db()
    {
        var factory = new ThrowingSessionFactory();
        var guard = new UserAccessGuard(factory);

        var allowed = await guard.CanAccessUserAsync(
            BuildContext(FormMapsRoles.SchoolAdmin, schoolId: null),
            targetUserId: "other-user");

        Assert.False(allowed);
        Assert.False(factory.WasCalled);
    }

    private static RequestContext BuildContext(string rawRole, string? schoolId)
    {
        var actor = new RequestActor(
            UserId: CallerId,
            Role: rawRole,
            Email: "caller@example.test",
            Name: "Caller");

        return RequestContext.Authenticated(
            actor,
            schoolId,
            permissions: [FormMapsPermissions.ProfileRead],
            tokenSource: TokenSource.DevelopmentHeader,
            isDevelopmentOverride: true);
    }

    private sealed class ThrowingSessionFactory : IFormMapsDatabaseSessionFactory
    {
        public bool WasCalled { get; private set; }

        public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
            RequestContext requestContext,
            CancellationToken cancellationToken = default)
        {
            WasCalled = true;
            throw new InvalidOperationException(
                "Database access must not occur for pure access-guard branches.");
        }
    }
}
