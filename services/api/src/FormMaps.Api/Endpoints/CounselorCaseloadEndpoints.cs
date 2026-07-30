using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Enriched caseload read (FM-DOTNET-068 — routes/counselor.ts GET /me/students → listEnrichedStudents). The deferred
/// companion to FM-067, on its own flag <c>FORMMAPS_ROUTE_COUNSELOR_CASELOAD_TO_DOTNET</c>. Same <c>counselor:dashboard</c>
/// gate as the dashboard reads. Mounted /api/v1/counselor — the EXACT literal /me/students (no trailing segment), so it
/// is distinct from /me/students/{studentId} (FM-067) and its 4-segment AI sub-path.
/// </summary>
public static class CounselorCaseloadEndpoints
{
    public static IEndpointRouteBuilder MapCounselorCaseloadEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGroup("/api/v1/counselor").WithTags("CounselorCaseload")
            .MapGet("/me/students", GetEnrichedCaseloadAsync);

        return app;
    }

    private static async Task<IResult> GetEnrichedCaseloadAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorCaseloadReader reader,
        string? search,
        string? status,
        string? sortBy,
        string? sortOrder,
        string? page,
        string? limit,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode);
        }

        if (!context.Permissions.Contains(FormMapsPermissions.CounselorDashboard))
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        // page = Math.max(1, parseInt(page) || 1); limit = Math.min(50, Math.max(1, parseInt(limit) || 20)).
        var resolvedPage = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(page), 1));
        var resolvedLimit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(limit), 20)));

        var opts = new EnrichedCaseloadOptions(
            Search: EmptyToNull(search),
            Status: EmptyToNull(status),
            SortBy: EmptyToNull(sortBy),
            SortOrder: EmptyToNull(sortOrder),
            Page: resolvedPage,
            Limit: resolvedLimit);

        var data = await reader.GetCaseloadDataAsync(context, context.Actor!.UserId, cancellationToken);
        var result = EnrichedCaseloadComputer.Compute(data, opts);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(StudentJson),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    private static object StudentJson(EnrichedStudent s) => new
    {
        id = s.Id,
        name = s.Name,
        email = s.Email,
        gradeLevel = s.GradeLevel,
        isActive = s.IsActive,
        createdAt = s.CreatedAt,
        status = s.Status,
        gpa = s.Gpa,
        creditProgress = new
        {
            earned = s.CreditProgress.Earned,
            required = s.CreditProgress.Required,
            percentage = s.CreditProgress.Percentage
        },
        // key "360" is not a valid C# identifier → a dictionary preserves the exact { LIA, PCA, "360", Personality } shape/order.
        assessmentStatus = new Dictionary<string, string> { ["LIA"] = s.Lia, ["PCA"] = s.Pca, ["360"] = s.Eval360, ["Personality"] = s.Personality },
        careerPath = s.CareerPath,
        alertCount = s.AlertCount
    };

    // JS `x || fallback` for the parsed int: NaN (null) OR 0 → fallback; else x (incl. negatives).
    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static string? EmptyToNull(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
