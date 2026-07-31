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
}

public sealed class RejectingVerifier : IStripeWebhookVerifier
{
    public Event Verify(string payload, string signatureHeader, string webhookSecret) =>
        throw new StripeException("Invalid signature");
}
