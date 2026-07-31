using FormMaps.Infrastructure.Billing;
using Xunit;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// Real-DB (Testcontainers) tests for <see cref="BillingReconciliationService"/> — the Domain 9a
/// hourly shadow-vs-live diff that is the core safety mechanism for the whole shadow-mode design.
/// Pins: matching shadow/live rows produce zero mismatches; a differing "status" field is reported
/// with both values; a differing "isActive" field is reported with both values; a shadow row with no
/// live counterpart (userId not found on the live side) is reported as an "existence" mismatch with a
/// null LiveValue. Follows the same real-session-factory
/// convention as BillingShadowRepositoryTests/BillingWebhookEndpointTests — shares the Testcontainers
/// Postgres instance via BillingDatabaseCollection/BillingDatabaseFixture.
/// </summary>
[Collection(nameof(BillingDatabaseCollection))]
public class BillingReconciliationServiceTests(BillingDatabaseFixture fixture)
{
    [Fact]
    public async Task Reconcile_MatchingRows_NoMismatches()
    {
        await fixture.ResetAsync();
        await fixture.SeedMatchingSubscriptionAsync(userId: "user_match", stripeSubscriptionId: "sub_match", status: "active");
        var service = new BillingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Equal(1, result.TotalCompared);
        Assert.Empty(result.Mismatches);
    }

    [Fact]
    public async Task Reconcile_StatusDiffers_ReportsMismatch()
    {
        await fixture.ResetAsync();
        await fixture.SeedMismatchedSubscriptionAsync(userId: "user_mismatch", shadowStatus: "past_due", liveStatus: "active");
        var service = new BillingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Single(result.Mismatches);
        Assert.Equal("status", result.Mismatches[0].Field);
        Assert.Equal("past_due", result.Mismatches[0].ShadowValue);
        Assert.Equal("active", result.Mismatches[0].LiveValue);
    }

    [Fact]
    public async Task Reconcile_IsActiveDiffers_ReportsMismatch()
    {
        await fixture.ResetAsync();
        await fixture.SeedIsActiveMismatchedSubscriptionAsync(userId: "user_isactive_mismatch", shadowIsActive: false, liveIsActive: true);
        var service = new BillingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Single(result.Mismatches);
        Assert.Equal("isActive", result.Mismatches[0].Field);
        Assert.Equal("False", result.Mismatches[0].ShadowValue);
        Assert.Equal("True", result.Mismatches[0].LiveValue);
    }

    [Fact]
    public async Task Reconcile_ShadowRowWithNoLiveCounterpart_ReportsMismatch()
    {
        await fixture.ResetAsync();
        await fixture.SeedShadowOnlySubscriptionAsync(userId: "user_orphan", stripeSubscriptionId: "sub_orphan");
        var service = new BillingReconciliationService(fixture.SessionFactory);

        var result = await service.ReconcileAsync(CancellationToken.None);

        Assert.Contains(result.Mismatches, m => m.Field == "existence" && m.LiveValue == null);
    }
}
