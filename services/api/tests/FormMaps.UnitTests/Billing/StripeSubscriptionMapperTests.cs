using FormMaps.Application.Billing;

namespace FormMaps.UnitTests.Billing;

public class StripeSubscriptionMapperTests
{
    [Theory]
    [InlineData("active", "active")]
    [InlineData("trialing", "trialing")]
    [InlineData("past_due", "past_due")]
    [InlineData("unpaid", "past_due")]
    [InlineData("canceled", "cancelled")]
    [InlineData("incomplete_expired", "cancelled")]
    [InlineData("incomplete", "incomplete")]
    [InlineData(null, "incomplete")]
    [InlineData("something_unknown", "incomplete")]
    public void MapStatus_MatchesLegacyMapping(string? stripeStatus, string expected)
    {
        Assert.Equal(expected, StripeSubscriptionMapper.MapStatus(stripeStatus));
    }

    [Fact]
    public void ResolvePeriodEnd_PrefersCurrentPeriodEnd_ThenItemPeriodEnd_ThenTrialEnd()
    {
        var withCurrent = new StripeSubscriptionLite("sub_1", "active", 1000, 2000, 3000, false);
        Assert.Equal(1000, StripeSubscriptionMapper.ResolvePeriodEndUnixSeconds(withCurrent));

        var itemOnly = new StripeSubscriptionLite("sub_1", "active", null, 2000, 3000, false);
        Assert.Equal(2000, StripeSubscriptionMapper.ResolvePeriodEndUnixSeconds(itemOnly));

        var trialOnly = new StripeSubscriptionLite("sub_1", "trialing", null, null, 3000, false);
        Assert.Equal(3000, StripeSubscriptionMapper.ResolvePeriodEndUnixSeconds(trialOnly));

        var none = new StripeSubscriptionLite("sub_1", "active", null, null, null, false);
        Assert.Null(StripeSubscriptionMapper.ResolvePeriodEndUnixSeconds(none));
    }

    [Fact]
    public void ToRecord_ActiveSubscription_IsActiveTrue_NextBillingDateSet()
    {
        var sub = new StripeSubscriptionLite("sub_1", "active", 1735689600, null, null, false);
        var record = StripeSubscriptionMapper.ToRecord(sub, planId: "plan_1");

        Assert.Equal("sub_1", record.StripeSubscriptionId);
        Assert.Equal("active", record.Status);
        Assert.True(record.IsActive);
        Assert.False(record.CancelAtPeriodEnd);
        Assert.Equal("plan_1", record.PlanId);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1735689600), record.NextBillingDate);
    }

    [Fact]
    public void ToRecord_CancelledSubscription_IsActiveFalse()
    {
        var sub = new StripeSubscriptionLite("sub_1", "canceled", null, null, null, false);
        var record = StripeSubscriptionMapper.ToRecord(sub);

        Assert.False(record.IsActive);
        Assert.Null(record.PlanId);
    }

    [Fact]
    public void ToRecord_NoPeriodEnd_NextBillingDateIsNull()
    {
        var sub = new StripeSubscriptionLite("sub_1", "incomplete", null, null, null, false);
        var record = StripeSubscriptionMapper.ToRecord(sub);

        Assert.Null(record.NextBillingDate);
    }
}
