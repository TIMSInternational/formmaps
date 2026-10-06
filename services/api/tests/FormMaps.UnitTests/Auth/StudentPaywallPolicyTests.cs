using FormMaps.Application.Auth;
using FormMaps.Infrastructure.Auth;
using Microsoft.Extensions.Logging.Abstractions;

namespace FormMaps.UnitTests.Auth;

/// <summary>
/// Mirrors the "paywall path classes + decisions" block of legacy student-entitlement.unit.test.ts
/// (tafurfede/formmaps-platform#440) plus the .NET-only rows, and pins D4 on <see cref="SubscriptionGuard"/>.
/// </summary>
public class StudentPaywallPolicyTests
{
    private static readonly StudentAccess None = StudentAccessRules.NoAccess;
    private static readonly StudentAccess Trial = new(true, false, StudentAccessRules.FullPlatformScope, "subscription");
    private static readonly StudentAccess Paid = new(true, true, StudentAccessRules.FullPlatformScope, "subscription");
    private static readonly StudentAccess OneTime = new(false, true, StudentAccessRules.AssessmentsAndReportsScope, "one_time");

    [Theory]
    // legacy rows
    [InlineData("/authapi/login", PaywallClass.Open)]
    [InlineData("/api/v1/entitlement/results-preview", PaywallClass.Open)]
    [InlineData("/api/stripe/billing-portal", PaywallClass.Open)]
    [InlineData("/api/v1/user/subscription/status", PaywallClass.Open)]
    [InlineData("/api/v1/telemetry/events", PaywallClass.Open)]
    [InlineData("/health", PaywallClass.Open)]
    [InlineData("/api/v1/lia/start", PaywallClass.Taking)]
    [InlineData("/api/v1/lia/session/s1/answer", PaywallClass.Taking)]
    [InlineData("/api/v1/lia/session/s1/complete", PaywallClass.Taking)]
    [InlineData("/api/v1/personality/start", PaywallClass.Taking)]
    [InlineData("/api/pcaexam/exams/e1/start", PaywallClass.Taking)]
    [InlineData("/api/pcaexam/submit", PaywallClass.Taking)]
    [InlineData("/api/question360/GetQuestions", PaywallClass.Taking)]
    [InlineData("/api/v1/vocational360/instrument", PaywallClass.Taking)]
    [InlineData("/api/v1/vocational360/questionnaire", PaywallClass.Taking)]
    [InlineData("/evaluation/vocational/tok123", PaywallClass.Taking)]
    [InlineData("/evaluation/validate-token", PaywallClass.Taking)]
    [InlineData("/api/v1/lia/session/s1/results", PaywallClass.Results)]
    [InlineData("/api/v1/LIA/user/u1/results", PaywallClass.Results)]
    [InlineData("/api/v1/personality/session/s1/results/", PaywallClass.Results)]
    [InlineData("/api/v1/mil/results/u1", PaywallClass.Results)]
    [InlineData("/api/pcaexam/history/u1", PaywallClass.Results)]
    [InlineData("/api/pcaexam/completed-exams/u1", PaywallClass.Results)]
    [InlineData("/api/pcaexam/all-results", PaywallClass.Results)]
    [InlineData("/api/v1/reports/lia/u1", PaywallClass.Results)]
    [InlineData("/api/v1/reports/send-report-email/u1", PaywallClass.Results)]
    [InlineData("/api/v1/vocational360/score/u1", PaywallClass.Results)]
    [InlineData("/api/v1/vocational360/integrated/u1/recompute", PaywallClass.Results)]
    [InlineData("/api/v1/assessments/me/timeline", PaywallClass.Results)]
    [InlineData("/api/resume", PaywallClass.Platform)]
    [InlineData("/api/resume/r1/sections", PaywallClass.Platform)]
    [InlineData("/api/v1/student/applications", PaywallClass.Platform)]
    [InlineData("/api/v1/college/favorites", PaywallClass.Platform)]
    [InlineData("/api/v1/messages/conversations", PaywallClass.Platform)]
    [InlineData("/hubs/messages/negotiate", PaywallClass.Platform)]
    [InlineData("/api/v1/test-scores/superscore", PaywallClass.Platform)]
    [InlineData("/api/v1/recommendations", PaywallClass.Platform)]
    [InlineData("/api/v1/video/sessions", PaywallClass.Platform)]
    [InlineData("/api/v1/upload/presign", PaywallClass.Platform)]
    [InlineData("/api/v1/transcript/me", PaywallClass.Platform)]
    [InlineData("/api/v1/moderation/report", PaywallClass.Platform)]
    [InlineData("/api/v1/something-new", PaywallClass.Platform)]
    // .NET-only rows
    [InlineData("/", PaywallClass.Open)]
    [InlineData("/version", PaywallClass.Open)]
    [InlineData("/api/v1/billing/checkout-session", PaywallClass.Open)]
    [InlineData("/api/v1/billing/status", PaywallClass.Open)]
    [InlineData("/api/v1/context/current", PaywallClass.Open)]
    [InlineData("/api/v1/migration/roadmap", PaywallClass.Open)]
    [InlineData("/api/v1/careerfit/results/u1", PaywallClass.Results)]
    [InlineData("/api/v1/careerfit/runs/r1/explanation", PaywallClass.Results)]
    [InlineData("/api/v1/careerfit/evaluate/u1", PaywallClass.Platform)]
    [InlineData("/api/v1/careerfit/families", PaywallClass.Platform)]
    // prefix boundaries
    [InlineData("/healthz", PaywallClass.Platform)]
    [InlineData("/api/v1/lia-other", PaywallClass.Platform)]
    [InlineData("/api/v1/billingx", PaywallClass.Platform)]
    public void Classifies_paths_like_legacy(string path, PaywallClass expected)
    {
        Assert.Equal(expected, StudentPaywallPolicy.Classify(path));
    }

