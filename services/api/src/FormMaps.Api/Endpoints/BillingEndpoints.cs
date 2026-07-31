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

    private static async Task<IResult> CancelSubscriptionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IStripeGateway gateway,
        ILiveSubscriptionReader reader, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var row = await reader.GetForUserAsync(context, context.Tenant!.UserId, cancellationToken);
        if (row?.StripeSubscriptionId is null)
        {
            return Results.BadRequest(new { success = false, message = "No active subscription" });
        }

        await gateway.CancelSubscriptionAsync(row.StripeSubscriptionId, cancellationToken);
        return Results.Ok(new { success = true, message = "Subscription cancellation requested" });
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
