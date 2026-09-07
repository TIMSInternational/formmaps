using FormMaps.Application.Billing;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="BillingShadowRepository"/> — the Domain 9a shadow-table
/// idempotent webhook-event-application layer. Pins: first delivery writes the shadow subscription row
/// and returns true; a duplicate eventId is a no-op (dedup hit) and returns false; cancelling an existing
/// subscription (looked up by stripeSubscriptionId, since cancellation events carry no userId) flips
/// status/isActive. Follows the same real-session-factory convention as EvaluationExternalServiceTests
/// (NpgsqlFormMapsDatabaseSessionFactory + RlsSessionContextApplier against the container's connection
/// string) rather than a bespoke test-only session factory — no such type exists elsewhere in this
/// project, so this doesn't introduce one.
///
/// <para>formmaps#125: the repository runs on the fixture's restricted app login; TRUNCATE and the raw
/// row-count assertions go through the admin one. The shadow_* tables are unpolicied so the split changes
/// nothing observable here, but the repository opens every session under RequestContext.System(), and
/// this is the suite that proves that bypass works as a GUC on a NOBYPASSRLS role rather than as a
/// superuser privilege.</para>
/// </summary>
public sealed class BillingShadowRepositoryTests : IClassFixture<BillingDatabaseFixture>, IAsyncLifetime
{
    private readonly BillingDatabaseFixture _fixture;

    /// <summary>Restricted login (NOSUPERUSER NOBYPASSRLS) — the repository under test.</summary>
    private NpgsqlDataSource _dataSource = null!;

    /// <summary>Container superuser — row-state assertions only.</summary>
    private NpgsqlDataSource _adminDataSource = null!;

