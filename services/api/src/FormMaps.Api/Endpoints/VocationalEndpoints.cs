using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Authed vocational-360 write endpoints (legacy vocational360.ts, mounted /api/v1/vocational360 with
/// <c>authenticate</c> ONLY — no tenantContext, no requireSubscription). Guard order: RequireIdentity →
/// canAccessUser on the path :evaluatedUserId (a privileged role may recompute an accessible user; deny is
/// the uniform IDOR-safe 404). Only the score recompute is ported here; the integrated recompute is
/// deferred (it depends on the unported DISC/PCA + MIL/LIA profile assembler).
/// </summary>
public static class VocationalEndpoints
{
    public static IEndpointRouteBuilder MapVocationalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/vocational360")
            .WithTags("Vocational");

        group.MapPost("/score/{evaluatedUserId}/recompute", RecomputeScoreAsync);

        return app;
    }

    private static async Task<IResult> RecomputeScoreAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IVocationalWriter writer,
        string evaluatedUserId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        // authenticate-only mount: identity required, but NO subscription gate.
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        // Legacy bounds the path param to 100 chars before the access check.
        var targetId = evaluatedUserId.Length > 100 ? evaluatedUserId[..100] : evaluatedUserId;

        if (!await userAccessGuard.CanAccessUserAsync(context, targetId, cancellationToken))
        {
            return NotFound();
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

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found".
    private static IResult NotFound() =>
        Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
}
