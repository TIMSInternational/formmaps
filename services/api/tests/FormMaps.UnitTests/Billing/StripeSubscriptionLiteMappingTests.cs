using FormMaps.Application.Billing;
using Stripe;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9a Task 8 fix round 1 (Finding 2). Regression guard for the Stripe.Subscription ->
/// StripeSubscriptionLite extraction, which the final-review fix wave (Important 1) moved from
/// StripeGateway.MapToLite to StripeSubscriptionMapper.ToLite so the customer.subscription.updated/deleted
/// webhook branch could share it instead of hand-building the record with null period-end fields. Not
/// covered by any FakeStripeGateway-substituted integration test. Constructs real Stripe.net SDK
/// objects directly (Stripe.Subscription/StripeList/SubscriptionItem are plain POCOs with public
/// parameterless constructors -- confirmed via reflection against the installed Stripe.net 52.2.0
/// package) rather than hitting a live API, mirroring StripeSubscriptionMapperTests.cs's pattern one
/// layer up the stack. This exact Items/TrialEnd mapping already broke once due to an SDK version change
/// (Subscription.CurrentPeriodEnd moved onto SubscriptionItem) -- this test exists so a future SDK bump
/// that shifts the shape again fails loudly here instead of silently in production.
/// </summary>
public class StripeSubscriptionLiteMappingTests
{
    [Fact]
    public void ToLite_PopulatesItemPeriodEndAndTrialEnd_LeavesCurrentPeriodEndNull()
    {
        var itemPeriodEnd = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc);
        var trialEnd = new DateTime(2026, 8, 15, 0, 0, 0, DateTimeKind.Utc);

        var sub = new Subscription
        {
            Id = "sub_123",
            Status = "trialing",
            CancelAtPeriodEnd = true,
            TrialEnd = trialEnd,
            Items = new StripeList<SubscriptionItem>
            {
                Data = [new SubscriptionItem { CurrentPeriodEnd = itemPeriodEnd }],
            },
        };

        var lite = StripeSubscriptionMapper.ToLite(sub);

        // Field order matches StripeSubscriptionLite's real positional order: Id, Status,
        // CurrentPeriodEndUnixSeconds, ItemCurrentPeriodEndUnixSeconds, TrialEndUnixSeconds, CancelAtPeriodEnd.
        Assert.Equal("sub_123", lite.Id);
        Assert.Equal("trialing", lite.Status);
        Assert.Null(lite.CurrentPeriodEndUnixSeconds);
        Assert.Equal(new DateTimeOffset(itemPeriodEnd).ToUnixTimeSeconds(), lite.ItemCurrentPeriodEndUnixSeconds);
        Assert.Equal(new DateTimeOffset(trialEnd).ToUnixTimeSeconds(), lite.TrialEndUnixSeconds);
        Assert.True(lite.CancelAtPeriodEnd);
    }

    [Fact]
    public void ToLite_NoItemsNoTrialEnd_BothNullableFieldsNull()
    {
        var sub = new Subscription
        {
            Id = "sub_no_items",
            Status = "active",
            CancelAtPeriodEnd = false,
            TrialEnd = null,
            Items = new StripeList<SubscriptionItem> { Data = [] },
        };

        var lite = StripeSubscriptionMapper.ToLite(sub);

        Assert.Equal("sub_no_items", lite.Id);
        Assert.Equal("active", lite.Status);
        Assert.Null(lite.CurrentPeriodEndUnixSeconds);
        Assert.Null(lite.ItemCurrentPeriodEndUnixSeconds);
        Assert.Null(lite.TrialEndUnixSeconds);
        Assert.False(lite.CancelAtPeriodEnd);
    }

    [Fact]
    public void ToLite_NullItemsCollection_DoesNotThrow_ItemPeriodEndNull()
    {
        var sub = new Subscription
        {
            Id = "sub_null_items",
            Status = "canceled",
            CancelAtPeriodEnd = false,
            Items = null,
        };

        var lite = StripeSubscriptionMapper.ToLite(sub);

        Assert.Null(lite.ItemCurrentPeriodEndUnixSeconds);
    }
}
