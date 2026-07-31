using FormMaps.Application.Billing;
using Stripe;

namespace FormMaps.Infrastructure.Billing;

public sealed class StripeWebhookVerifier : IStripeWebhookVerifier
{
    public Event Verify(string payload, string signatureHeader, string webhookSecret) =>
        EventUtility.ConstructEvent(payload, signatureHeader, webhookSecret);
}
