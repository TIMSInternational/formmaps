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
/// </summary>
public sealed class BillingShadowRepositoryTests : IClassFixture<BillingDatabaseFixture>, IAsyncLifetime
{
    private readonly BillingDatabaseFixture _fixture;
    private NpgsqlDataSource _dataSource = null!;

    public BillingShadowRepositoryTests(BillingDatabaseFixture fixture) => _fixture = fixture;

    public async Task InitializeAsync()
    {
        _dataSource = NpgsqlDataSource.Create(_fixture.ConnectionString);
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """
            TRUNCATE "shadow_user_subscriptions", "shadow_payments", "shadow_stripe_events",
                     "user_subscriptions", "subscription_plans", "stripe_events" CASCADE
            """, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _dataSource.DisposeAsync();

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

        await using var conn = await _dataSource.OpenConnectionAsync();
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

        await using var conn = await _dataSource.OpenConnectionAsync();
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
        await using var conn = await _dataSource.OpenConnectionAsync();
        await using var cmd = new NpgsqlCommand(
            """SELECT "stripeSubscriptionId", "status", "isActive" FROM "shadow_user_subscriptions" WHERE "userId" = @userId""", conn);
        cmd.Parameters.AddWithValue("userId", userId);
        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        return (reader.GetString(0), reader.GetString(1), reader.GetBoolean(2));
    }
}