    public BillingShadowRepositoryTests(BillingDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.AppConnectionString);
        _adminDataSource = NpgsqlDataSource.Create(_fixture.AdminConnectionString);
        await _fixture.TruncateAsync(
            "shadow_user_subscriptions", "shadow_payments", "shadow_stripe_events",
            "user_subscriptions", "subscription_plans", "stripe_events");
    }

    public async Task DisposeAsync()
    {
        await _dataSource.DisposeAsync();
        await _adminDataSource.DisposeAsync();
    }

    private BillingShadowRepository Repository(ILogger<BillingShadowRepository>? logger = null) =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()),
            logger ?? NullLogger<BillingShadowRepository>.Instance);

    [Fact]
    public async Task ApplySubscriptionEvent_FirstDelivery_WritesShadowRow_ReturnsTrue()
    {
        var repository = Repository();
        var sub = new StripeSubscriptionLite("sub_test1", "active", 1893456000, null, null, false);

        var applied = await repository.ApplySubscriptionEventAsync(
            eventId: "evt_1", eventType: "checkout.session.completed",
            userId: "user_1", planId: "plan_1", subscription: sub, CancellationToken.None);

        Assert.True(applied);
        var row = await QueryShadowSubscriptionAsync("user_1");
        Assert.Equal("sub_test1", row.StripeSubscriptionId);
        Assert.Equal("active", row.Status);
        Assert.True(row.IsActive);
    }

    [Fact]
    public async Task ApplySubscriptionEvent_DuplicateEventId_IsNoOp_ReturnsFalse()
    {
        var repository = Repository();
        // Second call uses a DIFFERENT status than the first. If dedup were broken and the write path
        // re-ran on the "duplicate" call, the shadow row would show "past_due" afterwards — asserting the
        // row still shows "active" is what actually proves the write was skipped, not just that the
        // (idempotent) upsert produced the same row twice.
        var firstSub = new StripeSubscriptionLite("sub_test2", "active", 1893456000, null, null, false);
        var secondSub = new StripeSubscriptionLite("sub_test2", "past_due", 1893456000, null, null, false);

        var first = await repository.ApplySubscriptionEventAsync(
            "evt_dup", "checkout.session.completed", "user_2", "plan_1", firstSub, CancellationToken.None);
        var second = await repository.ApplySubscriptionEventAsync(
            "evt_dup", "checkout.session.completed", "user_2", "plan_1", secondSub, CancellationToken.None);

        Assert.True(first);
        Assert.False(second);
        var row = await QueryShadowSubscriptionAsync("user_2");
        Assert.Equal("active", row.Status);
    }

    [Fact]
    public async Task ApplySubscriptionEvent_ConcurrentDuplicateDelivery_OneWins_OtherReturnsFalse()
    {
        // Two truly concurrent deliveries of the same eventId (Stripe does retry/redeliver) racing through
        // separate session/factory instances against the same underlying Testcontainers Postgres. Both can
        // pass the fast-path SELECT dedup check before either commits; the shadow_stripe_events PRIMARY KEY
        // is the real guarantee. Proves the loser gets the documented `false` return, not an unhandled
        // PostgresException, and that only one write survives.
        var sub = new StripeSubscriptionLite("sub_test4", "active", 1893456000, null, null, false);

        var task1 = Repository().ApplySubscriptionEventAsync(
            "evt_concurrent", "checkout.session.completed", "user_4", "plan_1", sub, CancellationToken.None);
        var task2 = Repository().ApplySubscriptionEventAsync(
            "evt_concurrent", "checkout.session.completed", "user_4", "plan_1", sub, CancellationToken.None);

        var results = await Task.WhenAll(task1, task2);

        Assert.Contains(true, results);
        Assert.Contains(false, results);
        Assert.Equal(1, results.Count(r => r));

        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var subCountCmd = new NpgsqlCommand(
            """SELECT COUNT(*) FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        subCountCmd.Parameters.AddWithValue("userId", "user_4");
        Assert.Equal(1L, await subCountCmd.ExecuteScalarAsync());

        await using var eventCountCmd = new NpgsqlCommand(
            """SELECT COUNT(*) FROM "shadow_stripe_events" WHERE "id" = @id""", conn);
        eventCountCmd.Parameters.AddWithValue("id", "evt_concurrent");
        Assert.Equal(1L, await eventCountCmd.ExecuteScalarAsync());
    }

    [Fact]
    public async Task ApplySubscriptionEvent_LosesRaceOnSubscriptionIndex_ReturnsFalse_RollsBackWrite()
    {
        // formmaps#188 — the deterministic reproduction of the CI failure on #186 (run 33996237782):
        //   23505: duplicate key value violates unique constraint "shadow_user_subscriptions_stripeSubscriptionId_key"
        // raised from INSIDE `write`, not from the event-row insert the old catch guarded. The winner is an admin
        // transaction that has written its shadow row AND its event row but not yet committed; the loser passes
        // the fast-path SELECT (the winner's event row is invisible), then its upsert blocks on the winner's
        // in-progress index entry for the subscription id, and gets 23505 the moment the winner commits.
        // The winner uses a different userId only because the ON CONFLICT ("userId") arbiter is the one lever the
        // test has over WHICH index fires first: a same-user winner is seen by the arbiter and takes the DO UPDATE
        // path (covered by ..._LosesRaceOnEventRow_... below). The exception shape is identical to production's.
        var sub = new StripeSubscriptionLite("sub_race", "past_due", 1893456000, null, null, false);

        await using var winner = await _adminDataSource.OpenConnectionAsync();
        await using var winnerTx = await winner.BeginTransactionAsync();
        await SeedWinnerAsync(winner, winnerTx, "evt_race", "user_race_winner", "sub_race");

        var loser = Repository().ApplySubscriptionEventAsync(
            "evt_race", "customer.subscription.updated", "user_race_loser", "plan_1", sub, CancellationToken.None);

        await WaitUntilBlockedOnLockAsync(loser);
        await winnerTx.CommitAsync();

        Assert.False(await loser);

        Assert.Equal(0L, await CountAsync("""SELECT COUNT(*) FROM "shadow_user_subscriptions" WHERE "userId" = 'user_race_loser'"""));
        var row = await QueryShadowSubscriptionAsync("user_race_winner");
        Assert.Equal("sub_race", row.StripeSubscriptionId);
        Assert.Equal("active", row.Status);
        Assert.Equal(1L, await CountAsync("""SELECT COUNT(*) FROM "shadow_stripe_events" WHERE "id" = 'evt_race'"""));
    }

    [Fact]
    public async Task ApplySubscriptionEvent_LosesRaceOnEventRow_ReturnsFalse_RollsBackUpdate()
    {
        // The other ordering of the same race, made deterministic: a same-user winner is seen by the
        // ON CONFLICT ("userId") arbiter, so the loser blocks there, takes the DO UPDATE path once the winner
        // commits, and then hits the shadow_stripe_events PRIMARY KEY. The loser's DO UPDATE (status ->
        // past_due) must roll back with the rest of its transaction — the row keeps the winner's "active".
        var sub = new StripeSubscriptionLite("sub_same", "past_due", 1893456000, null, null, false);

        await using var winner = await _adminDataSource.OpenConnectionAsync();
        await using var winnerTx = await winner.BeginTransactionAsync();
        await SeedWinnerAsync(winner, winnerTx, "evt_same", "user_same", "sub_same");

        var loser = Repository().ApplySubscriptionEventAsync(
            "evt_same", "customer.subscription.updated", "user_same", "plan_1", sub, CancellationToken.None);

        await WaitUntilBlockedOnLockAsync(loser);
        await winnerTx.CommitAsync();

        Assert.False(await loser);

        var row = await QueryShadowSubscriptionAsync("user_same");
        Assert.Equal("active", row.Status);
        Assert.Equal(1L, await CountAsync("""SELECT COUNT(*) FROM "shadow_user_subscriptions" WHERE "userId" = 'user_same'"""));
        Assert.Equal(1L, await CountAsync("""SELECT COUNT(*) FROM "shadow_stripe_events" WHERE "id" = 'evt_same'"""));
    }

    [Fact]
    public async Task ApplySubscriptionEvent_GenuineSubscriptionConflict_StillThrows_RecordsNothing()
    {
        // formmaps#188's negative control — the reason the fix is not "widen the try". The SAME constraint as
        // the race case fires here, but nobody else processed this event: user_a already holds sub_shared
        // (committed long ago), and a NEW event now claims sub_shared for user_b. That is a real conflict in the
        // ledger #44 exists to trust, and it must surface, not become a quiet `false`. This test is green before
        // and after the fix; it pins the discriminator so a future "just catch it" cannot pass.
        await _fixture.SeedShadowOnlySubscriptionAsync("user_a", "sub_shared");
        var conflicting = new StripeSubscriptionLite("sub_shared", "active", 1893456000, null, null, false);

        var ex = await Assert.ThrowsAsync<PostgresException>(() => Repository().ApplySubscriptionEventAsync(
            "evt_conflict", "checkout.session.completed", "user_b", "plan_1", conflicting, CancellationToken.None));

        Assert.Equal(PostgresErrorCodes.UniqueViolation, ex.SqlState);
        Assert.Equal("shadow_user_subscriptions_stripeSubscriptionId_key", ex.ConstraintName);
        Assert.Equal(0L, await CountAsync("""SELECT COUNT(*) FROM "shadow_stripe_events" WHERE "id" = 'evt_conflict'"""));
        Assert.Equal(0L, await CountAsync("""SELECT COUNT(*) FROM "shadow_user_subscriptions" WHERE "userId" = 'user_b'"""));
        var row = await QueryShadowSubscriptionAsync("user_a");
        Assert.Equal("sub_shared", row.StripeSubscriptionId);
    }

    [Fact]
    public async Task MarkSubscriptionCancelled_ExistingSubscription_UpdatesStatus()
    {
        var repository = Repository();
        var activeSub = new StripeSubscriptionLite("sub_test3", "active", 1893456000, null, null, false);
        await repository.ApplySubscriptionEventAsync("evt_create", "checkout.session.completed", "user_3", "plan_1", activeSub, CancellationToken.None);

        var cancelledSub = new StripeSubscriptionLite("sub_test3", "canceled", null, null, null, false);
        var applied = await repository.MarkSubscriptionCancelledAsync(
            "evt_cancel", "customer.subscription.deleted", "sub_test3", cancelledSub, CancellationToken.None);

        Assert.True(applied);
        var row = await QueryShadowSubscriptionAsync("user_3");
        Assert.Equal("cancelled", row.Status);
        Assert.False(row.IsActive);
    }

    [Fact]
    public async Task MarkSubscriptionCancelled_NoMatchingShadowRow_LogsWarning_StillRecordsEvent()
    {
        // Final-review fix wave (Important 6). The shadow table starts EMPTY, so every pre-existing
        // subscriber's first customer.subscription.updated lands on an UPDATE ... WHERE
        // stripeSubscriptionId that matches nothing. The event is still recorded as processed (and must
        // be -- there is genuinely nothing to apply, and redelivery would not change that), so before
        // this fix the outcome was completely invisible: no row written, no log, `true` returned.
        // Legacy stripeService.ts logs "Subscription event for unknown local sub" here.
        var logger = new RecordingLogger();
        var repository = Repository(logger);
        var unknownSub = new StripeSubscriptionLite("sub_never_seen", "active", 1893456000, null, null, false);

        var applied = await repository.MarkSubscriptionCancelledAsync(
            "evt_unknown_sub", "customer.subscription.updated", "sub_never_seen", unknownSub, CancellationToken.None);

        Assert.True(applied);
        var warning = Assert.Single(logger.Entries, e => e.Level == LogLevel.Warning);
        Assert.Contains("matched 0 shadow rows", warning.Message, StringComparison.Ordinal);
        Assert.Contains("sub_never_seen", warning.Message, StringComparison.Ordinal);
        // Warning, not Error: this is the expected condition for pre-existing subscribers, not a bug.
        Assert.DoesNotContain(logger.Entries, e => e.Level >= LogLevel.Error);

        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var eventCount = new NpgsqlCommand(
            """SELECT COUNT(*) FROM "shadow_stripe_events" WHERE "id" = @id""", conn);
        eventCount.Parameters.AddWithValue("id", "evt_unknown_sub");
        Assert.Equal(1L, await eventCount.ExecuteScalarAsync());
    }

    [Fact]
    public async Task MarkSubscriptionCancelled_MatchingShadowRow_LogsNoWarning()
    {
        // The negative half: a normal cancellation must not spam the hourly warning channel.
        var logger = new RecordingLogger();
        var repository = Repository(logger);
        var activeSub = new StripeSubscriptionLite("sub_warn_none", "active", 1893456000, null, null, false);
        await repository.ApplySubscriptionEventAsync(
            "evt_warn_none_create", "checkout.session.completed", "user_warn_none", "plan_1", activeSub, CancellationToken.None);

        var cancelledSub = new StripeSubscriptionLite("sub_warn_none", "canceled", null, null, null, false);
        await repository.MarkSubscriptionCancelledAsync(
            "evt_warn_none_cancel", "customer.subscription.deleted", "sub_warn_none", cancelledSub, CancellationToken.None);

        Assert.DoesNotContain(logger.Entries, e => e.Level == LogLevel.Warning);
    }

    [Fact]
    public async Task MarkSubscriptionPastDue_NoMatchingShadowRow_LogsWarning()
    {
        // Same observability guarantee on the invoice.payment_failed path (Important 3's new method).
        var logger = new RecordingLogger();
        var repository = Repository(logger);

        var applied = await repository.MarkSubscriptionPastDueAsync(
            "evt_pastdue_unknown", "invoice.payment_failed", "sub_never_seen_pf", CancellationToken.None);

        Assert.True(applied);
        var warning = Assert.Single(logger.Entries, e => e.Level == LogLevel.Warning);
        Assert.Contains("sub_never_seen_pf", warning.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task MarkSubscriptionPastDue_ExistingSubscription_SetsStatusPastDue_LeavesIsActiveAlone()
    {
        // Legacy's invoice.payment_failed writes exactly `data: { status: "past_due" }` -- isActive is not
        // part of that update, so a past-due subscriber keeps access until Stripe actually cancels.
        var repository = Repository();
        var activeSub = new StripeSubscriptionLite("sub_pastdue", "active", 1893456000, null, null, false);
        await repository.ApplySubscriptionEventAsync(
            "evt_pastdue_create", "checkout.session.completed", "user_pastdue", "plan_1", activeSub, CancellationToken.None);

        var applied = await repository.MarkSubscriptionPastDueAsync(
            "evt_pastdue", "invoice.payment_failed", "sub_pastdue", CancellationToken.None);

        Assert.True(applied);
        var row = await QueryShadowSubscriptionAsync("user_pastdue");
        Assert.Equal("past_due", row.Status);
        Assert.True(row.IsActive);
    }

    /// <summary>
    /// Plays the WINNING delivery of a redelivery race, up to but not including its commit: the shadow row and
    /// the event row are written on <paramref name="transaction"/> and stay invisible to the loser's fast-path
    /// SELECT until the test commits. Runs on the admin connection so the rows are seeded exactly, not through
    /// the code under test.
    /// </summary>
    private static async Task SeedWinnerAsync(NpgsqlConnection connection, NpgsqlTransaction transaction, string eventId, string userId, string stripeSubscriptionId)
    {
        await using var shadow = new NpgsqlCommand("""
            INSERT INTO "shadow_user_subscriptions" ("id", "userId", "planId", "status", "stripeSubscriptionId", "isActive")
            VALUES (@id, @userId, 'plan_1', 'active', @subId, true)
            """, connection, transaction);
        shadow.Parameters.AddWithValue("id", Guid.NewGuid().ToString());
        shadow.Parameters.AddWithValue("userId", userId);
        shadow.Parameters.AddWithValue("subId", stripeSubscriptionId);
        await shadow.ExecuteNonQueryAsync();

        await using var evt = new NpgsqlCommand(
            """INSERT INTO "shadow_stripe_events" ("id", "eventType") VALUES (@id, 'customer.subscription.updated')""",
            connection, transaction);
        evt.Parameters.AddWithValue("id", eventId);
        await evt.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Waits until the in-flight repository call is parked on a Postgres lock (pg_stat_activity, wait_event_type
    /// = 'Lock', on the shadow table) — i.e. it has passed the fast-path dedup SELECT and is now blocked behind the
    /// winner's uncommitted row. Polls instead of sleeping so the test is not timing-dependent, and fails loudly
    /// if the call completes without ever blocking, because then it did not reproduce the race at all.
    /// </summary>
    private async Task WaitUntilBlockedOnLockAsync(Task inFlight)
    {
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            Assert.False(inFlight.IsCompleted, "the repository call completed without blocking, so the race was not reproduced");
            var blocked = await CountAsync("""
                SELECT COUNT(*) FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND state = 'active' AND query ILIKE '%shadow_user_subscriptions%'
                """);
            if (blocked > 0)
            {
                return;
            }

            await Task.Delay(25);
        }

        Assert.Fail("the repository call never blocked on the winner's uncommitted row within 15s");
    }

    private async Task<long> CountAsync(string sql)
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(sql, conn);
        return (long)(await cmd.ExecuteScalarAsync())!;
    }

    /// <summary>Minimal in-memory ILogger so the warning path can be asserted on directly.</summary>
    private sealed class RecordingLogger : ILogger<BillingShadowRepository>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }

    private async Task<(string StripeSubscriptionId, string Status, bool IsActive)> QueryShadowSubscriptionAsync(string userId)
    {
        await using var conn = await _adminDataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "stripeSubscriptionId", "status", "isActive" FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.GetString(1), reader.GetBoolean(2));
    }
}
