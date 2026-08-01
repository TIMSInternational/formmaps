using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Covers Task 9's four IAuthRepository additions backing school-admin registration completion
/// (authService.ts's completeSchoolAdminRegistration): FindSchoolByInvitationTokenAsync,
/// EnsureSchoolAdminRoleAsync, UpsertSchoolAdminUserAsync, ActivateSchoolAsync. Individual-method
/// tests cover each primitive's edge cases; the two "CompleteRegistrationFlow_*" tests exercise all
/// four together to prove the full legacy flow (new-admin-email create+activate,
/// existing-admin-email update-in-place) actually composes correctly end to end.
/// </summary>
[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositorySchoolAdminRegistrationTests(AuthDatabaseFixture fixture)
{
    private const string SchoolAdminRoleName = "school_admin";

    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task FindSchoolByInvitationToken_ValidToken_ReturnsSchoolRow()
    {
        await fixture.ResetAsync();
        var schoolId = await fixture.SeedSchoolAsync(
            adminEmail: "admin@newschool.example.com", invitationToken: "tok-valid",
            invitationTokenExpiresAt: DateTimeOffset.UtcNow.AddDays(7));

        var row = await CreateRepository().FindSchoolByInvitationTokenAsync("tok-valid", CancellationToken.None);

        Assert.NotNull(row);
        Assert.Equal(schoolId, row!.Id);
        Assert.Equal("admin@newschool.example.com", row.AdminEmail);
    }

    [Fact]
    public async Task FindSchoolByInvitationToken_UnknownToken_ReturnsNull()
    {
        await fixture.ResetAsync();
        var row = await CreateRepository().FindSchoolByInvitationTokenAsync("tok-does-not-exist", CancellationToken.None);
        Assert.Null(row);
    }

    /// <summary>
    /// Legacy performs the expiry check as a SEPARATE step after the find (see SchoolInviteRow's
    /// doc comment) -- FindSchoolByInvitationTokenAsync must still return the row (with its past
    /// expiry intact) so the caller (Task 12) can produce the distinct "Invitation token has
    /// expired" message, rather than this method silently collapsing an expired token to the same
    /// null as an unknown one.
    /// </summary>
    [Fact]
    public async Task FindSchoolByInvitationToken_ExpiredToken_StillReturnsRowWithPastExpiry()
    {
        await fixture.ResetAsync();
        var expiry = DateTimeOffset.UtcNow.AddDays(-1);
        await fixture.SeedSchoolAsync(adminEmail: "admin@expired.example.com", invitationToken: "tok-expired", invitationTokenExpiresAt: expiry);

        var row = await CreateRepository().FindSchoolByInvitationTokenAsync("tok-expired", CancellationToken.None);

        Assert.NotNull(row);
        Assert.NotNull(row!.InvitationTokenExpiresAt);
        Assert.True(row.InvitationTokenExpiresAt < DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task FindSchoolByInvitationToken_InactiveSchool_ReturnsNull()
    {
        await fixture.ResetAsync();
        await fixture.SeedSchoolAsync(adminEmail: "admin@inactive.example.com", invitationToken: "tok-inactive", isActive: false);
        var row = await CreateRepository().FindSchoolByInvitationTokenAsync("tok-inactive", CancellationToken.None);
        Assert.Null(row);
    }

    [Fact]
    public async Task EnsureSchoolAdminRole_NoExistingRole_CreatesAndReturnsRoleId()
    {
        await fixture.ResetAsync();
        var roleId = await CreateRepository().EnsureSchoolAdminRoleAsync(CancellationToken.None);

        Assert.False(string.IsNullOrWhiteSpace(roleId));
        Assert.Equal(1, await fixture.CountRolesByNameAsync(SchoolAdminRoleName));
    }

    [Fact]
    public async Task EnsureSchoolAdminRole_ExistingRole_ReturnsSameIdWithoutDuplicating()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();

        var firstId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);
        var secondId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);

        Assert.Equal(firstId, secondId);
        Assert.Equal(1, await fixture.CountRolesByNameAsync(SchoolAdminRoleName));
    }

    [Fact]
    public async Task UpsertSchoolAdminUser_NewEmail_CreatesNewAdminUser()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        var roleId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);
        var schoolId = Guid.NewGuid().ToString();

        var user = await repo.UpsertSchoolAdminUserAsync(
            schoolId, "brandnew@example.com", "Brand New Admin", "hashed-pw", roleId, SchoolAdminRoleName, CancellationToken.None);

        Assert.Equal("brandnew@example.com", user.Email);
        Assert.Equal("Brand New Admin", user.Name);
        Assert.Equal(schoolId, user.SchoolId);
        Assert.Equal(roleId, user.RoleId);
        Assert.Equal(SchoolAdminRoleName, user.RoleName);
        Assert.Equal("hashed-pw", user.PasswordHash);
        Assert.True(user.IsActive);
    }

    /// <summary>
    /// Matches legacy's update-vs-create branch: `let user = await prisma.user.findUnique({ where:
    /// { email } }); if (user) { user = await prisma.user.update(...) }`. The pre-existing user's id
    /// must be preserved (in-place update, not a new row), and "passwordNeedsMigration" must be
    /// cleared to false per legacy's update data shape.
    /// </summary>
    [Fact]
    public async Task UpsertSchoolAdminUser_ExistingEmail_UpdatesThatUserInPlace()
    {
        await fixture.ResetAsync();
        var existingUserId = await fixture.SeedUserAsync(
            email: "already-here@example.com", passwordHash: "old-hash", isActive: true,
            name: "Old Name", roleId: "role_teacher", roleName: "teacher", passwordNeedsMigration: true);

        var repo = CreateRepository();
        var roleId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);
        var schoolId = Guid.NewGuid().ToString();

        var user = await repo.UpsertSchoolAdminUserAsync(
            schoolId, "already-here@example.com", "New Admin Name", "new-hash", roleId, SchoolAdminRoleName, CancellationToken.None);

        Assert.Equal(existingUserId, user.Id);
        Assert.Equal("New Admin Name", user.Name);
        Assert.Equal("new-hash", user.PasswordHash);
        Assert.Equal(schoolId, user.SchoolId);
        Assert.Equal(roleId, user.RoleId);
        Assert.Equal(SchoolAdminRoleName, user.RoleName);
        Assert.False(await fixture.GetPasswordNeedsMigrationAsync(existingUserId));
    }

    [Fact]
    public async Task ActivateSchool_ClearsInvitationTokenAndSetsStatusActive()
    {
        await fixture.ResetAsync();
        var schoolId = await fixture.SeedSchoolAsync(
            adminEmail: "admin@activate.example.com", invitationToken: "tok-to-clear",
            invitationTokenExpiresAt: DateTimeOffset.UtcNow.AddDays(7), status: "invited");

        await CreateRepository().ActivateSchoolAsync(schoolId, CancellationToken.None);

        var (status, invitationToken) = await fixture.GetSchoolStatusAsync(schoolId);
        Assert.Equal("active", status);
        Assert.Null(invitationToken);
    }

    [Fact]
    public async Task CompleteRegistrationFlow_NewAdminEmail_CreatesUserAndActivatesSchool()
    {
        await fixture.ResetAsync();
        var schoolId = await fixture.SeedSchoolAsync(
            adminEmail: "newadmin@school.example.com", invitationToken: "tok-flow-new",
            invitationTokenExpiresAt: DateTimeOffset.UtcNow.AddDays(7));

        var repo = CreateRepository();
        var invite = await repo.FindSchoolByInvitationTokenAsync("tok-flow-new", CancellationToken.None);
        Assert.NotNull(invite);
        Assert.False(invite!.InvitationTokenExpiresAt < DateTimeOffset.UtcNow);

        var roleId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);
        var user = await repo.UpsertSchoolAdminUserAsync(
            invite.Id, invite.AdminEmail, "New School Admin", "hashed-pw", roleId, SchoolAdminRoleName, CancellationToken.None);
        await repo.ActivateSchoolAsync(invite.Id, CancellationToken.None);

        Assert.Equal(schoolId, user.SchoolId);
        var (status, invitationToken) = await fixture.GetSchoolStatusAsync(schoolId);
        Assert.Equal("active", status);
        Assert.Null(invitationToken);
    }

    [Fact]
    public async Task CompleteRegistrationFlow_ExistingAdminEmail_UpdatesExistingUserInPlace()
    {
        await fixture.ResetAsync();
        var existingUserId = await fixture.SeedUserAsync(
            email: "returning-admin@school.example.com", passwordHash: "stale-hash", isActive: true,
            name: "Stale Name", roleId: "role_teacher", roleName: "teacher");
        var schoolId = await fixture.SeedSchoolAsync(
            adminEmail: "returning-admin@school.example.com", invitationToken: "tok-flow-existing",
            invitationTokenExpiresAt: DateTimeOffset.UtcNow.AddDays(7));

        var repo = CreateRepository();
        var invite = await repo.FindSchoolByInvitationTokenAsync("tok-flow-existing", CancellationToken.None);
        Assert.NotNull(invite);

        var roleId = await repo.EnsureSchoolAdminRoleAsync(CancellationToken.None);
        var user = await repo.UpsertSchoolAdminUserAsync(
            invite!.Id, invite.AdminEmail, "Fresh Admin Name", "fresh-hash", roleId, SchoolAdminRoleName, CancellationToken.None);
        await repo.ActivateSchoolAsync(invite.Id, CancellationToken.None);

        Assert.Equal(existingUserId, user.Id);
        Assert.Equal(schoolId, user.SchoolId);
        var (status, invitationToken) = await fixture.GetSchoolStatusAsync(schoolId);
        Assert.Equal("active", status);
        Assert.Null(invitationToken);
    }
}
