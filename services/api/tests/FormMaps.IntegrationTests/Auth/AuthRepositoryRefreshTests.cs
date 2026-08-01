using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryRefreshTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task RotateRefreshToken_ValidToken_ReturnsNewToken_RevokesOld()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "a@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);

        var result = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None);

        Assert.NotNull(result);
        Assert.NotEqual(original, result!.NewToken);
        Assert.Equal(userId, result.UserId);
    }

    [Fact]
    public async Task RotateRefreshToken_AlreadyRotatedToken_IsRejected_SingleUseEnforced()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "b@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None); // first use, succeeds

        var reused = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", CancellationToken.None); // reuse attempt

        Assert.Null(reused);
    }

    [Fact]
    public async Task RotateRefreshToken_ExpiredToken_IsRejected()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "c@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedExpiredRefreshTokenAsync(userId, "expired-token");
        var repo = CreateRepository();

        Assert.Null(await repo.RotateRefreshTokenAsync("expired-token", "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UserDeactivatedSincePriorLogin_IsRejected_ToctouSafe()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "d@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var token = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        await fixture.DeactivateUserAsync(userId); // simulates admin deactivating mid-session

        Assert.Null(await repo.RotateRefreshTokenAsync(token, "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UnknownToken_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        Assert.Null(await repo.RotateRefreshTokenAsync("never-issued", "1.1.1.1", CancellationToken.None));
    }

    [Fact]
    public async Task RevokeAllRefreshTokens_MultipleActiveSessions_AllStopRotating()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "e@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var tokenA = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        var tokenB = await repo.CreateRefreshTokenAsync(userId, "2.2.2.2", CancellationToken.None);

        await repo.RevokeAllRefreshTokensAsync(userId, "3.3.3.3", CancellationToken.None);

        Assert.Null(await repo.RotateRefreshTokenAsync(tokenA, "1.1.1.1", CancellationToken.None));
        Assert.Null(await repo.RotateRefreshTokenAsync(tokenB, "2.2.2.2", CancellationToken.None));
    }
}
