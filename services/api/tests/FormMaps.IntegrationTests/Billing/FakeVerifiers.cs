using FormMaps.Application.Billing;
using Stripe;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>Bypasses real Stripe signature checking in tests — parses the raw JSON payload as-is.</summary>
public sealed class FakeVerifier : IStripeWebhookVerifier
{
    // throwOnApiVersionMismatch: false — our fake payloads carry no "api_version" field (there's no real
    // Stripe API version to compare against in tests), and Stripe.net's default-overload compatibility
    // check NREs when that field is absent rather than treating it as "no version to check".
    public Event Verify(string payload, string signatureHeader, string webhookSecret) =>
        EventUtility.ParseEvent(payload, throwOnApiVersionMismatch: false);

    // Note: uses $$$/triple-brace holes, not $$/double-brace — the JSON body's own nested-object closing
    // "}}" would otherwise collide with a double-brace interpolation delimiter (CS9007).
    public static string SubscriptionCreatedEventJson(string eventId, string userId, string planId, string stripeSubscriptionId) => $$$"""
        {
          "id": "{{{eventId}}}",
          "type": "checkout.session.completed",
          "data": { "object": {
            "id": "cs_{{{eventId}}}", "object": "checkout.session", "mode": "subscription",
            "metadata": { "userId": "{{{userId}}}", "planId": "{{{planId}}}" },
            "subscription": "{{{stripeSubscriptionId}}}", "customer": "cus_test"
          }}
        }
        """;

    /// <summary>
    /// A customer.subscription.updated/deleted payload carrying a real items[0].current_period_end — the
    /// field Stripe.net 52.2.0 exposes as SubscriptionItem.CurrentPeriodEnd and the one the shadow write
    /// path derives nextBillingDate from. Added for the final-review fix wave (Important 1).
    /// </summary>
    public static string SubscriptionLifecycleEventJson(
        string eventId, string eventType, string stripeSubscriptionId, string status,
        long itemCurrentPeriodEndUnixSeconds, bool cancelAtPeriodEnd) => $$$"""
        {
          "id": "{{{eventId}}}",
          "type": "{{{eventType}}}",
          "data": { "object": {
            "id": "{{{stripeSubscriptionId}}}", "object": "subscription", "status": "{{{status}}}",
            "cancel_at_period_end": {{{(cancelAtPeriodEnd ? "true" : "false")}}},
            "items": { "object": "list", "data": [
              { "id": "si_{{{stripeSubscriptionId}}}", "object": "subscription_item",
                "current_period_end": {{{itemCurrentPeriodEndUnixSeconds}}} }
            ]}
          }}
        }
        """;

    /// <summary>
    /// invoice.payment_failed in the CURRENT Stripe API shape, where the subscription id is nested at
    /// parent.subscription_details.subscription (Stripe.net 52.2.0's
    /// Invoice.Parent.SubscriptionDetails.SubscriptionId). Added for the final-review fix wave (Important 3).
    /// </summary>
    public static string InvoicePaymentFailedEventJson(string eventId, string stripeSubscriptionId) => $$$"""
        {
          "id": "{{{eventId}}}",
          "type": "invoice.payment_failed",
          "data": { "object": {
            "id": "in_{{{eventId}}}", "object": "invoice",
            "parent": { "type": "subscription_details",
                        "subscription_details": { "subscription": "{{{stripeSubscriptionId}}}" } }
          }}
        }
        """;

    /// <summary>
    /// The same event as an OLDER account-pinned API version serialises it: subscription id at the invoice
    /// root, which is the shape legacy stripeService.ts reads and which Stripe.net 52.2.0 does not map onto
    /// any Invoice property.
    /// </summary>
    public static string LegacyShapeInvoicePaymentFailedEventJson(string eventId, string stripeSubscriptionId) => $$$"""
        {
          "id": "{{{eventId}}}",
          "type": "invoice.payment_failed",
          "data": { "object": {
            "id": "in_{{{eventId}}}", "object": "invoice",
            "subscription": "{{{stripeSubscriptionId}}}"
          }}
        }
        """;
}

public sealed class RejectingVerifier : IStripeWebhookVerifier
{
    public Event Verify(string payload, string signatureHeader, string webhookSecret) =>
        throw new StripeException("Invalid signature");
}
