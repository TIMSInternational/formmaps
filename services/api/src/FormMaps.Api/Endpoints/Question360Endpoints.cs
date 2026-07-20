using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// question360 READ endpoints (legacy routes/question360.ts, mounted /api/question360 — NOT /api/v1). The
/// router applies authenticate only (NO tenantContext-required, NO subscription); guard = RequireIdentity.
/// /GetQuestions, /all, /category/{category} are auth-only; /sub-questions/{parentQuestionId} and /{id} add
/// the evaluations:manage permission (held by SuperAdmin + SchoolAdmin) → 403 otherwise. There is no
/// answer-key on this catalog, so full rows are returned verbatim. Envelopes are intentionally non-uniform.
/// </summary>
public static class Question360Endpoints
{
    public static IEndpointRouteBuilder MapQuestion360Endpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/question360").WithTags("Question360");

        // Literal segments are registered before the {id} catch-all so /all, /category/*, /sub-questions/*
        // are never shadowed (ASP.NET routing also ranks literals above template segments).
        group.MapGet("/GetQuestions", GetQuestionsAsync);
        group.MapGet("/all", GetAllAsync);
        group.MapGet("/category/{category}", GetByCategoryAsync);
        group.MapGet("/sub-questions/{parentQuestionId}", GetSubQuestionsAsync);
        group.MapGet("/{id}", GetByIdAsync);

        return app;
    }

    // GET /GetQuestions — active questions, optional ?relationType filter, rich envelope with count + echo.
    private static async Task<IResult> GetQuestionsAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Reader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        // Legacy: `if (req.query.relationType) where.relationType = req.query.relationType`. An empty/absent
        // value applies no filter and echoes "all". A repeated param binds only the first value (legacy would
        // pass the array to Prisma as an IN and echo the array — a documented single-value divergence).
        var raw = http.Request.Query["relationType"].Count > 0 ? http.Request.Query["relationType"][0] : null;
        var relationType = string.IsNullOrEmpty(raw) ? null : raw;

        var data = await reader.ListAsync(context, relationType, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            message = "Questions retrieved",
            count = data.Count,
            relationType = relationType ?? "all",
            data,
        });
    }

    // GET /all — active questions.
    private static async Task<IResult> GetAllAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Reader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var data = await reader.ListAsync(context, relationType: null, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /category/{category} — active questions in a category.
    private static async Task<IResult> GetByCategoryAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Reader reader,
        string category,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var data = await reader.ListByCategoryAsync(context, category, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /sub-questions/{parentQuestionId} — active sub-questions (requires evaluations:manage).
    private static async Task<IResult> GetSubQuestionsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Reader reader,
        string parentQuestionId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var data = await reader.ListByParentAsync(context, parentQuestionId, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /{id} — a single question by id (requires evaluations:manage); null → 404 "Not found".
    private static async Task<IResult> GetByIdAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Reader reader,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var data = await reader.GetByIdAsync(context, id, cancellationToken);
        if (data is null)
        {
            return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        return Results.Ok(new { success = true, data });
    }

    // Identity + optional evaluations:manage. Returns a denial IResult, or null when allowed.
    private static IResult? Guard(RequestContext context, IProtectedRequestGuard protectedRequestGuard, bool requireManage)
    {
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        if (requireManage && !context.Permissions.Contains(FormMapsPermissions.EvaluationsManage))
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        return null;
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