    [Fact]
    public void Results_endpoint_marker_overrides_taking_or_platform_but_never_open()
    {
        Assert.Equal(PaywallClass.Results, StudentPaywallPolicy.Classify("/api/v1/lia/anything", endpointIsResults: true));
        Assert.Equal(PaywallClass.Results, StudentPaywallPolicy.Classify("/api/v1/x", endpointIsResults: true));
        Assert.Equal(PaywallClass.Open, StudentPaywallPolicy.Classify("/authapi/profile", endpointIsResults: true));
    }

    [Fact]
    public void Open_and_taking_always_allow()
    {
        foreach (var access in new[] { None, Trial, Paid, OneTime })
        {
            Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Open, access));
            Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Taking, access));
        }
    }

    [Fact]
    public void Results_need_paid_results()
    {
        Assert.Equal("PAID_RESULTS_REQUIRED", StudentPaywallPolicy.Decide(PaywallClass.Results, None)!.Code);
        var trial = StudentPaywallPolicy.Decide(PaywallClass.Results, Trial)!;
        Assert.Equal("PAID_RESULTS_REQUIRED", trial.Code);
        Assert.Equal("Your full results unlock after your first payment", trial.Message);
        Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Results, Paid));
        Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Results, OneTime));
    }

    [Fact]
    public void Platform_needs_full_platform()
    {
        var none = StudentPaywallPolicy.Decide(PaywallClass.Platform, None)!;
        Assert.Equal("PAYMENT_REQUIRED", none.Code);
        Assert.Equal("Complete your purchase to access FormMaps", none.Message);

        var oneTime = StudentPaywallPolicy.Decide(PaywallClass.Platform, OneTime)!;
        Assert.Equal("FULL_PLATFORM_REQUIRED", oneTime.Code);
        Assert.Equal("This feature is part of a FormMaps subscription", oneTime.Message);

        Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Platform, Trial));
        Assert.Null(StudentPaywallPolicy.Decide(PaywallClass.Platform, Paid));
    }

    // ---- D4: requireSubscription defers to the global gate while the flag is ON ----

    [Fact]
    public async Task Subscription_guard_allows_without_touching_the_db_when_the_paywall_is_on()
    {
        // A null session factory would throw if the guard reached the DB.
        var guard = new SubscriptionGuard(null!, NullLogger<SubscriptionGuard>.Instance, 7, () => true);

        var decision = await guard.RequireSubscriptionAsync(RequestContext.Anonymous());

        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task Subscription_guard_is_unchanged_when_the_paywall_is_off()
    {
        var guard = new SubscriptionGuard(null!, NullLogger<SubscriptionGuard>.Instance, 7, () => false);

        var decision = await guard.RequireSubscriptionAsync(RequestContext.Anonymous());

        Assert.False(decision.Allowed);
        Assert.Equal(401, decision.StatusCode);
        Assert.Equal("missing_identity", decision.Code);
    }
}
