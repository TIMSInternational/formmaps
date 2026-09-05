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
/// <para>formmaps#108: userId scoping alone is NOT a row scope. These UPDATEs used to hit every row the
/// user owned at once; both are now additionally pinned to ONE row, so at most one is ever affected and
/// it is the row the caller's decision was based on -- matching legacy stripe.ts, whose updateMany is
/// scoped by <c>{ id: sub.id, userId }</c>. (Production is BELIEVED to carry the userId unique, so a
/// user owns at most one row there; the scope is defence in depth -- see LiveSubscriptionReader for the
/// provenance note.) Wave 3 billing-subscription-parity review: the row is pinned by the
/// <see cref="LiveSubscriptionRow.Id" /> the endpoint READ, threaded through <c>rowId</c>, not re-resolved
/// by the writer from the reader's predicate -- re-resolving is not "the same row" once a webhook has
/// changed the table between the two transactions (see LiveSubscriptionWriter).</para>
/// </remarks>
public interface ILiveSubscriptionWriter
{
    /// <summary>
    /// Legacy's no-Stripe-subscription branch: <c>status = 'cancelled', isActive = false</c> on the
    /// caller's own cancellable row. <paramref name="rowId" /> is the <see cref="LiveSubscriptionRow.Id" />
    /// the caller read; a row that is no longer cancellable, or is not <paramref name="userId" />'s, is a
    /// 0-row no-op.
    /// </summary>
    Task<int> MarkCancelledAsync(RequestContext context, string userId, string rowId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Legacy's Stripe branch: <c>cancelAtPeriodEnd = true</c> on the caller's own cancellable row. The
    /// customer.subscription.* webhook flips status/isActive when Stripe actually ends it. Same
    /// <paramref name="rowId" /> contract as <see cref="MarkCancelledAsync" />.
    /// </summary>
    Task<int> MarkCancelAtPeriodEndAsync(RequestContext context, string userId, string rowId, CancellationToken cancellationToken = default);
}
