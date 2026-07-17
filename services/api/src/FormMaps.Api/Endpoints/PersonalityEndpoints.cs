using System.Globalization;
using System.Text.Json;
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
        group.MapPost("/start", StartAsync);
        group.MapPost("/session/{sessionId}/answer", AnswerAsync);
        group.MapPost("/session/{sessionId}/complete", CompleteAsync);

        return app;
    }

    // POST /start (legacy startSession) — resume an open session or create a new one; retake -> 409.
    private static async Task<IResult> StartAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalitySessionWriter writer,
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

        var body = await ReadJsonObjectAsync(http, cancellationToken);
        // Legacy: laboral -> laboral, estudiantil -> estudiantil, anything else -> estudiantil default.
        var variant = ReadString(body, "variant") == "laboral" ? "laboral" : "estudiantil";
        var language = ReadString(body, "language") == "en" ? "en" : "es";

        var outcome = await writer.StartAsync(context, context.Tenant!.UserId, variant, language, cancellationToken);
        return outcome.Status == PersonalityWriteStatus.Ok
            ? Results.Ok(new { success = true, data = outcome.Payload })
            : MapWriteError(outcome.Status);
    }

    // POST /session/{sessionId}/answer (legacy saveAnswer) — upsert one item's answer (strict A/B).
    private static async Task<IResult> AnswerAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalitySessionWriter writer,
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

        var body = await ReadJsonObjectAsync(http, cancellationToken);
        // Number(req.body?.itemNumber) must be a positive integer (else 400 before the write).
        if (ReadInteger(body, "itemNumber") is not { } itemNumber || itemNumber < 1)
        {
            return Error(StatusCodes.Status400BadRequest, "itemNumber is required");
        }

        // Pass the raw choice through — the writer accepts ONLY exact "A"/"B" (truncating would score "BLAH" as "B").
        var choice = ReadString(body, "choice") ?? string.Empty;

        var outcome = await writer.SaveAnswerAsync(context, sessionId, context.Tenant!.UserId, itemNumber, choice, cancellationToken);
        return outcome.Status == PersonalityWriteStatus.Ok
            ? Results.Ok(new { success = true, data = outcome.Result })
            : MapWriteError(outcome.Status);
    }

    // POST /session/{sessionId}/complete (legacy completeSession) — idempotent, coverage-gated completion.
    private static async Task<IResult> CompleteAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISubscriptionGuard subscriptionGuard,
        IPersonalitySessionWriter writer,
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
        return outcome.Status == PersonalityWriteStatus.Ok
            ? Results.Ok(new { success = true, data = outcome.Result })
            : MapWriteError(outcome.Status);
    }

    // Legacy personality.ts handleError status/body mapping.
    private static IResult MapWriteError(PersonalityWriteStatus status) => status switch
    {
        PersonalityWriteStatus.SessionNotFound => NotFound(),
        PersonalityWriteStatus.ItemNotFound => NotFound(),
        PersonalityWriteStatus.AlreadyCompleted => Error(StatusCodes.Status409Conflict, "Assessment already completed"),
        PersonalityWriteStatus.InvalidChoice => Error(StatusCodes.Status400BadRequest, "Invalid answer"),
        PersonalityWriteStatus.NotInProgress => Error(StatusCodes.Status400BadRequest, "Assessment is not in progress"),
        PersonalityWriteStatus.IncompleteCoverage => Error(StatusCodes.Status400BadRequest, "Please answer every item before finishing"),
        _ => NotFound(),
    };

    private static IResult Error(int statusCode, string message) =>
        Results.Json(new { success = false, message }, statusCode: statusCode);

    // Lenient JSON body read — matches legacy `req.body?.x` optional-chaining (absent/invalid -> empty).
    private static async Task<JsonElement> ReadJsonObjectAsync(HttpContext http, CancellationToken cancellationToken)
    {
        try
        {
            var element = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return element.ValueKind == JsonValueKind.Object ? element : default;
        }
        catch (JsonException)
        {
            return default;
        }
        catch (BadHttpRequestException)
        {
            return default;
        }
    }

    private static string? ReadString(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    // Legacy Number(req.body?.itemNumber): a JSON number OR a numeric string both coerce (then the route
    // requires Number.isInteger && >= 1). Non-integers / non-numeric -> null -> 400 "itemNumber is required".
    private static int? ReadInteger(JsonElement body, string name)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty(name, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt32(out var n) => n,
            JsonValueKind.String when int.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var s) => s,
            _ => null,
        };
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
