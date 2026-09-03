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
/// <para>formmaps#108 adds <see cref="Id"/>. Exposing the row id makes "which of the user's rows did
/// this read resolve to" answerable by the caller and by tests, instead of being an invisible property
/// of heap order. (This remark once claimed "NO migration ever created" the <c>@@unique([userId])</c>
/// constraint; that is wrong -- legacy 0_init/migration.sql:2779 creates
/// <c>user_subscriptions_userId_key</c>. See LiveSubscriptionReader for the full provenance note and
/// why the ordering is kept regardless.)</para>
///
/// <para>Wave 3 billing-subscription-parity adds <see cref="CancelAtPeriodEnd"/>: legacy's status payload
/// (api/src/routes/user.ts:327) reports it so the UI can show "Cancels on" instead of "Renews on", and
/// the row is only ever resolved with legacy's <c>isActive: true</c> predicate -- see the reader.</para>
/// </remarks>
public sealed record LiveSubscriptionRow(string? Status, bool IsActive, DateTimeOffset? NextBillingDate, string? PlanId, string? StripeSubscriptionId, string Id, bool CancelAtPeriodEnd);

public interface ILiveSubscriptionReader
{
    Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
