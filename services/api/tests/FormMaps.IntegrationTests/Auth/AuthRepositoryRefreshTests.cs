using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryRefreshTests(AuthDatabaseFixture fixture)
{
    private static readonly SessionPolicy Policy = SessionPolicy.Default;

    // Timestamps round-trip through a timestamp(3) column, so compare at millisecond tolerance.
    private static readonly TimeSpan Tolerance = TimeSpan.FromMilliseconds(5);

    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    private static DateTime Fresh() => Policy.NewDeadline(DateTime.UtcNow);

    // ---- The hard session limit (12h): the refresh token's expiresAt IS the session deadline ----

    [Fact]
    public async Task CreateRefreshToken_PersistsTheDeadlineItIsGiven()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "g@example.com", passwordHash: "h", isActive: true);
        var deadline = Fresh();

        var token = await CreateRepository().CreateRefreshTokenAsync(userId, "1.1.1.1", deadline, CancellationToken.None);

        var stored = await fixture.GetRefreshTokenExpiresAtAsync(token);
        Assert.InRange(stored, deadline - Tolerance, deadline + Tolerance);
        Assert.InRange(stored - DateTime.UtcNow, TimeSpan.FromHours(11.9), TimeSpan.FromHours(12)); // 12h, not 14 days
    }

    [Fact]
    public async Task RotateRefreshToken_InheritsTheSignInDeadline_AcrossRepeatedRotations()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "h@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var signInDeadline = DateTime.UtcNow.AddHours(3); // a sign-in with 3h left
        await fixture.SeedRefreshTokenAsync(userId, "sign-in-token", signInDeadline);

        var first = await repo.RotateRefreshTokenAsync("sign-in-token", "1.1.1.1", Policy, CancellationToken.None);
        var second = await repo.RotateRefreshTokenAsync(first!.NewToken, "1.1.1.1", Policy, CancellationToken.None);

        // Neither rotation restarted the clock: both carry the sign-in's deadline, stored and returned.
        Assert.InRange(first.ExpiresAtUtc, signInDeadline - Tolerance, signInDeadline + Tolerance);
        Assert.InRange(second!.ExpiresAtUtc, signInDeadline - Tolerance, signInDeadline + Tolerance);
        var stored = await fixture.GetRefreshTokenExpiresAtAsync(second.NewToken);
        Assert.InRange(stored, second.ExpiresAtUtc - Tolerance, second.ExpiresAtUtc + Tolerance);
    }

    [Fact]
    public async Task RotateRefreshToken_Legacy14DayToken_IsCappedToOneSession()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "i@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedRefreshTokenAsync(userId, "pre-deploy-token", DateTime.UtcNow.AddDays(14));

        var before = DateTime.UtcNow;
        var result = await CreateRepository().RotateRefreshTokenAsync("pre-deploy-token", "1.1.1.1", Policy, CancellationToken.None);

        Assert.NotNull(result);
        Assert.InRange(result!.ExpiresAtUtc, before.AddHours(12) - Tolerance, DateTime.UtcNow.AddHours(12) + Tolerance);
        var stored = await fixture.GetRefreshTokenExpiresAtAsync(result.NewToken);
        Assert.True(stored < DateTime.UtcNow.AddHours(12).AddSeconds(1), $"stored deadline {stored:o} was not capped");
    }

    [Fact]
    public async Task RotateRefreshToken_NeverExtends_EvenUnderALongerPolicy()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "j@example.com", passwordHash: "h", isActive: true);
        var signInDeadline = DateTime.UtcNow.AddMinutes(30);
        await fixture.SeedRefreshTokenAsync(userId, "short-token", signInDeadline);

        // A policy that would allow a whole week must still not move a 30-minute deadline.
        var week = new SessionPolicy(TimeSpan.FromDays(7));
        var result = await CreateRepository().RotateRefreshTokenAsync("short-token", "1.1.1.1", week, CancellationToken.None);

        Assert.InRange(result!.ExpiresAtUtc, signInDeadline - Tolerance, signInDeadline + Tolerance);
    }

    // ---- Rotation semantics that predate the session limit ----

    [Fact]
    public async Task RotateRefreshToken_ValidToken_ReturnsNewToken_RevokesOld()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "a@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", Fresh(), CancellationToken.None);

        var result = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", Policy, CancellationToken.None);

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
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", Fresh(), CancellationToken.None);
        await repo.RotateRefreshTokenAsync(original, "1.1.1.1", Policy, CancellationToken.None); // first use, succeeds

        var reused = await repo.RotateRefreshTokenAsync(original, "1.1.1.1", Policy, CancellationToken.None); // reuse attempt

        Assert.Null(reused);
    }

    [Fact]
    public async Task RotateRefreshToken_ExpiredToken_IsRejected()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "c@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedExpiredRefreshTokenAsync(userId, "expired-token");
        var repo = CreateRepository();

        Assert.Null(await repo.RotateRefreshTokenAsync("expired-token", "1.1.1.1", Policy, CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UserDeactivatedSincePriorLogin_IsRejected_ToctouSafe()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "d@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var token = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", Fresh(), CancellationToken.None);
        await fixture.DeactivateUserAsync(userId); // simulates admin deactivating mid-session

        Assert.Null(await repo.RotateRefreshTokenAsync(token, "1.1.1.1", Policy, CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_UnknownToken_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();
        Assert.Null(await repo.RotateRefreshTokenAsync("never-issued", "1.1.1.1", Policy, CancellationToken.None));
    }

    [Fact]
    public async Task RotateRefreshToken_ConcurrentRotationOfSameToken_ExactlyOneWins()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "f@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var original = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", Fresh(), CancellationToken.None);

        // Two simultaneous rotation attempts against the SAME token, from the SAME repo instance --
        // each call opens its own connection/transaction via the session factory (see
        // NpgsqlFormMapsDatabaseSessionFactory.OpenAsync), so this genuinely races at the DB level,
        // not just in-process. Without the FOR UPDATE lock on the lookup SELECT, both requests could
        // read "isRevoked" = false before either commits and both mint a replacement token --
        // defeating single-use rotation. With the lock, the loser blocks until the winner commits,
        // then re-reads "isRevoked" = true and returns null.
        var results = await Task.WhenAll(
            repo.RotateRefreshTokenAsync(original, "1.1.1.1", Policy, CancellationToken.None),
            repo.RotateRefreshTokenAsync(original, "2.2.2.2", Policy, CancellationToken.None));

        Assert.Equal(1, results.Count(r => r is not null));
        Assert.Equal(1, results.Count(r => r is null));
    }

    [Fact]
    public async Task RevokeAllRefreshTokens_MultipleActiveSessions_AllStopRotating()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "e@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        var tokenA = await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", Fresh(), CancellationToken.None);
        var tokenB = await repo.CreateRefreshTokenAsync(userId, "2.2.2.2", Fresh(), CancellationToken.None);

        await repo.RevokeAllRefreshTokensAsync(userId, "3.3.3.3", CancellationToken.None);

        Assert.Null(await repo.RotateRefreshTokenAsync(tokenA, "1.1.1.1", Policy, CancellationToken.None));
        Assert.Null(await repo.RotateRefreshTokenAsync(tokenB, "2.2.2.2", Policy, CancellationToken.None));
    }
}
