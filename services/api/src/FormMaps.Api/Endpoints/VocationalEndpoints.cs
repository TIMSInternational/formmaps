using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Authed vocational-360 endpoints (legacy vocational360.ts, mounted /api/v1/vocational360 with
/// <c>authenticate</c> ONLY — no tenantContext, no requireSubscription). Guard order: RequireIdentity →
/// canAccessUser on the path :evaluatedUserId (a privileged role may access an accessible user; deny is the
/// uniform IDOR-safe 404). Ported: the score recompute WRITE (FM-032), the score/integrated result READS
/// (FM-033), and the /instrument + /questionnaire catalog READS (FM-034, authenticate-only, no per-user
/// gate) + the INTEGRATED recompute WRITE (FM-036). Deferred: /recommendations (Bedrock, stays polyglot).
/// </summary>
public static class VocationalEndpoints
{
    public static IEndpointRouteBuilder MapVocationalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/vocational360")
            .WithTags("Vocational");

        group.MapPost("/score/{evaluatedUserId}/recompute", RecomputeScoreAsync);
        group.MapPost("/integrated/{evaluatedUserId}/recompute", RecomputeIntegratedAsync);
        group.MapGet("/score/{evaluatedUserId}", GetScoreAsync);
        group.MapGet("/integrated/{evaluatedUserId}", GetIntegratedAsync);
        group.MapGet("/instrument", GetInstrumentAsync);
        group.MapGet("/questionnaire", GetQuestionnaireAsync);

        return app;
    }

    // The four rater groups (legacy VALID_GROUPS) accepted by /questionnaire.
    private static readonly HashSet<string> ValidGroups = new(StringComparer.Ordinal) { "self", "parent", "teacher", "sibling_friend" };

    // GET /instrument (legacy getInstrument) — active instrument catalog; authenticate-only, no per-user gate.
    private static async Task<IResult> GetInstrumentAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IVocationalReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var instrument = await reader.GetInstrumentAsync(context, cancellationToken);
        return instrument is null
            ? Results.Json(new { success = false, message = "No active vocational instrument" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = instrument });
    }

    // GET /questionnaire?group=... (legacy getQuestionnaire) — invalid group -> 400 "Invalid group".
    private static async Task<IResult> GetQuestionnaireAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IVocationalReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var group = (http.Request.Query["group"].Count > 0 ? http.Request.Query["group"][0] ?? string.Empty : string.Empty).Trim();
        if (!ValidGroups.Contains(group))
        {
            return Results.Json(new { success = false, message = "Invalid group" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var data = await reader.GetQuestionnaireAsync(context, group, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /score/{evaluatedUserId} (legacy getVocationalResult) — persisted 360 score or never_computed.
    private static async Task<IResult> GetScoreAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IVocationalReader reader,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeAsync(requestContextAccessor, protectedRequestGuard, userAccessGuard, evaluatedUserId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var result = await reader.GetScoreAsync(context, targetId, cancellationToken);
        return Results.Ok(new { success = true, data = (object?)result ?? new { status = "never_computed" } });
    }

    // GET /integrated/{evaluatedUserId} (legacy getIntegratedResult) — persisted integrated score or never_computed.
    private static async Task<IResult> GetIntegratedAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IVocationalReader reader,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeAsync(requestContextAccessor, protectedRequestGuard, userAccessGuard, evaluatedUserId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var result = await reader.GetIntegratedAsync(context, targetId, cancellationToken);
        return Results.Ok(new { success = true, data = (object?)result ?? new { status = "never_computed" } });
    }

    // Shared authenticate-only + canAccessUser(100-char-bounded id) gate for the per-user vocational routes.
    private static async Task<(RequestContext Context, IResult? Denied, string TargetId)> AuthorizeAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return (context, Deny(identity), string.Empty);
        }

        var targetId = evaluatedUserId.Length > 100 ? evaluatedUserId[..100] : evaluatedUserId;
        if (!await userAccessGuard.CanAccessUserAsync(context, targetId, cancellationToken))
        {
            return (context, NotFound(), targetId);
        }

        return (context, null, targetId);
    }

    private static async Task<IResult> RecomputeScoreAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IVocationalWriter writer,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeAsync(requestContextAccessor, protectedRequestGuard, userAccessGuard, evaluatedUserId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var outcome = await writer.RecomputeScoreAsync(context, targetId, cancellationToken);

        // The route always 200s on access; the outcome status rides in the body (matches legacy: even a
        // not-ready / never-computed recompute returns 200 with that data).
        object data = outcome.Status switch
        {
            VocationalRecomputeStatus.Ready => outcome.Ready!,                     // concrete payload: status="ready" + fields
            VocationalRecomputeStatus.NotReady => new { status = "not_ready", reason = outcome.NotReadyReason },
            _ => new { status = "never_computed" },
        };

        return Results.Ok(new { success = true, data });
    }

    private static async Task<IResult> RecomputeIntegratedAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IVocationalWriter writer,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var (context, denied, targetId) = await AuthorizeAsync(requestContextAccessor, protectedRequestGuard, userAccessGuard, evaluatedUserId, cancellationToken);
        if (denied is not null)
        {
            return denied;
        }

        var outcome = await writer.RecomputeIntegratedAsync(context, targetId, cancellationToken);

        // Always 200 on access; the outcome status rides in the body. Serialize the CONCRETE outcome type
        // (an IntegrationOutcome-typed value would drop the ready payload's fields); null = never_computed.
        object data = outcome switch
        {
            IntegratedResultPayload payload => payload,                 // status="ready" + composite/scores/weightsApplied
            IntegrationNotReady notReady => notReady,                   // status="not_ready" + missing[]
            _ => new { status = "never_computed" },
        };

        return Results.Ok(new { success = true, data });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found".
    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
}
