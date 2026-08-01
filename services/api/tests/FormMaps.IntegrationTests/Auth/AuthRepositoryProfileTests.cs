using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryProfileTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task GetProfile_ExistingUser_ReturnsRow()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "p@example.com", passwordHash: "h", isActive: true);
        var profile = await CreateRepository().GetProfileAsync(userId, CancellationToken.None);
        Assert.NotNull(profile);
        Assert.Equal("p@example.com", profile!.Email);
    }

    [Fact]
    public async Task GetProfile_NoSubscription_ReturnsNoneStatus()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "nosub@example.com", passwordHash: "h", isActive: true);
        var profile = await CreateRepository().GetProfileAsync(userId, CancellationToken.None);
        Assert.NotNull(profile);
        Assert.Equal("none", profile!.SubscriptionStatus);
    }

    /// <summary>
    /// GetProfileAsync joins "user_subscriptions" (fixture schema extended in Task 8 -- see
    /// auth-schema.sql) the same way authService.ts's getProfile does:
    /// `subscriptions: { where: { isActive: true }, orderBy: { createdDate: "desc" }, take: 1,
    /// select: { status: true } }`. An inactive subscription row must NOT be picked up.
    /// </summary>
    [Fact]
    public async Task GetProfile_WithActiveSubscription_ReturnsLatestActiveStatus()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "subbed@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedSubscriptionAsync(userId, status: "past_due", isActive: false);
        var otherUserId = await fixture.SeedUserAsync(email: "subbed-active@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedSubscriptionAsync(otherUserId, status: "active", isActive: true);

        var inactiveProfile = await CreateRepository().GetProfileAsync(userId, CancellationToken.None);
        var activeProfile = await CreateRepository().GetProfileAsync(otherUserId, CancellationToken.None);

        Assert.Equal("none", inactiveProfile!.SubscriptionStatus);
        Assert.Equal("active", activeProfile!.SubscriptionStatus);
    }

    [Fact]
    public async Task FindUserByIdWithRole_ExistingUser_ReturnsRow()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "byid@example.com", passwordHash: "h", isActive: true, roleId: "role_teacher", roleName: "teacher");
        var user = await CreateRepository().FindUserByIdWithRoleAsync(userId, CancellationToken.None);
        Assert.NotNull(user);
        Assert.Equal("byid@example.com", user!.Email);
        Assert.Equal("teacher", user.RoleName);
    }

    [Fact]
    public async Task FindUserByIdWithRole_MissingUser_ReturnsNull()
    {
        await fixture.ResetAsync();
        var user = await CreateRepository().FindUserByIdWithRoleAsync(Guid.NewGuid().ToString(), CancellationToken.None);
        Assert.Null(user);
    }

    [Fact]
    public async Task UpdatePassword_PersistsNewHash()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "pw@example.com", passwordHash: "old-hash", isActive: true);
        var repo = CreateRepository();

        await repo.UpdatePasswordAsync(userId, "new-hash", CancellationToken.None);

        var user = await repo.FindUserByIdWithRoleAsync(userId, CancellationToken.None);
        Assert.Equal("new-hash", user!.PasswordHash);
    }

    [Fact]
    public async Task ChangeEmail_HappyPath_UpdatesEmail()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "old@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "new@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Ok, result);
    }

    [Fact]
    public async Task ChangeEmail_AlreadyInUse_ReturnsConflict()
    {
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "taken@example.com", passwordHash: "h", isActive: true);
        var userId = await fixture.SeedUserAsync(email: "other@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "taken@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Conflict, result);
    }

    [Fact]
    public async Task ChangeEmail_AgainstInactiveDuplicate_StillConflict()
    {
        // Legacy: the DB unique constraint on users.email spans inactive users too — a
        // pre-check limited to isActive:true would miss this and 500 on the real constraint.
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "ghost@example.com", passwordHash: "h", isActive: false);
        var userId = await fixture.SeedUserAsync(email: "live@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "ghost@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.Conflict, result);
    }

    [Fact]
    public async Task ChangeEmail_SameEmail_ReturnsSameEmail()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "same@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeEmailAsync(userId, "same@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.SameEmail, result);
    }

    [Fact]
    public async Task ChangeEmail_MissingUser_ReturnsNotFound()
    {
        await fixture.ResetAsync();
        var result = await CreateRepository().ChangeEmailAsync(Guid.NewGuid().ToString(), "whoever@example.com", CancellationToken.None);
        Assert.Equal(ChangeEmailResult.NotFound, result);
    }

    /// <summary>
    /// The pre-check SELECT alone is not a sufficient conflict guard -- two callers can both pass
    /// it for the SAME new email in the window before either commits (classic TOCTOU race, same
    /// class of bug as Task 7's refresh-token-rotation fix). This races two REAL concurrent
    /// ChangeEmailAsync calls (two different source users, same target email) against the same
    /// repository instance -- each call opens its own connection/transaction via the session
    /// factory, so this genuinely races at the DB level. Exactly one must land Ok; the loser must
    /// be caught by the Postgres 23505 unique-violation catch on the UPDATE itself, not silently
    /// succeed or throw uncaught.
    /// </summary>
    [Fact]
    public async Task ChangeEmail_ConcurrentRaceForSameNewEmail_ExactlyOneWins()
    {
        await fixture.ResetAsync();
        var userA = await fixture.SeedUserAsync(email: "racer-a@example.com", passwordHash: "h", isActive: true);
        var userB = await fixture.SeedUserAsync(email: "racer-b@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();

        var results = await Task.WhenAll(
            repo.ChangeEmailAsync(userA, "shared-target@example.com", CancellationToken.None),
            repo.ChangeEmailAsync(userB, "shared-target@example.com", CancellationToken.None));

        Assert.Equal(1, results.Count(r => r == ChangeEmailResult.Ok));
        Assert.Equal(1, results.Count(r => r == ChangeEmailResult.Conflict));
    }

    [Fact]
    public async Task ChangeRole_HappyPath_UpdatesRoleIdAndName()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "r@example.com", passwordHash: "h", isActive: true);
        var newRoleId = await fixture.SeedRoleAsync("teacher");
        var result = await CreateRepository().ChangeRoleAsync(userId, newRoleId, CancellationToken.None);
        Assert.NotNull(result);
        Assert.Equal("teacher", result!.NewRoleName);
    }

    [Fact]
    public async Task ChangeRole_AlreadyHasRole_ReturnsNull()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "samerole@example.com", passwordHash: "h", isActive: true, roleId: "role_student", roleName: "student");
        var result = await CreateRepository().ChangeRoleAsync(userId, "role_student", CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task ChangeRole_RoleNotFoundOrInactive_ReturnsNull()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "norole@example.com", passwordHash: "h", isActive: true);
        var result = await CreateRepository().ChangeRoleAsync(userId, Guid.NewGuid().ToString(), CancellationToken.None);
        Assert.Null(result);
    }
}
