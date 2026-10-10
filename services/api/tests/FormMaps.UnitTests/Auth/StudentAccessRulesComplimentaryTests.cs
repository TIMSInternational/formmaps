using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

/// <summary>
/// audit 2026-10-09 E5 (decision D6) — mirrors legacy api/src/__tests__/complimentary-access.unit.test.ts: the
/// complimentary grant window and how it combines with the subscription verdict.
/// </summary>
public class StudentAccessRulesComplimentaryTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 10, 15, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Expiry = Now.AddDays(10);

    [Fact]
    public void Covers_from_startsAt_inclusive_to_expiresAt_exclusive()
    {
        Assert.True(StudentAccessRules.IsComplimentaryGrantActive(Now.AddDays(-1), Now.AddDays(1), null, Now));
        Assert.True(StudentAccessRules.IsComplimentaryGrantActive(Now, Now.AddDays(1), null, Now));
        Assert.True(StudentAccessRules.IsComplimentaryGrantActive(Now.AddDays(-1), Now.AddMilliseconds(1), null, Now));
        Assert.False(StudentAccessRules.IsComplimentaryGrantActive(Now.AddDays(-1), Now, null, Now));
    }

    [Fact]
    public void Does_not_cover_when_revoked_or_not_started()
    {
        Assert.False(StudentAccessRules.IsComplimentaryGrantActive(Now.AddDays(-1), Now.AddDays(1), Now, Now));
        Assert.False(StudentAccessRules.IsComplimentaryGrantActive(Now.AddMilliseconds(1), Now.AddDays(1), null, Now));
    }

    [Fact]
    public void A_grant_gives_full_access_with_reason_complimentary_and_its_expiry()
    {
        var access = StudentAccessRules.WithComplimentary(StudentAccessRules.NoAccess, Expiry);

        Assert.Equal(new StudentAccess(true, true, StudentAccessRules.FullPlatformScope, "complimentary", Expiry), access);
    }

    [Fact]
    public void No_grant_keeps_the_subscription_verdict()
    {
        var trial = new StudentAccess(true, false, StudentAccessRules.FullPlatformScope, "subscription");

        Assert.Same(trial, StudentAccessRules.WithComplimentary(trial, null));
        Assert.Same(StudentAccessRules.NoAccess, StudentAccessRules.WithComplimentary(StudentAccessRules.NoAccess, null));
    }

    [Fact]
    public void A_paid_full_subscription_stays_the_reason()
    {
        var paid = new StudentAccess(true, true, StudentAccessRules.FullPlatformScope, "subscription");

        Assert.Same(paid, StudentAccessRules.WithComplimentary(paid, Expiry));
    }

    [Fact]
    public void A_one_time_purchase_or_a_trial_is_upgraded_by_a_grant()
    {
        var oneTime = new StudentAccess(false, true, StudentAccessRules.AssessmentsAndReportsScope, "one_time");
        var trial = new StudentAccess(true, false, StudentAccessRules.FullPlatformScope, "subscription");

        Assert.Equal("complimentary", StudentAccessRules.WithComplimentary(oneTime, Expiry).Reason);
        Assert.Equal("complimentary", StudentAccessRules.WithComplimentary(trial, Expiry).Reason);
    }
}
