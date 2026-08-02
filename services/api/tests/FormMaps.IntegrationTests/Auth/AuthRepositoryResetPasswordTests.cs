using FormMaps.Infrastructure.Auth;
using Npgsql;
using Xunit;

namespace FormMaps.IntegrationTests.Auth;

/// <summary>
/// Real-DB (Testcontainers) tests for IAuthRepository's forgot/reset-password slice (Domain 10,
/// Task 10): InvalidatePriorResetTokensAsync, CreatePasswordResetTokenAsync, FindResetTokenAsync,
/// ApplyPasswordResetAsync. The one test that matters most here is
/// <see cref="ApplyPasswordReset_FailureOnThirdWrite_RollsBackEverything_AtomicityProof"/> -- it
/// proves (not just asserts) that ApplyPasswordResetAsync's three writes are genuinely atomic by
/// injecting a REAL Postgres-level failure specifically on the third write (the refresh-token
/// revoke) and confirming, via direct post-attempt reads of the "users"/"password_reset_tokens"/
/// "refresh_tokens" tables, that the first two writes were rolled back too -- not merely that an
/// exception propagated.
///
/// Failure-injection technique: a "clientIp" value containing an embedded null byte
/// ("1.2.3.4\0evil"). Postgres text columns reject embedded null bytes outright (SQLSTATE 22021,
/// "invalid byte sequence for encoding \"UTF8\": 0x00") -- verified empirically against a real
/// Testcontainers postgres:16-alpine instance for this exact three-statement shape before writing
/// this test: the first two UPDATEs (password, token-consumption) execute successfully and are
/// visible to a query on the SAME open transaction, then the third UPDATE (the only one using
/// "clientIp") throws a genuine Npgsql.PostgresException raised by the real server, and -- with NO
/// explicit rollback call anywhere in ApplyPasswordResetAsync -- disposing the session's
/// transaction without a prior commit rolls back all three writes, not just the failing one. This
/// is the same "dispose rolls back the whole transaction" idiom BillingShadowRepository.
/// RunTransactionAsync already relies on for its own genuine-PostgresException (unique-violation)
/// rollback proof; no other precedent for a deterministic single-call genuine-DB-failure rollback
/// test was found elsewhere in this test suite (searched for "Rollback"/"atomic" across
/// FormMaps.IntegrationTests -- CourseImportWriterTests' "atomic" hits are documentation-only, and
/// BillingShadowRepositoryTests' genuine-failure proof is concurrency-based (two real racing
/// deliveries), not a fault deliberately injected into a specific statement of a single call).
/// </summary>
[Collection(nameof(AuthDatabaseCollection))]
public class AuthRepositoryResetPasswordTests(AuthDatabaseFixture fixture)
{
    private AuthRepository CreateRepository() => new(fixture.SessionFactory);

    [Fact]
    public async Task ApplyPasswordReset_HappyPath_UpdatesPassword_MarksTokenUsed_RevokesAllActiveRefreshTokens()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-happy@example.com", passwordHash: "original-hash", isActive: true);
        var repo = CreateRepository();
        await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        await repo.CreateRefreshTokenAsync(userId, "2.2.2.2", CancellationToken.None);
        var tokenId = await fixture.SeedPasswordResetTokenAsync(userId, "digest-happy", DateTimeOffset.UtcNow.AddHours(1));

        await repo.ApplyPasswordResetAsync(tokenId, userId, "new-hash", "9.9.9.9", CancellationToken.None);

