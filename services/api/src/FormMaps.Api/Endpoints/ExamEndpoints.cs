using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// PCA exam-engine read endpoints (legacy examRouter, mounted /api/pcaexam). Guard order mirrors
/// the legacy middleware chain: authenticate (RequireIdentity) -> requireSubscription -> handler
/// (canAccessUser ownership). Denials are the uniform IDOR-safe 404.
/// </summary>
public static class ExamEndpoints
{
    public static IEndpointRouteBuilder MapExamEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pcaexam")
            .WithTags("PcaExam");

        group.MapGet("/session/{sessionId}", GetSessionAsync);
        group.MapGet("/completed-exams/{userId}", GetCompletedExamsAsync);

        return app;
    }

    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamSessionReader reader,
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

        var session = await reader.GetSessionAsync(context, sessionId, cancellationToken);
        if (session is null)
        {
            return NotFound();
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, session.UserId, cancellationToken))
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = session });
    }

    private static async Task<IResult> GetCompletedExamsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IUserAccessGuard userAccessGuard,
        IExamSessionReader reader,
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

        var data = await reader.GetCompletedExamsAsync(context, userId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                sessions = data.Sessions,
                uniqueCompleted = data.UniqueCompleted,
                count = data.Count
            }
        });
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
