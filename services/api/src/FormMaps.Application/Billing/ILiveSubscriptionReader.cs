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
///
/// <para>formmaps#108 adds <see cref="Id"/>. schema.prisma declares <c>@@unique([userId])</c> on
/// user_subscriptions, but NO migration ever created that constraint -- api/prisma/migrations only ever
/// emitted the PK, a NON-unique <c>user_subscriptions_userId_idx</c> and the two FKs -- so production may
/// legitimately hold more than one row per user and the constraint must not be assumed. Exposing the row
/// id makes "which of the user's rows did this read resolve to" answerable by the caller and by tests,
/// instead of being an invisible property of heap order.</para>
/// </remarks>
public sealed record LiveSubscriptionRow(string? Status, bool IsActive, DateTimeOffset? NextBillingDate, string? PlanId, string? StripeSubscriptionId, string Id);

public interface ILiveSubscriptionReader
{
    Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
