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
        group.MapGet("/exams", GetExamsAsync);
        group.MapGet("/exams/{examId}", GetExamWithQuestionsAsync);
        group.MapGet("/exams/{examId}/instructions", GetInstructionsAsync);
        group.MapGet("/exam-config/{examId}", GetExamConfigAsync);

        return app;
    }

    private static async Task<IResult> GetInstructionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamConfigReader reader,
        string examId,
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

        var instructions = await reader.GetInstructionsAsync(context, examId, cancellationToken);
        if (instructions is null)
        {
            return ExamNotFound();
        }

        return Results.Ok(new { success = true, data = instructions });
    }

    private static async Task<IResult> GetExamConfigAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamConfigReader reader,
        string examId,
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

        var config = await reader.GetConfigAsync(context, examId, cancellationToken);
        if (config is null)
        {
            return ExamNotFound();
        }

        return Results.Ok(new { success = true, data = config });
    }

    // Global catalog: exam existence is not sensitive (listable via /exams), so match the legacy
    // message rather than the ownership-uniform 404.
    private static IResult ExamNotFound()
    {
        return Results.Json(
            new { success = false, message = "Exam not found" },
            statusCode: StatusCodes.Status404NotFound);
    }

    private static async Task<IResult> GetExamsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamCatalogReader reader,
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

        var exams = await reader.ListExamsAsync(context, cancellationToken);
        return Results.Ok(new { success = true, data = exams });
    }

    private static async Task<IResult> GetExamWithQuestionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IExamCatalogReader reader,
        string examId,
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

        var exam = await reader.GetExamWithQuestionsAsync(context, examId, cancellationToken);
        if (exam is null)
        {
            // Global catalog: exam existence is not sensitive (listable via /exams), so match the
            // legacy message rather than the ownership-uniform 404.
            return Results.Json(
                new { success = false, message = "Exam not found" },
                statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data = exam });
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
