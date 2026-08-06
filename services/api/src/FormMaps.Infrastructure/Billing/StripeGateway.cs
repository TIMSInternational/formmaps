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
    public async Task<StripeCancelOutcome> CancelSubscriptionAsync(string stripeSubscriptionId, CancellationToken cancellationToken = default)
    {
        var service = new SubscriptionService(Client());
        try
        {
            await service.UpdateAsync(
                stripeSubscriptionId,
                new SubscriptionUpdateOptions { CancelAtPeriodEnd = true },
                cancellationToken: cancellationToken);
            return StripeCancelOutcome.Scheduled;
        }
        catch (StripeException exception) when (IsAlreadyGone(exception))
        {
            // formmaps#30 idempotency. Stripe itself confirms this subscription is already cancelled
            // (400 "You cannot update a canceled subscription") -- typically a missed
            // customer.subscription.deleted webhook left the local row stale. Rethrowing surfaces as a
            // 500 and leaves the user permanently unable to cancel; the caller instead finishes the
            // local cancellation and answers 200. Note this is Stripe ASSERTING the subscription ended,
            // which is why ending the local grant is safe here and is NOT safe for a 404 -- see
            // IsAlreadyGone's remarks.
            return StripeCancelOutcome.AlreadyGone;
        }
    }

    /// <summary>
    /// The ONE shape that actually means "this subscription is already cancelled": a 400 invalid_request
    /// whose message names a canceled subscription. Stripe never forgets a subscription id -- a cancelled
    /// one stays retrievable and answers 400. It does NOT 404.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>resource_missing</c> / HTTP 404 is deliberately NOT matched here (formmaps#30). It does not mean
    /// the subscription ended; it means the id is not in the Stripe account this API key addresses -- a
    /// test-vs-live key mismatch (formmaps#43, #73), a rotated key on a different account, or a
    /// staging-seeded id in a prod row. In exactly that case the subscription is very likely still LIVE
    /// and still billing the customer, so treating it as "already gone" would end the local entitlement
    /// and destroy the only record of a charge that keeps recurring. Letting the StripeException
    /// propagate to a 500 preserves the row, keeps the charge reconcilable, and surfaces the
    /// misconfiguration -- the exception message ("No such subscription: sub_...") names the id.
    /// </para>
    /// <para>
    /// Any other StripeException (auth, rate limit, card, network) still propagates and still becomes a
    /// 500, which is correct. Mirrors stripeSubscriptionAlreadyGone in the Node twin
    /// (formmaps-platform api/src/routes/stripe.ts).
    /// </para>
    /// </remarks>
    private static bool IsAlreadyGone(StripeException exception) =>
        (exception.StripeError?.Message ?? string.Empty).Contains("canceled subscription", StringComparison.OrdinalIgnoreCase);

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
