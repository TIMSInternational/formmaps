using FormMaps.Application.Auth;

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
    /// <summary>
    /// Looks up the caller's existing Stripe customer id via <see cref="ILiveCustomerReader"/> (reads the
    /// LIVE users."stripeCustomerId" column, read-only, under the caller's own RequestContext) and returns
    /// it if found; only calls Stripe's CustomerService.CreateAsync when no existing id is on file.
    /// </summary>
    /// <remarks>
    /// Domain 9a Task 8 fix round 1 (Finding 1). KNOWN LIMITATION, not a bug: per this plan's Global
    /// Constraints, live tables (including <c>users</c>) are read-only from .NET until cutover -- no task
    /// in this plan may write to them. So when no existing customer id is found and this method creates
    /// one via Stripe, that brand-new id CANNOT be persisted back to <c>users."stripeCustomerId"</c> from
    /// here. A subsequent call for the same user -- before legacy Node's own checkout flow persists its
    /// own id, or before cutover unlocks write access -- will not see this newly-created id and will
    /// create another new Stripe customer. Full dedup is therefore not possible until cutover; this is an
    /// intentional, architecture-driven limitation, not something this fix round works around by
    /// bypassing the read-only constraint.
    /// </remarks>
    Task<string> GetOrCreateCustomerAsync(RequestContext context, string userId, string? email, CancellationToken cancellationToken = default);

    Task<string> CreateCheckoutSessionAsync(string customerId, string priceId, string userId, string planId, string successUrl, string cancelUrl, CancellationToken cancellationToken = default);

    Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl, CancellationToken cancellationToken = default);

    Task CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default);

    Task<StripeSubscriptionLite> GetSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default);
}
