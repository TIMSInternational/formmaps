using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;
using Stripe.Checkout;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a Task 8. The one real Stripe.net-backed implementation of IStripeGateway. All other billing
/// code (checkout endpoint, webhook handler) depends on the interface, never on Stripe.net types
/// directly, so tests substitute FakeStripeGateway instead of hitting the live Stripe API.
/// </summary>
/// <remarks>
/// The optional <paramref name="stripeClient" /> parameter is a test seam, not a DI registration: no
/// <c>IStripeClient</c> is registered in FormMaps.Infrastructure.DependencyInjection, so the container
/// falls through to the parameter's default (null) and this class keeps building its own client lazily
/// from STRIPE_SECRET_KEY at call time -- deliberately lazy, since Stripe.net's StripeClient constructor
/// throws on an empty api key and STRIPE_SECRET_KEY is legitimately unset in dev/test. Tests pass a
/// StripeClient wired to a fake IHttpClient so they can assert on the exact request this gateway issues
/// (see StripeGatewayCancelSubscriptionTests) without any live network call.
/// </remarks>
public sealed class StripeGateway(IConfiguration configuration, ILiveCustomerReader liveCustomerReader, IStripeClient? stripeClient = null) : IStripeGateway
{
    private readonly string _apiKey = configuration["STRIPE_SECRET_KEY"] ?? string.Empty;

    private IStripeClient Client() => stripeClient ?? new StripeClient(_apiKey);

    /// <inheritdoc cref="IStripeGateway.GetOrCreateCustomerAsync" />
    public async Task<string> GetOrCreateCustomerAsync(RequestContext context, string userId, string? email, CancellationToken cancellationToken = default)
    {
        // Fix round 1 (Finding 1): look up an existing Stripe customer id before ever calling
        // CustomerService.CreateAsync. See IStripeGateway.GetOrCreateCustomerAsync's doc comment for the
        // read-only-until-cutover limitation this still leaves on the create path below.
        var existingCustomerId = await liveCustomerReader.GetStripeCustomerIdAsync(context, userId, cancellationToken);
        if (!string.IsNullOrWhiteSpace(existingCustomerId))
        {
            return existingCustomerId;
        }

        var service = new CustomerService(Client());
        var customer = await service.CreateAsync(new CustomerCreateOptions
        {
            Email = email,
            Metadata = new Dictionary<string, string> { ["userId"] = userId },
        }, cancellationToken: cancellationToken);
        return customer.Id;
    }

    public async Task<string> CreateCheckoutSessionAsync(string customerId, string priceId, string userId, string planId, string successUrl, string cancelUrl, CancellationToken cancellationToken = default)
    {
        var service = new SessionService(Client());
        var session = await service.CreateAsync(new SessionCreateOptions
        {
            Customer = customerId,
            Mode = "subscription",
            LineItems = [new SessionLineItemOptions { Price = priceId, Quantity = 1 }],
            SuccessUrl = successUrl,
            CancelUrl = cancelUrl,
            Metadata = new Dictionary<string, string> { ["userId"] = userId, ["planId"] = planId },
        }, cancellationToken: cancellationToken);
        return session.Url;
    }

    public async Task<string> CreateBillingPortalSessionAsync(string customerId, string returnUrl, CancellationToken cancellationToken = default)
    {
        var service = new Stripe.BillingPortal.SessionService(Client());
        var session = await service.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer = customerId,
            ReturnUrl = returnUrl,
        }, cancellationToken: cancellationToken);
        return session.Url;
    }

    /// <summary>
    /// Schedules cancellation at the END of the period the user already paid for -- NOT an immediate
    /// cancel. Ports legacy stripe.ts's `stripe.subscriptions.update(subId, { cancel_at_period_end: true })`
    /// (POST /api/stripe/cancel-subscription).
    /// </summary>
    /// <remarks>
    /// Domain 9a final-review fix wave (Critical 1). This previously called
    /// <c>SubscriptionService.CancelAsync</c>, which issues <c>DELETE /v1/subscriptions/{id}</c> and
    /// terminates the subscription IMMEDIATELY -- an irreversible loss of already-paid-for access, and a
    /// silent behaviour divergence from legacy Node. <c>UpdateAsync</c> with
    /// <see cref="SubscriptionUpdateOptions.CancelAtPeriodEnd" /> issues
    /// <c>POST /v1/subscriptions/{id}</c> with <c>cancel_at_period_end=true</c> instead; Stripe then emits
    /// the customer.subscription.updated/deleted webhooks that sync the final state.
    /// </remarks>
    public async Task CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default)
    {
        var service = new SubscriptionService(Client());
        await service.UpdateAsync(
            stripeSubscriptionId,
            new SubscriptionUpdateOptions { CancelAtPeriodEnd = true },
            cancellationToken: cancellationToken);
    }

    public async Task<StripeSubscriptionLite> GetSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default)
    {
        var service = new SubscriptionService(Client());
        var sub = await service.GetAsync(stripeSubscriptionId, cancellationToken: cancellationToken);
        // The Stripe.Subscription -> StripeSubscriptionLite extraction lives in
        // StripeSubscriptionMapper.ToLite (FormMaps.Application.Billing) as of the Domain 9a final-review
        // fix wave, so the webhook endpoint can share it instead of hand-rolling the record. See that
        // method's remarks for the SDK-version notes that used to live here.
        return StripeSubscriptionMapper.ToLite(sub);
    }
}
