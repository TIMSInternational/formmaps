using FormMaps.Application.Auth;
using FormMaps.Application.Billing;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// In-memory stand-in for the real Stripe.net-backed IStripeGateway (Domain 9a Task 8). Used by both
/// BillingEndpointsTests (checkout-session) and BillingWebhookEndpointTests (retrofitted
/// checkout.session.completed handler now calls gateway.GetSubscriptionAsync) so neither test class
/// makes real network calls to Stripe. Signature mirrors IStripeGateway's fix-round-1 change
/// (GetOrCreateCustomerAsync now takes the caller's RequestContext) -- the real lookup-existing-first
/// logic lives in StripeGateway/LiveCustomerReader and is unit-tested directly there (see
/// StripeGatewayCustomerLookupTests), this fake still just tracks the call count and returns a fixed id.
/// </summary>
public sealed class FakeStripeGateway : IStripeGateway
{
    public int GetOrCreateCustomerCalls { get; private set; }

    /// <summary>Set true when CancelSubscriptionAsync is invoked -- Task 9's cancel-endpoint test asserts on this
    /// to confirm the gateway was actually called, not just that the endpoint returned 200. The final-review fix
    /// wave (Critical 1) also asserts the NEGATIVE: a non-cancellable live row must leave this false, i.e. the
    /// endpoint's status filter short-circuits before Stripe is ever contacted. The cancel-at-period-end vs
    /// immediate-cancel semantics themselves are not observable through this interface (IStripeGateway takes no
    /// options) -- that is pinned one layer down against the real StripeGateway in
    /// FormMaps.UnitTests.Billing.StripeGatewayCancelSubscriptionTests.</summary>
    public bool CancelCalled { get; private set; }

    /// <summary>The subscription id passed to the last CancelSubscriptionAsync call, if any.</summary>
    public string? CancelledSubscriptionId { get; private set; }

    /// <summary>Set true when CreateBillingPortalSessionAsync is invoked -- the final-review fix wave (Important 7)
    /// asserts this stays false when the caller has no Stripe customer on file.</summary>
    public bool BillingPortalCalled { get; private set; }

    /// <summary>The returnUrl handed to the last CreateBillingPortalSessionAsync call, if any. Added for
    /// issue #98: the endpoint used to build this from configuration["NEXT_PUBLIC_APP_URL"], a variable
    /// that is NOT set on formmaps-api-prod, so the value silently came from a hard-coded literal and no
    /// test could tell the difference. It now comes from FRONTEND_BASE_URL via FrontendUrl, and the path
    /// is legacy stripe.ts's /dashboard/subscriptions rather than /dashboard/settings -- neither is
    /// observable without capturing the argument here.</summary>
    public string? CapturedReturnUrl { get; private set; }

    public Task<string> GetOrCreateCustomerAsync(RequestContext context, string userId, string? email, CancellationToken cancellationToken = default)
    {
        GetOrCreateCustomerCalls++;
        return Task.FromResult("cus_fake");
    }

    public Task<string> CreateCheckoutSessionAsync(string customerId, string priceId, string userId, string planId, string successUrl, string cancelUrl, CancellationToken cancellationToken = default) =>
        Task.FromResult($"https://checkout.stripe.com/pay/cs_fake_{userId}");

    public Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl, CancellationToken cancellationToken = default)
    {
        BillingPortalCalled = true;
        CapturedReturnUrl = returnUrl;
        return Task.FromResult("https://billing.stripe.com/session/fake");
    }

    /// <summary>
    /// formmaps#30. Set to <see cref="StripeCancelOutcome.AlreadyGone" /> to simulate Stripe no longer
    /// having the subscription (deleted / already canceled) -- the real gateway classifies that instead of
    /// throwing, and the endpoint must finish the local cancellation and answer 200 rather than 500.
    /// </summary>
    public StripeCancelOutcome CancelOutcome { get; set; } = StripeCancelOutcome.Scheduled;

    public Task<StripeCancelOutcome> CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default)
    {
        CancelCalled = true;
        CancelledSubscriptionId = stripeSubscriptionId;
        return Task.FromResult(CancelOutcome);
    }

    public Task<StripeSubscriptionLite> GetSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default) =>
        Task.FromResult(new StripeSubscriptionLite(stripeSubscriptionId, "active", DateTimeOffset.UtcNow.AddDays(30).ToUnixTimeSeconds(), null, null, false));
}
