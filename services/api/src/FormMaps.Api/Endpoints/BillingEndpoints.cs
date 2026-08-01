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
/// ILiveSubscriptionReader and calls IStripeGateway.CancelSubscriptionAsync. Task 10 adds the billing
/// portal to the same group.
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
    /// Domain 9a final-review fix wave (Critical 1 / Important 10). Two changes here:
    /// (a) the live row is now filtered by legacy's own cancellable-status set before the gateway is
    /// called, so an already-cancelled/incomplete subscription no longer gets re-sent to Stripe (which
    /// answers with an error the endpoint would surface as a 500); (b) the "nothing to cancel" response
    /// is 404, matching legacy's `res.status(404) "No active subscription found"`, not the 400 this
    /// endpoint previously returned.
    ///
    /// A row that passes the status filter but carries no <c>stripeSubscriptionId</c> falls into the same
    /// 404 branch. Legacy handles that case by flipping the live row to cancelled directly in the DB;
    /// .NET cannot, because live tables are read-only from this service until cutover (see this plan's
    /// Global Constraints), and returning success without doing anything would be a lie. Deferred to
    /// cutover, when the write path unlocks.
    /// </remarks>
    private static async Task<IResult> CancelSubscriptionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        ILiveSubscriptionReader reader, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var row = await reader.GetForUserAsync(context, context.Tenant!.UserId, cancellationToken);
        var cancellable = row is { IsActive: true, Status: not null, StripeSubscriptionId: not null }
            && CancellableStatuses.Contains(row.Status);
        if (!cancellable)
        {
            return Results.Json(new { success = false, message = "No active subscription found" }, statusCode: StatusCodes.Status404NotFound);
        }

        await gateway.CancelSubscriptionAsync(row!.StripeSubscriptionId!, cancellationToken);
        return Results.Ok(new { success = true, message = "Subscription will cancel at the end of the current period" });
    }

    private static async Task<IResult> CreateBillingPortalAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        IConfiguration configuration, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var customerId = await gateway.GetOrCreateCustomerAsync(context, context.Tenant!.UserId, email: null, cancellationToken);
        var appUrl = configuration["NEXT_PUBLIC_APP_URL"] ?? "https://app.formmaps.com";
        var url = await gateway.CreateBillingPortalSessionAsync(customerId, returnUrl: $"{appUrl}/dashboard/settings", cancellationToken);

        return Results.Ok(new { success = true, data = new { url } });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
