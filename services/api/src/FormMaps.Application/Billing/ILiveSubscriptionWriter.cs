using FormMaps.Application.Auth;

namespace FormMaps.Application.Billing;

/// <summary>
/// formmaps#30. The write half of <see cref="ILiveSubscriptionReader" />: the two UPDATEs legacy
/// stripe.ts's POST /cancel-subscription performs on the LIVE user_subscriptions row, so the .NET twin
/// can produce the same observable result instead of 404-ing on a row it could read but not change.
///
/// <para>This deliberately supersedes Domain 9a's plan-local "live tables are read-only from .NET"
/// constraint for this one table and these two column sets. That constraint was never a codebase-wide
/// rule -- CalendarWriter, LiaSessionWriter, SchoolProfileWriter and ~25 other Infrastructure writers
/// already write Node-owned live tables under the caller's own RLS session. Keeping it here bought
/// nothing except the 404 in formmaps#30, because cancelling a subscription that has no Stripe
/// counterpart has no side effect ANYWHERE except this row: refusing to write it means the user cannot
/// revoke their own entitlement at all. The corresponding GRANT lives in
/// infra/aws/sql/dotnet-service-role.sql (user_subscriptions moved from the SELECT-only tier to
/// SELECT + UPDATE) and MUST be re-applied before FORMMAPS_ROUTE_BILLING_TO_DOTNET is flipped, or every
/// cancel fails with 42501.</para>
/// </summary>
/// <remarks>
/// Both methods carry legacy's cancellable predicate in their own WHERE clause -- they never trust the
/// caller-visible row the endpoint just read. Both are also scoped by an explicit <c>"userId" = @userId</c>
/// rather than relying on RLS: the tenant_isolation policy on user_subscriptions also admits any user in
/// the SAME SCHOOL as the row's owner (api/prisma/rls/003-fk-users.sql), so RLS alone would let a school
/// admin cancel a student's subscription. Rowcount is returned for observability; the endpoint treats 0
/// as "someone else got there first", which is the idempotent outcome, not an error.
///
/// <para>formmaps#108: userId scoping alone is NOT a row scope. The <c>@@unique([userId])</c> in
/// schema.prisma was never emitted by a migration, so a user may own several user_subscriptions rows in
/// production and these UPDATEs used to hit all of them at once. Both are now additionally pinned to the
/// single row <see cref="ILiveSubscriptionReader" /> resolves (newest by createdDate, id as tie-break),
/// so at most ONE row is ever affected and it is the row the caller's decision was based on -- matching
/// legacy stripe.ts, whose updateMany is scoped by <c>{ id: sub.id, userId }</c>.</para>
/// </remarks>
public interface ILiveSubscriptionWriter
{
    /// <summary>
    /// Legacy's no-Stripe-subscription branch: <c>status = 'cancelled', isActive = false</c> on the
    /// caller's own cancellable row.
    /// </summary>
    Task<int> MarkCancelledAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Legacy's Stripe branch: <c>cancelAtPeriodEnd = true</c> on the caller's own cancellable row. The
    /// customer.subscription.* webhook flips status/isActive when Stripe actually ends it.
    /// </summary>
    Task<int> MarkCancelAtPeriodEndAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
