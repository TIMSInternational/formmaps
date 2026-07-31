using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing;

/// <summary>
/// Domain 9a Task 7. Reads the LIVE user_subscriptions row for a single user under the caller's own
/// tenant-scoped RLS session (NOT RequestContext.System() -- unlike the shadow-side readers/writers in
/// this namespace, this is a user-facing read of legacy Node-owned data, so it must go through the
/// same RLS identity as any other authenticated .NET read). Read-only: Node still owns all writes to
/// user_subscriptions until cutover.
/// </summary>
public sealed record LiveSubscriptionRow(string? Status, bool IsActive, DateTimeOffset? NextBillingDate, string? PlanId);

public interface ILiveSubscriptionReader
{
    Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
