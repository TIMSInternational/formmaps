using System.Text.Json;
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

        // Writes (all require evaluations:manage). Literal /bulk-create + the 2-segment activate/deactivate are
        // distinguished from the {id} routes by method/segment shape (ASP.NET ranks literals above templates).
        group.MapPost("/", CreateAsync);
        group.MapPost("/bulk-create", BulkCreateAsync);
        group.MapPut("/{id}", UpdateAsync);
        group.MapPut("/{id}/activate", ActivateAsync);
        group.MapPut("/{id}/deactivate", DeactivateAsync);
        group.MapDelete("/{id}", DeleteAsync);

        return app;
    }

    // POST / — create a catalog question.
    private static async Task<IResult> CreateAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        var outcome = await writer.CreateAsync(context, body, cancellationToken);
        return outcome.Status switch
        {
            Question360WriteStatus.Created => Results.Json(new { success = true, data = outcome.Row }, statusCode: StatusCodes.Status201Created),
            _ => ValidationError(outcome.Message),
        };
    }

    // PUT /{id} — partial update (isActive deliberately not accepted); missing id → 500 (legacy P2025).
    private static async Task<IResult> UpdateAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        var outcome = await writer.UpdateAsync(context, id, body, cancellationToken);
        return MapWriteOutcome(outcome);
    }

    // PUT /{id}/activate — set isActive = true.
    private static Task<IResult> ActivateAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        string id,
        CancellationToken cancellationToken) =>
        SetActiveAsync(requestContextAccessor, protectedRequestGuard, writer, id, isActive: true, cancellationToken);

    // PUT /{id}/deactivate — set isActive = false.
    private static Task<IResult> DeactivateAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        string id,
        CancellationToken cancellationToken) =>
        SetActiveAsync(requestContextAccessor, protectedRequestGuard, writer, id, isActive: false, cancellationToken);

    private static async Task<IResult> SetActiveAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        string id,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var outcome = await writer.SetActiveAsync(context, id, isActive, cancellationToken);
        return MapWriteOutcome(outcome);
    }

    // DELETE /{id} — soft-delete; child-guard 400; missing id → 500. Success is {success:true} with NO data key.
    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var status = await writer.DeleteAsync(context, id, cancellationToken);
        return status switch
        {
            Question360DeleteStatus.Deleted => Results.Ok(new { success = true }),
            Question360DeleteStatus.ChildGuard => Results.Json(
                new { success = false, message = "Cannot delete: has active sub-questions" },
                statusCode: StatusCodes.Status400BadRequest),
            _ => InternalError(),
        };
    }

    // POST /bulk-create — array body → per-item report (always 200). A non-array body → 400 "Array required".
    private static async Task<IResult> BulkCreateAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IQuestion360Writer writer,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        if (Guard(context, protectedRequestGuard, requireManage: true) is { } denied)
        {
            return denied;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body.ValueKind != JsonValueKind.Array)
        {
            return Results.Json(new { success = false, message = "Array required" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.BulkCreateAsync(context, body, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new { createdCount = result.CreatedCount, totalRequested = result.TotalRequested, errors = result.Errors },
        });
    }

    private static IResult MapWriteOutcome(Question360WriteOutcome outcome) => outcome.Status switch
    {
        Question360WriteStatus.Ok => Results.Ok(new { success = true, data = outcome.Row }),
        Question360WriteStatus.ValidationError => ValidationError(outcome.Message),
        _ => InternalError(),
    };

    private static IResult ValidationError(string? message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    // Legacy: an update/activate/deactivate/delete on a missing id throws Prisma P2025 → the route catch returns
    // 500 "Internal server error". The catalog has no IDOR/ownership concern, so this is NOT a 404. (Candidate
    // 404-upgrade — flagged in the slice report; kept as legacy for strict parity.)
    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);

    // Absent/empty/malformed body → empty object {} (legacy express.json()); a present array/primitive is preserved
    // so the create validator (or the bulk array-check) sees its real kind.
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    private static async Task<JsonElement> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        try
        {
            var element = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return element.ValueKind == JsonValueKind.Undefined ? EmptyObject : element;
        }
        catch (JsonException)
        {
            return EmptyObject;
        }
        catch (BadHttpRequestException)
        {
            return EmptyObject;
        }
        catch (InvalidOperationException)
        {
            return EmptyObject;
        }
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
