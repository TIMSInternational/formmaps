namespace FormMaps.Application.Auth;

/// <summary>
/// Pure port of legacy <c>src/lib/subscriptionAccess.ts::subscriptionGrantsAccess</c> — the single
/// source of truth for "does this UserSubscription currently grant access?". No DB/Stripe deps, so
/// it is trivially unit-testable with a pinned <paramref name="now"/>.
///
/// <c>past_due</c> is intentionally an access status (that IS the grace period); a time-based hard
/// expiry (billing date + grace days) revokes access even when a status-change webhook was missed.
/// </summary>
public static class SubscriptionAccess
{
    public const int DefaultGraceDays = 7;

    public static readonly IReadOnlySet<string> AccessStatuses =
        new HashSet<string>(StringComparer.Ordinal) { "active", "trialing", "past_due" };

    public static bool GrantsAccess(
        string? status,
        bool isActive,
        DateTimeOffset? nextBillingDate,
        DateTimeOffset now,
        int graceDays)
    {
        if (!isActive)
        {
            return false;
        }

        if (status is null || !AccessStatuses.Contains(status))
        {
            return false;
        }

        // Legacy: now.getTime() > nextBillingDate.getTime() + GRACE_DAYS * DAY_MS (strict).
        if (nextBillingDate is { } billingDate && now > billingDate.AddDays(graceDays))
        {
            return false;
        }

        return true;
    }
}
