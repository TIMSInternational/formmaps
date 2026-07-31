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
/// session. Tasks 9-10 add cancel/portal to the same group.
/// </summary>
public static class BillingEndpoints
{
    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/billing").WithTags("Billing");
        group.MapGet("/status", GetStatusAsync);
        group.MapPost("/checkout-session", CreateCheckoutSessionAsync);
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

        var customerId = await gateway.GetOrCreateCustomerAsync(context.Tenant!.UserId, email: null, cancellationToken);
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

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
