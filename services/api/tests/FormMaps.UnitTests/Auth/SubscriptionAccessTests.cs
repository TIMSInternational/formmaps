using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

public class SubscriptionAccessTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 16, 12, 0, 0, TimeSpan.Zero);
    private const int Grace = 7;

    [Fact]
    public void Inactive_subscription_denies()
    {
        Assert.False(SubscriptionAccess.GrantsAccess("active", isActive: false, nextBillingDate: null, Now, Grace));
    }

    [Theory]
    [InlineData("active")]
    [InlineData("trialing")]
    [InlineData("past_due")]
    public void Access_status_with_no_billing_date_grants(string status)
    {
        Assert.True(SubscriptionAccess.GrantsAccess(status, isActive: true, nextBillingDate: null, Now, Grace));
    }

    [Theory]
    [InlineData("canceled")]
    [InlineData("incomplete")]
    [InlineData("unpaid")]
    [InlineData(null)]
    public void Non_access_status_denies(string? status)
    {
        Assert.False(SubscriptionAccess.GrantsAccess(status, isActive: true, nextBillingDate: null, Now, Grace));
    }

    [Fact]
    public void Within_grace_window_grants()
    {
        // past_due is the grace period: billed 5 days ago, grace 7 -> hard expiry 2 days out.
        var billed = Now.AddDays(-5);
        Assert.True(SubscriptionAccess.GrantsAccess("past_due", isActive: true, billed, Now, Grace));
    }

    [Fact]
    public void Past_grace_window_denies_even_for_active_status()
    {
        // Missed-webhook case: billed 8 days ago, grace 7 -> hard expiry 1 day in the past.
        var billed = Now.AddDays(-8);
        Assert.False(SubscriptionAccess.GrantsAccess("active", isActive: true, billed, Now, Grace));
    }

    [Fact]
    public void Exactly_at_hard_expiry_still_grants()
    {
        // Legacy uses strict `now > expiry`, so now == expiry still grants.
        var billed = Now.AddDays(-Grace);
        Assert.True(SubscriptionAccess.GrantsAccess("active", isActive: true, billed, Now, Grace));
    }

    [Fact]
    public void One_tick_past_hard_expiry_denies()
    {
        var billed = Now.AddDays(-Grace).AddTicks(-1);
        Assert.False(SubscriptionAccess.GrantsAccess("active", isActive: true, billed, Now, Grace));
    }
}
