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

    public Task<string> GetOrCreateCustomerAsync(RequestContext context, string userId, string? email, CancellationToken cancellationToken = default)
    {
        GetOrCreateCustomerCalls++;
        return Task.FromResult("cus_fake");
    }

    public Task<string> CreateCheckoutSessionAsync(string customerId, string priceId, string userId, string planId, string successUrl, string cancelUrl, CancellationToken cancellationToken = default) =>
        Task.FromResult($"https://checkout.stripe.com/pay/cs_fake_{userId}");

    public Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl, CancellationToken cancellationToken = default) =>
        Task.FromResult("https://billing.stripe.com/session/fake");

    public Task CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task<StripeSubscriptionLite> GetSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default) =>
        Task.FromResult(new StripeSubscriptionLite(stripeSubscriptionId, "active", DateTimeOffset.UtcNow.AddDays(30).ToUnixTimeSeconds(), null, null, false));
}
