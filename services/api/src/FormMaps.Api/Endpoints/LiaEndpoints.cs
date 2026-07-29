using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
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
        group.MapGet("/access", GetAccessAsync);
        group.MapPost("/start", StartAsync);
        group.MapGet("/session/{sessionId}", GetSessionAsync);
        group.MapGet("/session/{sessionId}/practice", GetPracticeQuestionsAsync);
        group.MapPost("/session/{sessionId}/practice/answer", SubmitPracticeAnswerAsync);
        group.MapPost("/session/{sessionId}/subtest/start", StartSubtestAsync);
        group.MapPost("/session/{sessionId}/answer", SubmitAnswerAsync);
        group.MapPost("/session/{sessionId}/timeout", HandleTimeoutAsync);
        group.MapPost("/session/{sessionId}/violations", SaveViolationsAsync);
        group.MapPost("/session/{sessionId}/complete", CompleteSessionAsync);

        return app;
    }

    // GET /access (legacy checkAccess)
    private static async Task<IResult> GetAccessAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionReader reader,
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

        var access = await reader.GetAccessAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = access });
    }

    // POST /start (legacy startSession)
    private static async Task<IResult> StartAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        StartRequest? body,
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

        var language = body?.Language == "en" ? "en" : "es";
        var outcome = await writer.StartAsync(context, context.Tenant!.UserId, language, cancellationToken);
        return outcome.Status switch
        {
            LiaStartStatus.Started => Results.Ok(new { success = true, data = outcome.Payload }),
            LiaStartStatus.Locked => Error(
                StatusCodes.Status409Conflict,
                "session_locked",
                "Assessment locked after too many exits — ask your school administrator to unlock it"),
            _ => Error(StatusCodes.Status409Conflict, null, "Assessment already completed"), // AlreadyCompleted
        };
    }

    // GET /session/{sessionId} (legacy getSession)
    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionReader reader,
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

        var detail = await reader.GetSessionAsync(context, sessionId, context.Tenant!.UserId, cancellationToken);
        if (detail is null)
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = detail });
    }

    // GET /session/{sessionId}/practice (legacy getSession's embedded practice-questions fetch)
    private static async Task<IResult> GetPracticeQuestionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionReader reader,
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

        var questions = await reader.GetPracticeQuestionsAsync(context, sessionId, context.Tenant!.UserId, cancellationToken);
        if (questions is null)
        {
            return NotFound();
        }

        return Results.Ok(new { success = true, data = questions });
    }

    // POST /session/{sessionId}/practice/answer (legacy submitPracticeAnswer)
    private static async Task<IResult> SubmitPracticeAnswerAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
        SubmitPracticeAnswerRequest? body,
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

        var questionId = body?.QuestionId;
        var rawAnswer = body?.Answer;
        if (string.IsNullOrEmpty(questionId) || string.IsNullOrEmpty(rawAnswer))
        {
            return Error(StatusCodes.Status400BadRequest, "question_id and answer are required");
        }

        var answer = Truncate(rawAnswer, 20);
        var outcome = await writer.SubmitPracticeAnswerAsync(
            context, sessionId, context.Tenant!.UserId, questionId, answer, cancellationToken);
        return outcome.Status switch
        {
            LiaPracticeAnswerStatus.Ok => Results.Ok(new { success = true, data = outcome.Result }),
            LiaPracticeAnswerStatus.NotInPractice => Error(StatusCodes.Status400BadRequest, "not_in_practice"),
            // NotFound and QuestionNotFound both map to the same uniform IDOR-safe 404 (legacy handleError).
            _ => NotFound(),
        };
    }

    // POST /session/{sessionId}/answer (legacy submitAnswer)
    private static async Task<IResult> SubmitAnswerAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
        SubmitAnswerRequest? body,
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

        var questionId = body?.QuestionId;
        if (string.IsNullOrEmpty(questionId))
        {
            return Error(StatusCodes.Status400BadRequest, "question_id is required");
        }

        // answer is optional (undefined/null = a skipped item); truncated to 20 chars only when present.
        var answer = body?.Answer is { } rawAnswer ? Truncate(rawAnswer, 20) : null;
        var timeSpentMs = ParseTimeSpentMs(body?.TimeSpentMs);

        var outcome = await writer.SubmitAnswerAsync(
            context, sessionId, context.Tenant!.UserId, questionId, answer, timeSpentMs, cancellationToken);
        return outcome.Status switch
        {
            LiaSubmitAnswerStatus.Ok => Results.Ok(new { success = true, data = outcome.Result }),
            LiaSubmitAnswerStatus.NotInProgress => Error(StatusCodes.Status400BadRequest, "not_in_progress"),
            // NotFound and QuestionNotFound both map to the same uniform IDOR-safe 404 (legacy handleError).
            _ => NotFound(),
        };
    }

    // POST /session/{sessionId}/subtest/start (legacy startSubtest)
    private static async Task<IResult> StartSubtestAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
        SubtestStartRequest? body,
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

        // body is nullable so a missing/malformed JSON body doesn't short-circuit ASP.NET's own
        // model-binding BEFORE the guards above run — Contains(null) is safe (just false), matching
        // legacy's SUBTEST_ORDER.includes(undefined) -> false -> the same "Invalid subtest" 400.
        if (!LiaSubtestOrder.Order.Contains(body?.Subtest))
        {
            return Error(StatusCodes.Status400BadRequest, "Invalid subtest");
        }

        var outcome = await writer.StartSubtestAsync(context, sessionId, context.Tenant!.UserId, body!.Subtest, cancellationToken);
        return outcome.Status switch
        {
            LiaSubtestStartStatus.Started => Results.Ok(new { success = true, data = outcome.Result }),
            LiaSubtestStartStatus.PracticeIncomplete => Error(StatusCodes.Status400BadRequest, "practice_incomplete"),
            LiaSubtestStartStatus.AlreadyStarted => Error(
                StatusCodes.Status409Conflict, "subtest_already_started", "Subtest already started"),
            _ => NotFound(),
        };
    }

    // POST /session/{sessionId}/timeout (legacy handleTimeout). The unanswered set is ALWAYS derived
    // server-side from the DB by the underlying ApplyTimeoutAsync machinery — legacy's client-supplied
    // unanswered_question_ids is intentionally never threaded through here.
    private static async Task<IResult> HandleTimeoutAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
        TimeoutRequest? body,
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

        // body is nullable so a missing/malformed JSON body doesn't short-circuit ASP.NET's own
        // model-binding BEFORE the guards above run — Contains(null) is safe (just false), matching
        // legacy's SUBTEST_ORDER.includes(undefined) -> false -> the same "Invalid subtest" 400.
        if (!LiaSubtestOrder.Order.Contains(body?.Subtest))
        {
            return Error(StatusCodes.Status400BadRequest, "Invalid subtest");
        }

        var outcome = await writer.HandleTimeoutAsync(context, sessionId, context.Tenant!.UserId, body!.Subtest, cancellationToken);
        return outcome.Status switch
        {
            LiaSubmitAnswerStatus.Ok => Results.Ok(new { success = true, data = outcome.Result }),
            LiaSubmitAnswerStatus.NotInProgress => Error(StatusCodes.Status400BadRequest, "not_in_progress"),
            _ => NotFound(),
        };
    }

    // POST /session/{sessionId}/violations (legacy saveViolations). Bounding/normalization happens HERE at
    // the route layer (not inside the writer), via the shared ProctoringViolations port also used by the
    // vocational-evaluator violations endpoint.
    private static async Task<IResult> SaveViolationsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        ILiaSessionWriter writer,
        string sessionId,
        ViolationsRequest? body,
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

        var bounded = ProctoringViolations.Bound(
            body?.Violations ?? default, ProctoringViolations.IsoZ(DateTimeOffset.UtcNow));
        var violations = bounded.Select(v => new ViolationEntry(v.Type, v.Timestamp, v.Details)).ToList();

        var outcome = await writer.SaveViolationsAsync(context, sessionId, context.Tenant!.UserId, violations, cancellationToken);
        return outcome.Status switch
        {
            LiaSaveViolationsStatus.Ok => Results.Ok(new { success = true, data = new { saved = outcome.SavedCount } }),
            _ => NotFound(),
        };
    }

    private static string Truncate(string value, int max) => value.Length > max ? value[..max] : value;

    // JS `Math.max(0, Number(req.body?.time_spent_ms) || 0)`: missing/non-numeric/negative all floor to 0.
    private static int ParseTimeSpentMs(JsonElement? raw)
    {
        var value = raw switch
        {
            { ValueKind: JsonValueKind.Number } n when n.TryGetDouble(out var d) => d,
            { ValueKind: JsonValueKind.String } s when double.TryParse(
                s.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
            _ => 0,
        };

        return value > 0 ? (int)value : 0;
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
            // Legacy handleError bodies (lia.ts): incomplete_coverage -> 409 "Assessment not complete";
            // not_in_progress -> 400 body "not_in_progress" (the raw error string). Match both exactly.
            LiaCompleteStatus.IncompleteCoverage => Error(StatusCodes.Status409Conflict, "Assessment not complete"),
            LiaCompleteStatus.NotInProgress => Error(StatusCodes.Status400BadRequest, "not_in_progress"),
            _ => NotFound(),
        };
    }

    private static IResult Error(int statusCode, string message) =>
        Results.Json(new { success = false, message }, statusCode: statusCode);

    // Overload for the two legacy branches (session_locked, subtest_already_started) that carry a distinct
    // top-level "error" field alongside "message" (legacy handleError, lia.ts).
    private static IResult Error(int statusCode, string? errorCode, string message) =>
        Results.Json(
            errorCode is null ? new { success = false, message } : new { success = false, error = errorCode, message },
            statusCode: statusCode);

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

    public sealed record StartRequest([property: JsonPropertyName("language")] string? Language);

    public sealed record SubtestStartRequest([property: JsonPropertyName("subtest")] string Subtest);

    public sealed record TimeoutRequest([property: JsonPropertyName("subtest")] string Subtest);

    public sealed record SubmitPracticeAnswerRequest(
        [property: JsonPropertyName("question_id")] string? QuestionId,
        [property: JsonPropertyName("answer")] string? Answer);

    public sealed record SubmitAnswerRequest(
        [property: JsonPropertyName("question_id")] string? QuestionId,
        [property: JsonPropertyName("answer")] string? Answer,
        [property: JsonPropertyName("time_spent_ms")] JsonElement? TimeSpentMs);

    public sealed record ViolationsRequest([property: JsonPropertyName("violations")] JsonElement Violations);
}
