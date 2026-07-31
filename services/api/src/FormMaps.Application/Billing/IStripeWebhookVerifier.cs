using Stripe;

namespace FormMaps.Application.Billing;

public interface IStripeWebhookVerifier
{
    /// <summary>Verifies the payload against signatureHeader using webhookSecret. Throws Stripe.StripeException on failure.</summary>
    Event Verify(string payload, string signatureHeader, string webhookSecret);
}
