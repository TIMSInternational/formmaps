namespace FormMaps.Application.Billing;

public interface IBillingShadowRepository
{
    /// <summary>Applies a subscription-create/update event to shadow tables. Returns false if eventId was already processed (dedup hit, no-op).</summary>
    Task<bool> ApplySubscriptionEventAsync(
        string eventId, string eventType, string userId, string? planId, StripeSubscriptionLite subscription,
        CancellationToken cancellationToken = default);

    /// <summary>Applies a subscription-cancelled event by Stripe subscription id (no userId available from the event). Returns false if eventId already processed.</summary>
    Task<bool> MarkSubscriptionCancelledAsync(
        string eventId, string eventType, string stripeSubscriptionId, StripeSubscriptionLite subscription,
        CancellationToken cancellationToken = default);
}
