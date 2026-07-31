using FormMaps.Application.Auth;
using FormMaps.Application.Billing;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 9a subscription REST endpoints (routes/stripe.ts). Flag: FORMMAPS_ROUTE_BILLING_TO_DOTNET
/// (frontend next.config.ts rewrite) — dark by default, same convention as every other domain.
/// This task: GET /status only. Tasks 8-10 add checkout/cancel/portal to the same group.
/// Reads the LIVE user_subscriptions table (read-only — Node still owns writes) via
/// ILiveSubscriptionReader, unlike the shadow-table webhook/reconciliation code in this same domain.
/// </summary>
public static class BillingEndpoints
{
    public static IEndpointRouteBuilder MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/billing").WithTags("Billing");
        group.MapGet("/status", GetStatusAsync);
        return app;
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
