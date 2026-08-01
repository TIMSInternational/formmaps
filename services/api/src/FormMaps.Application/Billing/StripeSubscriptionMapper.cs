namespace FormMaps.Application.Billing;

/// <summary>
/// Minimal shape needed to derive a SubscriptionRecord — mirrors StripeSubscriptionLike in legacy stripeSubscriptions.ts.
/// </summary>
/// <remarks>
/// Positional parameter order is deliberate and load-bearing: <c>ItemCurrentPeriodEndUnixSeconds</c> comes
/// before <c>TrialEndUnixSeconds</c>. This matches the fallback priority used by
/// <see cref="StripeSubscriptionMapper.ResolvePeriodEndUnixSeconds"/>: current period end, then item current
/// period end, then trial end (current → item → trial). Any future construction of this record — positionally
/// or otherwise — must preserve this order/priority; do not reorder Item and Trial relative to each other.
/// </remarks>
public sealed record StripeSubscriptionLite(
    string Id,
    string? Status,
    long? CurrentPeriodEndUnixSeconds,
    long? ItemCurrentPeriodEndUnixSeconds,
    long? TrialEndUnixSeconds,
    bool CancelAtPeriodEnd);

public sealed record SubscriptionRecord(
    string StripeSubscriptionId,
    string Status,
    DateTimeOffset? NextBillingDate,
    bool CancelAtPeriodEnd,
    bool IsActive,
    string? PlanId);

/// <summary>
/// Pure port of legacy api/src/lib/stripeSubscriptions.ts — no DB dependency, trivially unit-testable,
/// matching this repo's existing SubscriptionAccess.cs convention.
/// </summary>
/// <remarks>
/// Domain 9a final-review fix wave (Important 1) added <see cref="ToLite" />, the one Stripe-SDK-typed
/// member here. It was lifted out of FormMaps.Infrastructure's StripeGateway because BOTH the gateway and
/// the webhook endpoint need it, and FormMaps.Api's endpoints deliberately depend only on
/// FormMaps.Application (no endpoint in this codebase references an Infrastructure type). This namespace
/// already depends on Stripe.net for <see cref="IStripeWebhookVerifier" />'s Stripe.Event return type, so
/// this adds no new dependency edge.
/// </remarks>
public static class StripeSubscriptionMapper
{
    /// <summary>
    /// Extracts the fields this codebase cares about from a real <see cref="Stripe.Subscription" />.
    /// The single place a Stripe.net subscription becomes a <see cref="StripeSubscriptionLite" /> — used by
    /// StripeGateway.GetSubscriptionAsync (checkout.session.completed) and by the
    /// customer.subscription.updated/deleted webhook branch, which previously hand-built the record with
    /// all three period-end fields hardcoded to null and so wiped nextBillingDate on every renewal.
    /// </summary>
    /// <remarks>
    /// Stripe.net 52.2.0's Subscription no longer exposes a top-level CurrentPeriodEnd — Stripe moved
    /// current_period_end onto each subscription item. <see cref="ResolvePeriodEndUnixSeconds" /> already
    /// falls back current → item → trial (see its remarks), so leaving CurrentPeriodEndUnixSeconds null
    /// here and populating ItemCurrentPeriodEndUnixSeconds from the first item is the accurate mapping for
    /// this SDK version, not a placeholder. Stripe.Subscription/StripeList/SubscriptionItem are plain
    /// POCOs with public parameterless constructors and settable properties (confirmed via reflection
    /// against the installed package), so this is directly unit-testable without a live API call — see
    /// StripeSubscriptionLiteMappingTests, which exists because this exact Items/TrialEnd extraction
    /// already broke once on an SDK version bump.
    /// </remarks>
    public static StripeSubscriptionLite ToLite(Stripe.Subscription sub)
    {
        var itemPeriodEnd = sub.Items?.Data?.FirstOrDefault()?.CurrentPeriodEnd;

        return new StripeSubscriptionLite(
            sub.Id,
            sub.Status,
            CurrentPeriodEndUnixSeconds: null,
            ItemCurrentPeriodEndUnixSeconds: itemPeriodEnd is { } periodEnd ? ToUnixSeconds(periodEnd) : null,
            TrialEndUnixSeconds: sub.TrialEnd is { } trialEnd ? ToUnixSeconds(trialEnd) : null,
            CancelAtPeriodEnd: sub.CancelAtPeriodEnd);
    }

    private static long ToUnixSeconds(DateTime value) =>
        new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)).ToUnixTimeSeconds();

    public static string MapStatus(string? stripeStatus) => stripeStatus switch
    {
        "active" => "active",
        "trialing" => "trialing",
        "past_due" or "unpaid" => "past_due",
        "canceled" or "incomplete_expired" => "cancelled",
        "incomplete" => "incomplete",
        _ => "incomplete",
    };

    /// <summary>Priority order matches legacy resolvePeriodEnd: current_period_end, then items[0].current_period_end, then trial_end.</summary>
    public static long? ResolvePeriodEndUnixSeconds(StripeSubscriptionLite sub) =>
        sub.CurrentPeriodEndUnixSeconds ?? sub.ItemCurrentPeriodEndUnixSeconds ?? sub.TrialEndUnixSeconds;

    public static SubscriptionRecord ToRecord(StripeSubscriptionLite sub, string? planId = null)
    {
        var status = MapStatus(sub.Status);
        var periodEnd = ResolvePeriodEndUnixSeconds(sub);
        return new SubscriptionRecord(
            StripeSubscriptionId: sub.Id,
            Status: status,
            NextBillingDate: periodEnd is { } p ? DateTimeOffset.FromUnixTimeSeconds(p) : null,
            CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
            IsActive: status != "cancelled",
            PlanId: status == "cancelled" ? null : planId);
    }
}
