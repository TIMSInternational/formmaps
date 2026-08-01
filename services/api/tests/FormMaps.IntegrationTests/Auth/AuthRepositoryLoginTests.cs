using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryLoginTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task FindUserByEmail_ExistingActiveUser_ReturnsRow()
    {
        await fixture.ResetAsync();
        await fixture.SeedUserAsync(email: "ada@example.com", passwordHash: "hash", isActive: true);
        var repo = CreateRepository();

        var row = await repo.FindUserByEmailAsync("ada@example.com", CancellationToken.None);

        Assert.NotNull(row);
        Assert.Equal("ada@example.com", row!.Email);
    }

    [Fact]
    public async Task FindUserByEmail_NoMatch_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        Assert.Null(await repo.FindUserByEmailAsync("nobody@example.com", CancellationToken.None));
    }

    [Fact]
    public async Task RecordFailedLogin_FifthFailure_LocksAccount_ResetsFailedCountToZero()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        const string email = "locked@example.com";

        for (var i = 1; i <= 4; i++)
        {
            var count = await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None);
            Assert.Equal(i, count);
            var status = await repo.GetLockoutStatusAsync(email, CancellationToken.None);
            Assert.False(status.IsLocked);
        }

        await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None); // 5th
        var locked = await repo.GetLockoutStatusAsync(email, CancellationToken.None);
        Assert.True(locked.IsLocked);
        Assert.NotNull(locked.LockedUntil);
        Assert.True(locked.LockedUntil > DateTimeOffset.UtcNow.AddMinutes(14));
    }

    [Fact]
    public async Task ClearLoginAttempts_RemovesTheRow_UnlocksAccount()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        const string email = "cleared@example.com";
        for (var i = 0; i < 5; i++) await repo.RecordFailedLoginAsync(email, "1.2.3.4", CancellationToken.None);
        Assert.True((await repo.GetLockoutStatusAsync(email, CancellationToken.None)).IsLocked);

        await repo.ClearLoginAttemptsAsync(email, CancellationToken.None);

        Assert.False((await repo.GetLockoutStatusAsync(email, CancellationToken.None)).IsLocked);
    }

    [Fact]
    public async Task GetLanguage_DefaultsToEn_WhenNoUserSettingsRow()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        await fixture.SeedUserAsync(email: "nolang@example.com", passwordHash: "hash", isActive: true, id: "u_nolang");
        Assert.Equal("en", await repo.GetLanguageAsync("u_nolang", CancellationToken.None));
    }
}
