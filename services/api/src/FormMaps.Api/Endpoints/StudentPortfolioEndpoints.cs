using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentPortfolio;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student portfolio CRUD (FM-DOTNET-073 — routes/student.ts, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_PORTFOLIO_TO_DOTNET</c> co-flips three paths (Next matches path-not-method):
/// GET+POST /portfolio, GET /portfolio/summary, PUT+DELETE /portfolio/:id. Self-scoped — RequireIdentity only
/// (req.userId), no role/permission. Bodies are Zod-validated (createPortfolioSchema / .partial()); a validation
/// failure → 400 with the first zod message; a malformed/primitive-JSON body → 500 (express.json rejects before the
/// route in Node) except a valid non-object, which reaches zod as "Expected object, received &lt;type&gt;" → 400.
/// </summary>
public static class StudentPortfolioEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapStudentPortfolioEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentPortfolio");
        group.MapGet("/portfolio", ListAsync);
        group.MapGet("/portfolio/summary", SummaryAsync);
        group.MapPost("/portfolio", CreateAsync);
        group.MapPut("/portfolio/{id}", UpdateAsync);
        group.MapDelete("/portfolio/{id}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> ListAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentPortfolioRepository repository,
        string? page,
        string? limit,
        string? type,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var resolvedPage = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(page), 1));
        var resolvedLimit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(limit), 20)));

        var result = await repository.ListAsync(
            context, context.Actor!.UserId, EmptyToNull(type), resolvedPage, resolvedLimit, cancellationToken);

        var totalPages = (int)Math.Ceiling((double)result.Total / resolvedLimit);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(RowJson),
                total = result.Total,
                page = resolvedPage,
                limit = resolvedLimit,
                totalPages
            }
        });
    }

    private static async Task<IResult> SummaryAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentPortfolioRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var summary = await repository.GetSummaryAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalItems = summary.TotalItems,
                byType = summary.ByType,
                totalHoursPerWeek = summary.TotalHoursPerWeek,
                totalVolunteerHours = summary.TotalVolunteerHours,
                skills = summary.Skills,
                categories = summary.Categories
            }
        });
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentPortfolioRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        var validation = StudentPortfolioValidation.ValidateCreate(body.Value);
        if (!validation.Ok)
        {
            return BadRequest(validation.Message!);
        }

        var row = await repository.CreateAsync(context, context.Actor!.UserId, validation.Input!, cancellationToken);
        return Results.Json(new { success = true, data = RowJson(row) }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> UpdateAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentPortfolioRepository repository,
        string id,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError();
        }

        var validation = StudentPortfolioValidation.ValidateUpdate(body.Value);
        if (!validation.Ok)
        {
            return BadRequest(validation.Message!);
        }

        var row = await repository.UpdateAsync(context, context.Actor!.UserId, id, validation.Input!, cancellationToken);
        return row is null
            ? Results.Json(new { success = false, message = "Item not found" }, statusCode: StatusCodes.Status404NotFound)
            : Results.Ok(new { success = true, data = RowJson(row) });
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentPortfolioRepository repository,
        string id,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var ok = await repository.SoftDeleteAsync(context, context.Actor!.UserId, id, cancellationToken);
        return ok
            ? Results.Ok(new { success = true, message = "Portfolio item deleted successfully" })
            : Results.Json(new { success = false, message = "Item not found" }, statusCode: StatusCodes.Status404NotFound);
    }

    // Raw Prisma row (schema field order). hoursPerWeek/totalHours are Decimal → JSON STRING (or null);
    // attachments is verbatim jsonb; weeksPerYear a nullable int.
    private static object RowJson(PortfolioRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        type = r.Type,
        title = r.Title,
        organization = r.Organization,
        startDate = r.StartDate,
        endDate = r.EndDate,
        isCurrent = r.IsCurrent,
        description = r.Description,
        role = r.Role,
        hoursPerWeek = r.HoursPerWeek,
        totalHours = r.TotalHours,
        achievements = r.Achievements,
        skills = r.Skills,
        attachments = r.Attachments,
        activityCategory = r.ActivityCategory,
        weeksPerYear = r.WeeksPerYear,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt
    };

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject; // express.json → {} → zod "Required" (create) / no-op (update)
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            // express.json({strict:true}) accepts only objects/arrays; a top-level PRIMITIVE (number/string/bool/null)
            // is rejected pre-route → 500. An array is accepted → reaches zod as "Expected object, received array" (400).
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // primitive → 500
        }
        catch (JsonException)
        {
            return null; // malformed → 500 (express.json rejects pre-route in Node)
        }
    }

    private static (RequestContext Context, IResult? Error) RequireSelf(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        return (context, null);
    }

    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static string? EmptyToNull(string? value) => string.IsNullOrEmpty(value) ? null : value;

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
