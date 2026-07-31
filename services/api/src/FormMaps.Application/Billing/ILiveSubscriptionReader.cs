using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing;

/// <summary>
/// Domain 9a Task 7. Reads the LIVE user_subscriptions row for a single user under the caller's own
/// tenant-scoped RLS session (NOT RequestContext.System() -- unlike the shadow-side readers/writers in
/// this namespace, this is a user-facing read of legacy Node-owned data, so it must go through the
/// same RLS identity as any other authenticated .NET read). Read-only: Node still owns all writes to
/// user_subscriptions until cutover.
/// </summary>
/// <remarks>
/// Domain 9a Task 9 adds <see cref="StripeSubscriptionId"/>: Task 7 didn't need it for GET /status, but
/// POST /cancel-subscription must pass the live Stripe subscription id (not the internal <see
/// cref="PlanId"/>) to <c>IStripeGateway.CancelSubscriptionAsync</c>.
/// </remarks>
public sealed record LiveSubscriptionRow(string? Status, bool IsActive, DateTimeOffset? NextBillingDate, string? PlanId, string? StripeSubscriptionId);

public interface ILiveSubscriptionReader
{
    Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
