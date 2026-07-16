using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// MIL synthesized-results read endpoint (legacy milRouter, mounted /api/v1/mil). Guard order mirrors
/// the legacy middleware chain: authenticate (RequireIdentity) -> requireSubscription -> handler
/// (canAccessUser on the path :userId). Access denial is the uniform IDOR-safe 404; a user with no
/// assessment data still gets a 200 (the synthesis returns zeros, never 404s).
/// </summary>
public static class MilEndpoints
{
    public static IEndpointRouteBuilder MapMilEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/mil")
            .WithTags("Mil");

        group.MapGet("/results/{userId}", GetResultsAsync);

        return app;
    }

    private static async Task<IResult> GetResultsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IMilResultReader reader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var subscription = await subscriptionGuard.RequireSubscriptionAsync(context, cancellationToken);
        if (!subscription.Allowed)
        {
            return Deny(subscription);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var data = await reader.ReadResultsAsync(context, userId, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    private static IResult Deny(GuardDecision decision)
    {
        return Results.Json(
            new
            {
                success = false,
                code = decision.Code,
                message = decision.Message
            },
            statusCode: decision.StatusCode);
    }

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found", never 403.
    private static IResult NotFound()
    {
        return Results.Json(
            new
            {
                success = false,
                message = "Not found"
            },
            statusCode: StatusCodes.Status404NotFound);
    }
}
