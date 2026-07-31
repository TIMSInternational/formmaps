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
/// Pure port of legacy api/src/lib/stripeSubscriptions.ts. No Stripe SDK / no DB dependency —
/// trivially unit-testable, matching this repo's existing SubscriptionAccess.cs convention.
/// </summary>
public static class StripeSubscriptionMapper
{
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
