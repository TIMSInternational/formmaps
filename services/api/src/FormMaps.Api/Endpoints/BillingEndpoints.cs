using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using Microsoft.Extensions.Configuration;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 9a subscription REST endpoints (routes/stripe.ts). Flag: FORMMAPS_ROUTE_BILLING_TO_DOTNET
/// (frontend next.config.ts rewrite) — dark by default, same convention as every other domain.
/// GET /status (Task 7) reads the LIVE user_subscriptions table (read-only — Node still owns writes) via
/// ILiveSubscriptionReader, unlike the shadow-table webhook/reconciliation code in this same domain.
/// POST /checkout-session (Task 8) validates planId against subscription_plans via IPlanReader, then
/// calls IStripeGateway to create/reuse a Stripe customer and start a subscription-mode Checkout
/// session. POST /cancel-subscription (Task 9) reads the live row's stripeSubscriptionId via
/// ILiveSubscriptionReader and calls IStripeGateway.CancelSubscriptionAsync; as of formmaps#30 it also
/// WRITES the live row via ILiveSubscriptionWriter (the one exception to this domain's otherwise
/// read-only treatment of user_subscriptions -- see that interface). POST /portal (Task 10)
/// reads the live users."stripeCustomerId" via ILiveCustomerReader.
///
/// Response-code convention (aligned across the group in the Domain 9a final-review fix wave, Important
/// 10): "the resource you are acting on does not exist" is 404 with a message, matching legacy
/// stripe.ts — "No active subscription found" for cancel, "No billing account found" for portal. 400 is
/// reserved for a malformed/unknown REQUEST (missing or unrecognised planId on checkout-session).
/// </summary>
public static class BillingEndpoints
{
    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/billing").WithTags("Billing");
        group.MapGet("/status", GetStatusAsync);
        group.MapPost("/checkout-session", CreateCheckoutSessionAsync);
        group.MapPost("/cancel-subscription", CancelSubscriptionAsync);
        group.MapPost("/portal", CreateBillingPortalAsync);
        return app;
    }

    public sealed record CreateCheckoutSessionRequest(string? PlanId);

    private static async Task<IResult> CreateCheckoutSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        IPlanReader planReader, CreateCheckoutSessionRequest? body, IConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (string.IsNullOrWhiteSpace(body?.PlanId))
        {
            return Results.BadRequest(new { success = false, message = "planId is required" });
        }

        var plan = await planReader.GetActiveByIdAsync(body.PlanId, cancellationToken);
        if (plan is null || string.IsNullOrWhiteSpace(plan.StripePriceId))
        {
            return Results.BadRequest(new { success = false, message = "Unknown plan" });
        }

        var customerId = await gateway.GetOrCreateCustomerAsync(context, context.Tenant!.UserId, email: null, cancellationToken);
        var appUrl = configuration["NEXT_PUBLIC_APP_URL"] ?? "https://app.formmaps.com";
        var url = await gateway.CreateCheckoutSessionAsync(
            customerId, plan.StripePriceId, context.Tenant.UserId, body.PlanId,
            successUrl: $"{appUrl}/dashboard?checkout=success", cancelUrl: $"{appUrl}/dashboard?checkout=cancelled",
            cancellationToken);

        return Results.Ok(new { success = true, data = new { url } });
    }

    private static async Task<IResult> GetStatusAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ILiveSubscriptionReader reader,
        TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var row = await reader.GetForUserAsync(context, context.Tenant!.UserId, cancellationToken);
        var grantsAccess = row is not null && SubscriptionAccess.GrantsAccess(
            row.Status, row.IsActive, row.NextBillingDate, timeProvider.GetUtcNow(), SubscriptionAccess.DefaultGraceDays);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                grantsAccess,
                status = row?.Status,
                planId = row?.PlanId,
                nextBillingDate = row?.NextBillingDate,
            },
        });
    }

    /// <summary>
    /// Statuses legacy stripe.ts treats as cancellable — <c>status: { in: ["active","trialing","past_due"] }</c>
    /// combined with <c>isActive: true</c> in its userSubscription.findFirst filter.
    /// </summary>
    private static readonly HashSet<string> CancellableStatuses =
        new(StringComparer.Ordinal) { "active", "trialing", "past_due" };

    /// <remarks>
    /// Domain 9a final-review fix wave (Critical 1 / Important 10) established the cancellable-status
    /// filter and the 404-not-400 shape. formmaps#30 then fixed what that wave deferred: a row that
    /// passes the status filter but carries NO <c>stripeSubscriptionId</c> used to fall into the same 404
    /// branch, because live tables were read-only from this service and "success" without a write would
    /// have been a lie. That constraint is lifted for this one table (see
    /// <see cref="ILiveSubscriptionWriter" />): the row is now cancelled locally, no Stripe call is made,
    /// and the response is legacy's own 200 "Subscription cancelled".
    ///
    /// Full contract, identical on both sides of the flag (legacy api/src/routes/stripe.ts is the twin):
    /// <list type="bullet">
    /// <item>no cancellable row (absent / isActive false / status outside the set, which covers an
    /// already-cancelled subscription) -> 404 <c>{ success:false, message:"No active subscription found" }</c></item>
    /// <item>cancellable WITH a Stripe id -> cancel_at_period_end at Stripe + <c>cancelAtPeriodEnd = true</c>
    /// locally -> 200 <c>{ success:true, message:"Subscription will cancel at the end of the current period" }</c></item>
    /// <item>cancellable WITHOUT a Stripe id -> no Stripe call at all + <c>status='cancelled', isActive=false</c>
    /// locally -> 200 <c>{ success:true, message:"Subscription cancelled" }</c></item>
    /// <item>cancellable WITH a Stripe id that Stripe no longer has -> same as the previous case (200
    /// "Subscription cancelled"), never a 500</item>
    /// </list>
    ///
    /// Why cancelling locally is right rather than 404: a row active locally with no Stripe subscription
    /// is a real state (comped/manual grant, a pre-Stripe legacy row, a direct DB insert). Nothing exists
    /// at Stripe to stop, so the only truthful action is to stop the local entitlement -- 404 leaves the
    /// user holding an entitlement they have no way to revoke. The 2026-08-02 preflight
    /// (infra/aws/sql/preflight-checks.sql section 6) found 0 such rows in production and no code path that
    /// creates one, so this is a reachable-but-unpopulated shape, not a data bug to reject.
    /// </remarks>
    private static async Task<IResult> CancelSubscriptionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        ILiveSubscriptionReader reader, ILiveSubscriptionWriter writer, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var userId = context.Tenant!.UserId;
        var row = await reader.GetForUserAsync(context, userId, cancellationToken);
        var cancellable = row is { IsActive: true, Status: not null } && CancellableStatuses.Contains(row.Status);
        if (!cancellable)
        {
            return Results.Json(new { success = false, message = "No active subscription found" }, statusCode: StatusCodes.Status404NotFound);
        }

        if (!string.IsNullOrWhiteSpace(row!.StripeSubscriptionId))
        {
            var outcome = await gateway.CancelSubscriptionAsync(row.StripeSubscriptionId, cancellationToken);
            if (outcome == StripeCancelOutcome.Scheduled)
            {
                await writer.MarkCancelAtPeriodEndAsync(context, userId, cancellationToken);
                return Results.Ok(new { success = true, message = "Subscription will cancel at the end of the current period" });
            }

            // AlreadyGone: nothing left to schedule, so end the local grant now rather than 500.
        }

        // No Stripe subscription to cancel (or Stripe has already lost it) -- cancel the local row
        // outright, exactly as legacy does. Rowcount is deliberately ignored: 0 means a concurrent writer
        // already cancelled it, which is the same outcome the caller asked for.
        await writer.MarkCancelledAsync(context, userId, cancellationToken);
        return Results.Ok(new { success = true, message = "Subscription cancelled" });
    }

    /// <remarks>
    /// Domain 9a final-review fix wave (Important 7 / Important 10). This used to call
    /// <c>IStripeGateway.GetOrCreateCustomerAsync</c>, whose create branch runs whenever the user has no
    /// Stripe customer on file — so merely VISITING the billing portal minted a brand-new Stripe customer.
    /// Combined with the documented read-only-live-tables constraint (a newly created customer id cannot be
    /// persisted back to <c>users."stripeCustomerId"</c> until cutover), every such visit orphaned a real
    /// Stripe customer that nothing could ever find again. Legacy stripe.ts does not create here at all: it
    /// reads <c>user.stripeCustomerId</c> and returns 404 "No billing account found" when it is missing.
    /// This now uses the read-only <see cref="ILiveCustomerReader" /> and does the same.
    /// </remarks>
    private static async Task<IResult> CreateBillingPortalAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        ILiveCustomerReader customerReader, IConfiguration configuration, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var customerId = await customerReader.GetStripeCustomerIdAsync(context, context.Tenant!.UserId, cancellationToken);
        if (string.IsNullOrWhiteSpace(customerId))
        {
            return Results.Json(new { success = false, message = "No billing account found" }, statusCode: StatusCodes.Status404NotFound);
        }

        var appUrl = configuration["NEXT_PUBLIC_APP_URL"] ?? "https://app.formmaps.com";
        var url = await gateway.CreateBillingPortalSessionAsync(customerId, returnUrl: $"{appUrl}/dashboard/settings", cancellationToken);

        return Results.Ok(new { success = true, data = new { url } });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
