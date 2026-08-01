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

    /// <summary>
    /// Applies invoice.payment_failed by Stripe subscription id. Returns false if eventId already processed.
    /// </summary>
    /// <remarks>
    /// Domain 9a final-review fix wave (Important 3). Deliberately does NOT take a
    /// <see cref="StripeSubscriptionLite" /> like the two methods above: an invoice event carries no
    /// subscription object, and legacy stripeService.ts's invoice.payment_failed branch writes exactly one
    /// column — <c>data: { status: "past_due" }</c>. Passing a synthesised lite record here would push a
    /// derived nextBillingDate/isActive/cancelAtPeriodEnd the event never contained.
    /// </remarks>
    Task<bool> MarkSubscriptionPastDueAsync(
        string eventId, string eventType, string stripeSubscriptionId,
        CancellationToken cancellationToken = default);
}
