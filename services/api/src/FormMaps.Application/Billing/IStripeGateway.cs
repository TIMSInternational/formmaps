namespace FormMaps.Application.Billing;

/// <summary>
/// Domain 9a Task 8. Thin wrapper over the real Stripe.net SDK -- the only place in this codebase that
/// talks to the live Stripe API for subscription checkout/read/cancel operations. Consumed by this
/// task's POST /checkout-session endpoint, and retrofitted into Task 4's webhook handler (replacing its
/// temporary checkout.session.completed fallback) to fetch accurate subscription state instead of
/// constructing a StripeSubscriptionLite from the checkout event's own embedded fields.
/// </summary>
public interface IStripeGateway
{
    Task<string> GetOrCreateCustomerAsync(string userId, string? email, CancellationToken cancellationToken = default);

    Task<string> CreateCheckoutSessionAsync(string customerId, string priceId, string userId, string planId, string successUrl, string cancelUrl, CancellationToken cancellationToken = default);

    Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl, CancellationToken cancellationToken = default);

    Task CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default);

    Task<StripeSubscriptionLite> GetSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default);
}
