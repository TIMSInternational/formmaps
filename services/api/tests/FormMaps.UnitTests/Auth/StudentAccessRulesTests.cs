using System.Text.Json.Nodes;
using FormMaps.Application.Auth;

namespace FormMaps.UnitTests.Auth;

/// <summary>
/// Mirrors legacy api/src/__tests__/student-entitlement.unit.test.ts (tafurfede/formmaps-platform#440)
/// one-for-one for the pure rules ported to .NET (TIMSInternational/formmaps#240).
/// </summary>
public class StudentAccessRulesTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 6, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Future = new(2026, 11, 6, 12, 0, 0, TimeSpan.Zero);
    private const int Grace = 7;

    private static EntitlementSubscription Monthly(string status, DateTimeOffset? nextBillingDate = null, bool useFuture = true) =>
        new(status, IsActive: true, nextBillingDate ?? (useFuture ? Future : null), HasPlan: true, PlanInterval: "month");

    private static EntitlementSubscription OneTime(string status = "active", bool isActive = true) =>
        new(status, isActive, NextBillingDate: null, HasPlan: true, PlanInterval: "one_time");

    // ---- flag ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("false")]
    [InlineData("0")]
    [InlineData("off")]
    [InlineData("yes please")]
    public void Flag_defaults_off(string? raw)
    {
        Assert.False(StudentAccessRules.IsPaywallEnabled(raw));
    }

    [Theory]
    [InlineData("true")]
    [InlineData("TRUE")]
    [InlineData("1")]
    [InlineData("on")]
    [InlineData("On")]
    [InlineData(" true ")]
    public void Flag_enabled_only_for_true_1_on(string raw)
    {
        Assert.True(StudentAccessRules.IsPaywallEnabled(raw));
    }

    // ---- evaluate (D2/D4/D5) ----

    [Fact]
    public void Nothing_means_no_access()
    {
        var access = StudentAccessRules.Evaluate(null, Now, Grace);
        Assert.False(access.FullPlatform);
        Assert.False(access.PaidResults);
        Assert.Null(access.Scope);
        Assert.Equal("none", access.Reason);
    }

    [Fact]
    public void Trialing_subscription_is_full_platform_with_preview_only()
    {
        var access = StudentAccessRules.Evaluate(Monthly("trialing"), Now, Grace);
        Assert.True(access.FullPlatform);
        Assert.False(access.PaidResults);
        Assert.Equal(StudentAccessRules.FullPlatformScope, access.Scope);
    }

    [Theory]
    [InlineData("month")]
    [InlineData("monthly")]
    [InlineData("year")]
    [InlineData("yearly")]
    [InlineData(" Month ")]
    public void Charged_active_subscription_is_everything_on_every_recurring_plan(string interval)
    {
        var access = StudentAccessRules.Evaluate(
            new EntitlementSubscription("active", true, Future, HasPlan: true, PlanInterval: interval), Now, Grace);
        Assert.True(access.FullPlatform);
        Assert.True(access.PaidResults);
        Assert.Equal("subscription", access.Reason);
    }

    [Fact]
    public void Past_due_within_grace_is_platform_with_preview_only()
    {
        var access = StudentAccessRules.Evaluate(Monthly("past_due"), Now, Grace);
        Assert.True(access.FullPlatform);
        Assert.False(access.PaidResults);
    }

    [Fact]
    public void Expired_active_subscription_is_nothing()
    {
        var access = StudentAccessRules.Evaluate(
            Monthly("active", new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero)), Now, Grace);
        Assert.False(access.FullPlatform);
        Assert.False(access.PaidResults);
    }

    [Theory]
    [InlineData("cancelled")]
    [InlineData("canceled")]
    [InlineData("incomplete")]
    public void Cancelled_or_non_access_status_is_nothing(string status)
    {
        var access = StudentAccessRules.Evaluate(Monthly(status), Now, Grace);
        Assert.False(access.FullPlatform);
        Assert.False(access.PaidResults);
    }

    [Fact]
    public void Inactive_row_is_nothing()
    {
        var access = StudentAccessRules.Evaluate(Monthly("active") with { IsActive = false }, Now, Grace);
        Assert.Equal(StudentAccessRules.NoAccess, access);
    }

    [Fact]
    public void One_time_is_paid_results_with_no_expiry_and_never_the_full_platform()
    {
        var access = StudentAccessRules.Evaluate(OneTime(), new DateTimeOffset(2031, 1, 1, 0, 0, 0, TimeSpan.Zero), Grace);
        Assert.False(access.FullPlatform);
        Assert.True(access.PaidResults);
        Assert.Equal(StudentAccessRules.AssessmentsAndReportsScope, access.Scope);
        Assert.Equal("one_time", access.Reason);
    }

    [Fact]
    public void One_time_not_active_status_is_nothing()
    {
        Assert.Equal(StudentAccessRules.NoAccess, StudentAccessRules.Evaluate(OneTime("trialing"), Now, Grace));
    }

    [Fact]
    public void Revoked_one_time_is_nothing()
    {
        var access = StudentAccessRules.Evaluate(OneTime("cancelled", isActive: false), Now, Grace);
        Assert.False(access.PaidResults);
    }

    [Fact]
    public void No_plan_info_is_treated_as_a_subscription()
    {
        var trialing = StudentAccessRules.Evaluate(
            new EntitlementSubscription("trialing", true, Future, HasPlan: false, PlanInterval: null), Now, Grace);
        Assert.True(trialing.FullPlatform);
        Assert.False(trialing.PaidResults);
        Assert.Equal(StudentAccessRules.FullPlatformScope, trialing.Scope);

        var active = StudentAccessRules.Evaluate(
            new EntitlementSubscription("active", true, null, HasPlan: false, PlanInterval: null), Now, Grace);
        Assert.True(active.FullPlatform);
        Assert.True(active.PaidResults);
    }

    [Theory]
    [InlineData("month", StudentAccessRules.FullPlatformScope)]
    [InlineData("year", StudentAccessRules.FullPlatformScope)]
    [InlineData("one_time", StudentAccessRules.AssessmentsAndReportsScope)]
    [InlineData(null, StudentAccessRules.AssessmentsAndReportsScope)]
    [InlineData("", StudentAccessRules.AssessmentsAndReportsScope)]
    public void Scope_follows_the_plan_interval(string? interval, string expected)
    {
        Assert.Equal(expected, StudentAccessRules.ScopeForInterval(interval));
    }

    // ---- school contract (D9) ----

    private static readonly SchoolContract School = new(
        IsActive: true,
        Status: "active",
        ContractStartDate: new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero),
        ContractEndDate: new DateTimeOffset(2027, 6, 30, 0, 0, 0, TimeSpan.Zero));

    [Fact]
    public void Active_school_within_its_window_covers_its_students()
    {
        Assert.True(StudentAccessRules.SchoolHasActiveContract(School, Now));
        Assert.True(StudentAccessRules.SchoolHasActiveContract(School with { ContractStartDate = null }, Now));
    }

    [Fact]
    public void Expired_contract_does_not_cover()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(
            School with { ContractEndDate = new DateTimeOffset(2026, 9, 30, 0, 0, 0, TimeSpan.Zero) }, Now));
    }

    [Fact]
    public void Not_yet_started_contract_does_not_cover()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(
            School with { ContractStartDate = new DateTimeOffset(2026, 12, 1, 0, 0, 0, TimeSpan.Zero) }, Now));
    }

    [Fact]
    public void Open_ended_seed_school_does_not_cover()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School with { ContractEndDate = null }, Now));
    }

    [Fact]
    public void Inactive_school_does_not_cover()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School with { IsActive = false }, Now));
    }

    [Theory]
    [InlineData("invited")]
    [InlineData("inactive")]
    [InlineData("suspended")]
    [InlineData("Active")]
    [InlineData(null)]
    public void Non_active_status_does_not_cover(string? status)
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(School with { Status = status }, Now));
    }

    [Fact]
    public void Missing_school_does_not_cover()
    {
        Assert.False(StudentAccessRules.SchoolHasActiveContract(null, Now));
    }

    [Fact]
    public void Contract_ending_exactly_now_still_covers()
    {
        // Legacy: contractEndDate.getTime() < now.getTime() -> not covered; equal is still covered.
        Assert.True(StudentAccessRules.SchoolHasActiveContract(School with { ContractEndDate = Now }, Now));
    }

    // ---- completion redaction ----

    [Fact]
    public void Redaction_strips_a_successful_body_to_completed_with_session_id()
    {
        var body = JsonNode.Parse("""{"success":true,"data":{"sessionId":"s1","globalPercentile":74.5,"scores":{"a":1}}}""");
        var redacted = StudentAccessRules.RedactCompletionBody(body);

        Assert.NotNull(redacted);
        Assert.Equal(
            """{"success":true,"data":{"sessionId":"s1","completed":true,"resultsLocked":true}}""",
            redacted!.ToJsonString());
    }

    [Fact]
    public void Redaction_falls_back_to_data_id_then_null()
    {
        var withId = StudentAccessRules.RedactCompletionBody(JsonNode.Parse("""{"success":true,"data":{"id":"e9","score":3}}"""));
        Assert.Equal("e9", withId!["data"]!["sessionId"]!.GetValue<string>());

        // LIA's completion body is snake_case (session_id): legacy reads only sessionId ?? id, so null.
        var snake = StudentAccessRules.RedactCompletionBody(JsonNode.Parse("""{"success":true,"data":{"session_id":"s1"}}"""));
        Assert.Null(snake!["data"]!["sessionId"]);

        var noData = StudentAccessRules.RedactCompletionBody(JsonNode.Parse("""{"success":true}"""));
        Assert.Null(noData!["data"]!["sessionId"]);
    }

    [Theory]
    [InlineData("""{"success":false,"message":"Not found"}""")]
    [InlineData("""{"message":"x"}""")]
    [InlineData("""{"success":"true"}""")]
    [InlineData("[1,2]")]
    [InlineData("null")]
    public void Redaction_leaves_non_success_bodies_untouched(string json)
    {
        Assert.Null(StudentAccessRules.RedactCompletionBody(JsonNode.Parse(json)));
    }
}
