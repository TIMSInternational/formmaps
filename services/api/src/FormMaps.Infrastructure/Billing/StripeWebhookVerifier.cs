using FormMaps.Application.Billing;
using Stripe;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// The real Stripe signature check, wrapping Stripe.net's <see cref="EventUtility.ConstructEvent" />.
/// </summary>
/// <remarks>
/// Domain 9a final-review fix wave (Important 4). This used to call the default overload, which is
/// <c>throwOnApiVersionMismatch: true</c>. That flag has nothing to do with signature integrity: it
/// compares the event's <c>api_version</c> against the version Stripe.net was compiled for
/// (<c>StripeConfiguration.ApiVersion</c>, currently 2026-07-29.dahlia) and throws
/// <see cref="StripeException" /> when they differ. A webhook endpoint receives whatever API version the
/// Stripe ACCOUNT is pinned to, which legitimately lags the SDK, so a perfectly valid, correctly signed
/// event was rejected — and BillingWebhookEndpoints, which can only see "a StripeException came out of
/// Verify", reported it to Stripe as 400 "Invalid webhook signature". Stripe then retries the event for
/// days against an endpoint that will never accept it.
///
/// Passing <c>false</c> disables ONLY that version comparison. HMAC verification, the timestamp
/// tolerance window and every other integrity check are unchanged and still throw — pinned by
/// StripeWebhookVerifierTests, which proves a tampered signature is still rejected with this flag off.
/// The residual risk the flag guards against is deserialisation drift on an old-versioned payload; the
/// handler mitigates that by reading nothing it does not explicitly resolve (see
/// BillingWebhookEndpoints.ResolveInvoiceSubscriptionId), and the reconciliation worker is the
/// backstop if a field does come through wrong.
/// </remarks>
public sealed class StripeWebhookVerifier : IStripeWebhookVerifier
{
    public Event Verify(string payload, string signatureHeader, string webhookSecret) =>
        EventUtility.ConstructEvent(payload, signatureHeader, webhookSecret, throwOnApiVersionMismatch: false);
}