        Assert.Equal("new-hash", await fixture.GetUserPasswordHashAsync(userId));
        var reloadedToken = await repo.FindResetTokenAsync("digest-happy", CancellationToken.None);
        Assert.NotNull(reloadedToken!.UsedAt);
        Assert.Equal(0, await fixture.CountActiveRefreshTokensAsync(userId));
    }

    /// <summary>
    /// Final whole-branch review regression (Important). Two simultaneous resets presenting the
    /// SAME still-unused token must not both apply. Each call opens its own connection/transaction
    /// via the session factory, so this genuinely races at the DB level. Before the guarded
    /// consume UPDATE (WHERE "usedAt" IS NULL + 0-row check), both callers' unconditional
    /// `SET "usedAt" = now() WHERE "id" = @id` would succeed and both would commit a password
    /// change -- defeating single-use exactly the way an unguarded refresh rotation would (compare
    /// AuthRepositoryRefreshTests.RotateRefreshToken_ConcurrentRotationOfSameToken_ExactlyOneWins).
    /// </summary>
    [Fact]
    public async Task ApplyPasswordReset_ConcurrentUseOfSameToken_ExactlyOneWins()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-race@example.com", passwordHash: "original-hash", isActive: true);
        var repo = CreateRepository();
        var tokenId = await fixture.SeedPasswordResetTokenAsync(userId, "digest-race", DateTimeOffset.UtcNow.AddHours(1));

        var results = await Task.WhenAll(
            repo.ApplyPasswordResetAsync(tokenId, userId, "hash-from-a", "1.1.1.1", CancellationToken.None),
            repo.ApplyPasswordResetAsync(tokenId, userId, "hash-from-b", "2.2.2.2", CancellationToken.None));

        Assert.Equal(1, results.Count(r => r));
        Assert.Equal(1, results.Count(r => !r));

        // The loser rolled back entirely -- the stored hash is one of the two candidates, never
        // left as the original, and the token is consumed exactly once.
        var finalHash = await fixture.GetUserPasswordHashAsync(userId);
        Assert.Contains(finalHash, new[] { "hash-from-a", "hash-from-b" });
        Assert.NotNull((await repo.FindResetTokenAsync("digest-race", CancellationToken.None))!.UsedAt);
    }

    /// <summary>
    /// Final whole-branch review regression (Important). Re-presenting an already-consumed token
    /// directly to the repository (bypassing the endpoint's FindResetTokenAsync pre-check) must
    /// return false and leave the password untouched, rather than silently re-applying.
    /// </summary>
    [Fact]
    public async Task ApplyPasswordReset_AlreadyConsumedToken_ReturnsFalse_AndLeavesPasswordUnchanged()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-replay@example.com", passwordHash: "original-hash", isActive: true);
        var repo = CreateRepository();
        var tokenId = await fixture.SeedPasswordResetTokenAsync(userId, "digest-replay", DateTimeOffset.UtcNow.AddHours(1));

        Assert.True(await repo.ApplyPasswordResetAsync(tokenId, userId, "first-hash", "1.1.1.1", CancellationToken.None));

        Assert.False(await repo.ApplyPasswordResetAsync(tokenId, userId, "replayed-hash", "1.1.1.1", CancellationToken.None));
        Assert.Equal("first-hash", await fixture.GetUserPasswordHashAsync(userId));
    }

    [Fact]
    public async Task InvalidatePriorResetTokens_ThenCreateNew_OnlyThePriorTokenIsMarkedUsed()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-invalidate@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        await repo.CreatePasswordResetTokenAsync(userId, "digest-prior", TimeSpan.FromHours(1), CancellationToken.None);

        await repo.InvalidatePriorResetTokensAsync(userId, CancellationToken.None);
        await repo.CreatePasswordResetTokenAsync(userId, "digest-new", TimeSpan.FromHours(1), CancellationToken.None);

        var prior = await repo.FindResetTokenAsync("digest-prior", CancellationToken.None);
        var latest = await repo.FindResetTokenAsync("digest-new", CancellationToken.None);
        Assert.NotNull(prior!.UsedAt); // invalidated
        Assert.Null(latest!.UsedAt); // still live
    }

    [Fact]
    public async Task InvalidatePriorResetTokens_DoesNotTouchAnotherUsersToken()
    {
        await fixture.ResetAsync();
        var userA = await fixture.SeedUserAsync(email: "reset-a@example.com", passwordHash: "h", isActive: true);
        var userB = await fixture.SeedUserAsync(email: "reset-b@example.com", passwordHash: "h", isActive: true);
        var repo = CreateRepository();
        await repo.CreatePasswordResetTokenAsync(userA, "digest-a", TimeSpan.FromHours(1), CancellationToken.None);
        await repo.CreatePasswordResetTokenAsync(userB, "digest-b", TimeSpan.FromHours(1), CancellationToken.None);

        await repo.InvalidatePriorResetTokensAsync(userA, CancellationToken.None);

        var tokenB = await repo.FindResetTokenAsync("digest-b", CancellationToken.None);
        Assert.Null(tokenB!.UsedAt);
    }

    [Fact]
    public async Task FindResetToken_UnknownDigest_ReturnsNull()
    {
        await fixture.ResetAsync();
        var repo = CreateRepository();

        Assert.Null(await repo.FindResetTokenAsync("digest-never-issued", CancellationToken.None));
    }

    /// <summary>
    /// Mirrors FindSchoolByInvitationToken_ExpiredToken_StillReturnsRowWithPastExpiry's convention
    /// (AuthRepositorySchoolAdminRegistrationTests, Task 9): the expiry check is deliberately the
    /// caller's (Task 12's) job, not this repository's -- see ResetTokenRow's doc comment.
    /// </summary>
    [Fact]
    public async Task FindResetToken_ExpiredToken_StillReturnsRowWithPastExpiry()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-expired@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedPasswordResetTokenAsync(userId, "digest-expired", DateTimeOffset.UtcNow.AddHours(-1));
        var repo = CreateRepository();

        var row = await repo.FindResetTokenAsync("digest-expired", CancellationToken.None);

        Assert.NotNull(row);
        Assert.True(row!.ExpiresAt < DateTimeOffset.UtcNow);
    }

    [Fact]
    public async Task FindResetToken_AlreadyUsedToken_StillReturnsRowWithUsedAtSet()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-used@example.com", passwordHash: "h", isActive: true);
        await fixture.SeedPasswordResetTokenAsync(
            userId, "digest-used", DateTimeOffset.UtcNow.AddHours(1), usedAt: DateTimeOffset.UtcNow.AddMinutes(-5));
        var repo = CreateRepository();

        var row = await repo.FindResetTokenAsync("digest-used", CancellationToken.None);

        Assert.NotNull(row);
        Assert.NotNull(row!.UsedAt);
    }

    [Fact]
    public async Task FindResetToken_InactiveUsersToken_StillReturnsRowWithUserIsActiveFalse()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-inactive@example.com", passwordHash: "h", isActive: false);
        await fixture.SeedPasswordResetTokenAsync(userId, "digest-inactive-user", DateTimeOffset.UtcNow.AddHours(1));
        var repo = CreateRepository();

        var row = await repo.FindResetTokenAsync("digest-inactive-user", CancellationToken.None);

        Assert.NotNull(row);
        Assert.False(row!.UserIsActive);
    }

    /// <summary>
    /// THE critical test for this task. Proves ApplyPasswordResetAsync's atomicity by injecting a
    /// genuine Postgres-level failure specifically on the third write (the refresh-token revoke,
    /// the only one of the three statements that binds "clientIp") and confirming, via direct reads
    /// of all three affected tables, that the first two writes (password update, token consumption)
    /// were rolled back too -- proving a real all-or-nothing guarantee, not just that an exception
    /// was thrown. See this class's doc comment for why the null-byte technique is a genuine,
    /// non-mocked Postgres-server-raised failure.
    /// </summary>
    [Fact]
    public async Task ApplyPasswordReset_FailureOnThirdWrite_RollsBackEverything_AtomicityProof()
    {
        await fixture.ResetAsync();
        var userId = await fixture.SeedUserAsync(email: "reset-atomic@example.com", passwordHash: "original-hash", isActive: true);
        var repo = CreateRepository();
        await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
        var tokenId = await fixture.SeedPasswordResetTokenAsync(userId, "digest-atomic", DateTimeOffset.UtcNow.AddHours(1));

        // The embedded null byte lives ONLY in clientIp, which is bound ONLY on the third statement
        // (the refresh-token revoke) -- so the first two statements execute for real before this
        // fails, making this a genuine test of mid-transaction rollback rather than a failure that
        // never reaches the database at all.
        var poisonedClientIp = "9.9.9.9\0poisoned";

        var thrown = await Assert.ThrowsAsync<PostgresException>(() =>
            repo.ApplyPasswordResetAsync(tokenId, userId, "new-hash-must-not-persist", poisonedClientIp, CancellationToken.None));
        Assert.Equal("22021", thrown.SqlState);

        // Post-attempt DB state, not just "an exception was thrown":
        Assert.Equal("original-hash", await fixture.GetUserPasswordHashAsync(userId)); // password NOT changed
        var reloadedToken = await repo.FindResetTokenAsync("digest-atomic", CancellationToken.None);
        Assert.Null(reloadedToken!.UsedAt); // token NOT consumed
        Assert.Equal(1, await fixture.CountActiveRefreshTokensAsync(userId)); // refresh token NOT revoked
    }

    /// <summary>
    /// Same atomicity proof re-run several times in one test to build confidence the rollback is a
    /// deterministic property of the transaction/dispose mechanics, not a one-off timing accident
    /// (same spirit as Task 8's concurrency-test rigor requirement).
    /// </summary>
    [Fact]
    public async Task ApplyPasswordReset_FailureOnThirdWrite_RollsBackEverything_RepeatedlyNotFlaky()
    {
        for (var i = 0; i < 5; i++)
        {
            await fixture.ResetAsync();
            var userId = await fixture.SeedUserAsync(email: $"reset-atomic-repeat-{i}@example.com", passwordHash: "original-hash", isActive: true);
            var repo = CreateRepository();
            await repo.CreateRefreshTokenAsync(userId, "1.1.1.1", CancellationToken.None);
            var tokenId = await fixture.SeedPasswordResetTokenAsync(userId, $"digest-atomic-repeat-{i}", DateTimeOffset.UtcNow.AddHours(1));

            await Assert.ThrowsAsync<PostgresException>(() =>
                repo.ApplyPasswordResetAsync(tokenId, userId, "new-hash-must-not-persist", "9.9.9.9\0poisoned", CancellationToken.None));

            Assert.Equal("original-hash", await fixture.GetUserPasswordHashAsync(userId));
            Assert.Equal(1, await fixture.CountActiveRefreshTokensAsync(userId));
        }
    }
}
