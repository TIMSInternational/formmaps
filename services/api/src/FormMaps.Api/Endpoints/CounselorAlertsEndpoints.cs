using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Counselor alerts (FM-DOTNET-070 — routes/counselor.ts GET /me/alerts + PUT /me/alerts/:id/read). Permission
/// alerts:read. GET and PUT are DIFFERENT paths → one flag <c>FORMMAPS_ROUTE_COUNSELOR_ALERTS_TO_DOTNET</c> with two
/// rewrites. GET lists the caseload's active alerts (paged, optional ?studentId [caseload-scoped — the IDOR fold] +
/// ?unreadOnly); PUT marks one read after an assignment IDOR check.
/// </summary>
public static class CounselorAlertsEndpoints
{
    public static IEndpointRouteBuilder MapCounselorAlertsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorAlerts");
        group.MapGet("/me/alerts", GetAlertsAsync);
        group.MapPut("/me/alerts/{id}/read", MarkAlertReadAsync);
        return app;
    }

    private static async Task<IResult> GetAlertsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorAlertsRepository repository,
        string? page,
        string? limit,
        string? studentId,
        string? unreadOnly,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireAlertsRead(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var resolvedPage = Math.Max(1, FalsyOr(Application.Assessments.PcaExamPagination.JsParseInt(page), 1));
        var resolvedLimit = Math.Min(100, Math.Max(1, FalsyOr(Application.Assessments.PcaExamPagination.JsParseInt(limit), 50)));

        var result = await repository.ListAsync(
            context, context.Actor!.UserId,
            studentIdFilter: EmptyToNull(studentId),
            unreadOnly: unreadOnly == "true",
            resolvedPage, resolvedLimit, cancellationToken);

        var totalPages = (int)Math.Ceiling((double)result.Total / resolvedLimit);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(AlertJson),
                total = result.Total,
                page = resolvedPage,
                limit = resolvedLimit,
                totalPages
            }
        });
    }

    private static async Task<IResult> MarkAlertReadAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorAlertsRepository repository,
        string id,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireAlertsRead(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await repository.MarkReadAsync(context, context.Actor!.UserId, id, cancellationToken);
        return result switch
        {
            MarkReadResult.AlertNotFound => Results.Json(new { success = false, message = "Alert not found" }, statusCode: StatusCodes.Status404NotFound),
            MarkReadResult.NotAssigned => Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound),
            _ => Results.Ok(new { success = true }),
        };
    }

    private static object AlertJson(AlertRow a) => new
    {
        id = a.Id,
        schoolId = a.SchoolId,
        studentId = a.StudentId,
        counselorId = a.CounselorId,
        type = a.Type,
        severity = a.Severity,
        title = a.Title,
        message = a.Message,
        details = a.Details,
        isRead = a.IsRead,
        isDismissed = a.IsDismissed,
        readBy = a.ReadBy,
        readAt = a.ReadAt,
        relatedEntityId = a.RelatedEntityId,
        isActive = a.IsActive,
        createdBy = a.CreatedBy,
        createdDate = a.CreatedDate,
        updatedBy = a.UpdatedBy,
        updatedAt = a.UpdatedAt
    };

    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static string? EmptyToNull(string? value) => string.IsNullOrEmpty(value) ? null : value;

    private static (RequestContext Context, IResult? Error) RequireAlertsRead(
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

        if (!context.Permissions.Contains(FormMapsPermissions.AlertsRead))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
