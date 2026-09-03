using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 9a subscription REST endpoints (routes/stripe.ts). Flag: FORMMAPS_ROUTE_BILLING_TO_DOTNET
/// (frontend next.config.ts rewrite) — dark by default, same convention as every other domain.
/// GET /status (Task 7; legacy twin is routes/user.ts GET /api/v1/user/subscription/status, NOT a
/// stripe.ts route, and is also served at that exact path -- see MapBillingEndpoints) reads the LIVE
/// users."schoolId" via ILiveSchoolAffiliationReader and then the LIVE
/// user_subscriptions table (read-only — Node still owns writes) via ILiveSubscriptionReader, unlike the
/// shadow-table webhook/reconciliation code in this same domain.
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
        // Shared handler references, bound to BOTH path spellings below (issue #98). Held in locals and
        // reused rather than repeating the method group per group, so the aliases are the same delegate
        // instance and cannot drift: there is exactly one implementation of each behaviour, and no way to
        // "fix" one path without fixing the other.
        var getStatus = GetStatusAsync;
        var cancelSubscription = CancelSubscriptionAsync;
        var billingPortal = CreateBillingPortalAsync;

        var group = app.MapGroup("/api/v1/billing").WithTags("Billing");
        group.MapGet("/status", getStatus);
        group.MapPost("/checkout-session", CreateCheckoutSessionAsync);
        group.MapPost("/cancel-subscription", cancelSubscription);
        group.MapPost("/portal", billingPortal);

        // Legacy-path aliases (issue #98). The /api/v1/billing surface above was unreachable dead code:
        // apps/web has never called it -- subscriptionStatusService.ts posts to
        // /api/stripe/cancel-subscription and subscriptionService.ts posts to /api/stripe/billing-portal
        // (grep "v1/billing" over apps/web/src returns nothing), so flipping
        // FORMMAPS_ROUTE_BILLING_TO_DOTNET moved zero traffic. .NET therefore ADOPTS the legacy paths
        // rather than the frontend being rewritten or next.config.ts inventing a remapping rewrite --
        // all 189 existing rewrite pairs in that file are source==destination, so a remapping rule would
        // be a novel shape with no precedent here.
        //
        // Deliberately per-path, NOT an /api/stripe prefix group: Node still exclusively owns
        // /api/stripe/config, /api/stripe/status/:sessionId, /api/stripe/user/:userId and
        // /api/stripe/create-checkout-session, none of which have a .NET twin. Only the two paths whose
        // behaviour is ported and verified are listed. Note the portal's legacy spelling is
        // "billing-portal", not "portal".
        var legacy = app.MapGroup("/api/stripe").WithTags("Billing");
        legacy.MapPost("/cancel-subscription", cancelSubscription);
        legacy.MapPost("/billing-portal", billingPortal);

        // Wave 3 billing-subscription-parity review: GET /status had the same #98 problem and was not
        // covered by the #98 fix, because its legacy twin is NOT under /api/stripe -- it is
        // routes/user.ts GET /subscription/status, mounted at /api/v1/user (legacy index.ts:324), and
        // that is the path subscriptionStatusService.ts requests. Without this alias the legacy-shaped
        // payload above was reachable only by tests: on a flip the SPA's status call kept going to Node
        // via the /api/:path* catch-all. Same treatment as the /api/stripe pair -- one delegate, per-path
        // (Node owns every other /api/v1/user route), and the matching flag-guarded source==destination
        // rewrite in next.config.ts.
        var legacyUser = app.MapGroup("/api/v1/user").WithTags("Billing");
        legacyUser.MapGet("/subscription/status", getStatus);

        return app;
    }

    public sealed record CreateCheckoutSessionRequest(string? PlanId);

    private static async Task<IResult> CreateCheckoutSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        IPlanReader planReader, CreateCheckoutSessionRequest? body,
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
        // issue #98: this used to read configuration["NEXT_PUBLIC_APP_URL"], which is not among
        // formmaps-api-prod's env keys (ASPNETCORE_ENVIRONMENT, ASPNETCORE_URLS, CORS_ORIGINS,
        // FRONTEND_BASE_URL, LegacyJwt__Audience, LegacyJwt__Issuer -- verified via apprunner
        // describe-service), so it always fell through to a hard-coded literal and the env var was
        // decorative. FRONTEND_BASE_URL is the variable that IS set (to https://app.formmaps.com), and
        // FrontendUrl is this codebase's single reader for it. Behaviour in production is unchanged --
        // both resolve to https://app.formmaps.com -- but the value is now actually configurable, and
        // dev/test correctly get http://localhost:3000 instead of pointing at production.
        var appUrl = FrontendUrl.BaseUrl();
        var url = await gateway.CreateCheckoutSessionAsync(
            customerId, plan.StripePriceId, context.Tenant.UserId, body.PlanId,
            successUrl: $"{appUrl}/dashboard?checkout=success", cancelUrl: $"{appUrl}/dashboard?checkout=cancelled",
            cancellationToken);

        return Results.Ok(new { success = true, data = new { url } });
    }

    /// <remarks>
    /// Wave 3 billing-subscription-parity (formmaps#108 comment). Legacy twin is
    /// GET /api/v1/user/subscription/status, api/src/routes/user.ts:302-334, and this now matches it in
    /// three places it used to diverge:
    /// <list type="bullet">
    /// <item>the school short-circuit (user.ts:304-311): any user whose users row carries a schoolId is
    /// answered <c>{ hasActiveSubscription:true, planId:"school", status:"active", expiryDate:null,
    /// isSchoolStudent:true }</c> before user_subscriptions is read at all. Legacy checks the schoolId only,
    /// never the role, and reads it live -- so does this.</item>
    /// <item>the row predicate: legacy's findFirst carries <c>isActive: true</c>; the reader now does too
    /// (see LiveSubscriptionReader), so an inactive row is "no subscription", status "none".</item>
    /// <item>the field names: <c>hasActiveSubscription</c> / <c>expiryDate</c> / <c>cancelAtPeriodEnd</c>,
    /// not the <c>grantsAccess</c> / <c>nextBillingDate</c> this handler used to invent. apps/web's
    /// subscriptionStatusService.ts (and everything on it: dashboard/subscriptions, subscribe, AuthWrapper)
    /// reads the legacy names from Node today, and nothing in apps/web ever read the invented ones, so
    /// the legacy shape is the one a flip is invisible under -- given the legacy PATH alias in
    /// MapBillingEndpoints, without which no SPA traffic reaches this handler on a flip at all.</item>
    /// </list>
    /// The two branches have DIFFERENT key sets, deliberately: legacy's school response has no
    /// cancelAtPeriodEnd and its individual response has no isSchoolStudent. planId is null unless access
    /// is granted (<c>hasAccess ? sub?.planId || null : null</c> -- the <c>||</c> also coerces an
    /// empty-string planId to null, hence IsNullOrEmpty rather than a bare null check), and status falls
    /// back to "none".
    /// </remarks>
    private static async Task<IResult> GetStatusAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ILiveSubscriptionReader reader,
        ILiveSchoolAffiliationReader schoolReader, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var userId = context.Tenant!.UserId;
        var schoolId = await schoolReader.GetSchoolIdAsync(context, userId, cancellationToken);
        if (!string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new
            {
                success = true,
                data = new { hasActiveSubscription = true, planId = "school", status = "active", expiryDate = (DateTimeOffset?)null, isSchoolStudent = true },
            });
        }

        var row = await reader.GetForUserAsync(context, userId, cancellationToken);
        var hasAccess = row is not null && SubscriptionAccess.GrantsAccess(
            row.Status, row.IsActive, row.NextBillingDate, timeProvider.GetUtcNow(), SubscriptionAccess.DefaultGraceDays);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                hasActiveSubscription = hasAccess,
                planId = hasAccess && !string.IsNullOrEmpty(row?.PlanId) ? row.PlanId : null,
                status = string.IsNullOrEmpty(row?.Status) ? "none" : row.Status,
                expiryDate = row?.NextBillingDate,
                cancelAtPeriodEnd = row?.CancelAtPeriodEnd ?? false,
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
                await writer.MarkCancelAtPeriodEndAsync(context, userId, row.Id, cancellationToken);
                return Results.Ok(new { success = true, message = "Subscription will cancel at the end of the current period" });
            }

            // AlreadyGone: nothing left to schedule, so end the local grant now rather than 500.
        }

        // No Stripe subscription to cancel (or Stripe has already lost it) -- cancel the local row
        // outright, exactly as legacy does. Both writes are pinned to row.Id, the row this handler's
        // cancellable decision was made on (legacy's `{ id: sub.id, userId }` scope). Rowcount is
        // deliberately ignored: 0 means a concurrent writer already cancelled it, which is the same
        // outcome the caller asked for.
        await writer.MarkCancelledAsync(context, userId, row.Id, cancellationToken);
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
        ILiveCustomerReader customerReader, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var customerId = await customerReader.GetStripeCustomerIdAsync(context, context.Tenant!.UserId, cancellationToken);
        if (string.IsNullOrWhiteSpace(customerId))
        {
            return Results.Json(new { success = false, message = "No billing account found" }, statusCode: StatusCodes.Status404NotFound);
        }

        // issue #98, same NEXT_PUBLIC_APP_URL-is-never-set bug as CreateCheckoutSessionAsync above; see
        // that comment. The return path also now matches legacy stripe.ts:387, which sends the user back
        // to /dashboard/subscriptions after Stripe's portal, not /dashboard/settings -- a one-line
        // difference that would otherwise have dropped users on a different page than Node does.
        var url = await gateway.CreateBillingPortalSessionAsync(
            customerId, returnUrl: FrontendUrl.Build("/dashboard/subscriptions"), cancellationToken);

        return Results.Ok(new { success = true, data = new { url } });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
