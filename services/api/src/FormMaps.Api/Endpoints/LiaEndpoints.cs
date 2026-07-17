using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// LIA cognitive-results read endpoints (legacy liaRouter, mounted /api/v1/lia). Guard order mirrors
/// the legacy middleware chain: authenticate (RequireIdentity) -> requireSubscription -> handler.
///
///  - GET /session/{sessionId}/results : STRICT self-ownership — the reader gates on the CALLER's id
///    (legacy getResults compares session.userId === req.userId). No canAccessUser; a privileged role
///    cannot reach a foreign session here.
///  - GET /user/{userId}/results       : canAccessUser on the path :userId (legacy getUserResults).
///
/// Every not-found / access-denied branch is the uniform IDOR-safe 404.
/// </summary>
public static class LiaEndpoints
{
    public static IEndpointRouteBuilder MapLiaEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/lia")
            .WithTags("Lia");

        group.MapGet("/session/{sessionId}/results", GetSessionResultsAsync);
        group.MapGet("/user/{userId}/results", GetUserResultsAsync);
        group.MapPost("/session/{sessionId}/complete", CompleteSessionAsync);

        return app;
    }

    // POST /session/{sessionId}/complete (legacy completeSession) — the first authored write. STRICT
    // self-ownership (no canAccessUser); idempotent + coverage-gated in the writer.
    private static async Task<IResult> CompleteSessionAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
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

        var outcome = await writer.CompleteAsync(context, sessionId, context.Tenant!.UserId, cancellationToken);
        return outcome.Status switch
        {
            LiaCompleteStatus.Completed => Results.Ok(new { success = true, data = outcome.Result }),
            LiaCompleteStatus.IncompleteCoverage => Error(StatusCodes.Status409Conflict, "Assessment not complete"),
            LiaCompleteStatus.NotInProgress => Error(StatusCodes.Status400BadRequest, "Assessment not complete"),
            _ => NotFound(),
        };
    }

    private static IResult Error(int statusCode, string message) =>
        Results.Json(new { success = false, message }, statusCode: statusCode);

    private static async Task<IResult> GetSessionResultsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaResultReader reader,
        string sessionId,
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

        // Self-ownership: the reader requires session.userId == the caller's id.
        var results = await reader.ReadBySessionAsync(context, sessionId, context.Tenant!.UserId, cancellationToken);
        if (results is null)
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = results });
    }

    private static async Task<IResult> GetUserResultsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        ILiaResultReader reader,
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

        var results = await reader.ReadNewestForUserAsync(context, userId, cancellationToken);
        if (results is null)
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = results });
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
