using FormMaps.Application.Billing;
using FormMaps.Infrastructure.Billing;
using FormMaps.Infrastructure.Data;
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

    private BillingShadowRepository Repository() =>
        new(new NpgsqlFormMapsDatabaseSessionFactory(_dataSource, new RlsSessionContextApplier()));

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
        var sub = new StripeSubscriptionLite("sub_test2", "active", 1893456000, null, null, false);

        var first = await repository.ApplySubscriptionEventAsync(
            "evt_dup", "checkout.session.completed", "user_2", "plan_1", sub, CancellationToken.None);
        var second = await repository.ApplySubscriptionEventAsync(
            "evt_dup", "checkout.session.completed", "user_2", "plan_1", sub, CancellationToken.None);

        Assert.True(first);
        Assert.False(second);
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
