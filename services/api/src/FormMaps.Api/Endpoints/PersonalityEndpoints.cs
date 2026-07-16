using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Personality results read endpoints (legacy personalityRouter, mounted /api/v1/personality). Guard
/// order mirrors the legacy middleware chain: authenticate (RequireIdentity) -> requireSubscription ->
/// handler.
///
///  - GET /session/{sessionId}/results : STRICT self-ownership (legacy getResults gates on
///    session.userId === req.userId inside the service). No canAccessUser.
///  - GET /user/{userId}/results       : canAccessUser on the path :userId (legacy getUserResults).
///
/// Every not-found / access-denied branch is the uniform IDOR-safe 404.
/// </summary>
public static class PersonalityEndpoints
{
    public static IEndpointRouteBuilder MapPersonalityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/personality")
            .WithTags("Personality");

        group.MapGet("/access", GetAccessAsync);
        group.MapGet("/session/{sessionId}", GetSessionAsync);
        group.MapGet("/session/{sessionId}/results", GetSessionResultsAsync);
        group.MapGet("/user/{userId}/results", GetUserResultsAsync);

        return app;
    }

    private static async Task<IResult> GetAccessAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalitySessionReader reader,
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

        // Self-scoped: reads the caller's own sessions (legacy checkAccess(req.userId)).
        var sessions = await reader.ReadAccessSessionsAsync(context, context.Tenant!.UserId, cancellationToken);
        var access = PersonalityAccess.Evaluate(sessions);
        return Results.Ok(new { success = true, data = access });
    }

    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalitySessionReader reader,
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

        // Self-ownership inside the reader (id + userId + isActive); foreign/missing -> uniform 404.
        var session = await reader.GetOwnedSessionAsync(context, sessionId, context.Tenant!.UserId, cancellationToken);
        if (session is null)
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = session });
    }

    private static async Task<IResult> GetSessionResultsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalityResultReader reader,
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
        IPersonalityResultReader reader,
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
