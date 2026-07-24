using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.ParentPortal;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Parent portal — the self-scoped authenticated surface of routes/parent.ts (FM-DOTNET-078, mounted /api/v1/parent).
/// One dark flag <c>FORMMAPS_ROUTE_PARENT_PORTAL_TO_DOTNET</c> co-flips six paths (Next matches path-not-method):
/// GET /profile, GET /notifications, PUT /notifications/read-all, PUT /notifications/:id/read,
/// GET /evaluations/pending, DELETE /:parentLinkId. All keyed on the caller's OWN identity (RequireIdentity). The
/// onboarding flow, the invite/resend SES writes, and the child-link-scoped child reads stay Node.
/// </summary>
public static class ParentPortalEndpoints
{
    public static IEndpointRouteBuilder MapParentPortalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/parent").WithTags("ParentPortal");
        group.MapGet("/profile", ProfileAsync);
        group.MapGet("/notifications", ListNotificationsAsync);
        group.MapPut("/notifications/read-all", MarkAllReadAsync);
        group.MapPut("/notifications/{id}/read", MarkReadAsync);
        group.MapGet("/evaluations/pending", PendingEvaluationsAsync);
        group.MapDelete("/{parentLinkId}", DeleteLinkAsync);
        return app;
    }

    private static async Task<IResult> ProfileAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentPortalRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var profile = await repository.GetProfileAsync(context, context.Actor!.UserId, cancellationToken);
        var children = profile.Children.Select(c => new
        {
            studentId = c.StudentId,
            studentName = c.StudentName,
            gradeLevel = c.GradeLevel,
            relationship = c.Relationship,
        });

        // Legacy spreads `{ ...user, children }`: an absent user contributes no id/name/email keys.
        object data = profile.UserFound
            ? new { id = profile.Id, name = profile.Name, email = profile.Email, children }
            : new { children };
        return Results.Ok(new { success = true, data });
    }

    private static async Task<IResult> ListNotificationsAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IParentPortalRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        // page = Math.max(1, parseInt(page)||1); limit = Math.min(50, Math.max(1, parseInt(limit)||20)).
        var page = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(http.Request.Query["page"]), 1));
        var limit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(http.Request.Query["limit"]), 20)));
        var skip = (long)(page - 1) * limit;
        var unreadOnly = http.Request.Query["unreadOnly"] == "true";

        var (rows, total) = await repository.ListNotificationsAsync(
            context, context.Actor!.UserId, unreadOnly, skip, limit, cancellationToken);

        return Results.Ok(new { success = true, data = new { data = rows.Select(NotificationJson), total, page, limit } });
    }

    private static async Task<IResult> MarkReadAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentPortalRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var ok = await repository.MarkNotificationReadAsync(context, context.Actor!.UserId, id, cancellationToken);
        return ok ? Results.Ok(new { success = true }) : AccessDenied();
    }

    private static async Task<IResult> MarkAllReadAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentPortalRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var count = await repository.MarkAllNotificationsReadAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = new { updatedCount = count } });
    }

    private static async Task<IResult> PendingEvaluationsAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentPortalRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListPendingEvaluationsAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new { evaluationId = r.EvaluationId, studentName = r.StudentName, deadline = r.Deadline, token = r.Token }),
        });
    }

    private static async Task<IResult> DeleteLinkAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentPortalRepository repository,
        string parentLinkId, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var ok = await repository.DeleteLinkAsync(context, context.Actor!.UserId, parentLinkId, cancellationToken);
        return ok ? Results.Ok(new { success = true }) : AccessDenied();
    }

    private static object NotificationJson(NotificationRow n) => new
    {
        id = n.Id,
        userId = n.UserId,
        type = n.Type,
        title = n.Title,
        message = n.Message,
        isRead = n.IsRead,
        readAt = n.ReadAt,
        relatedEntityId = n.RelatedEntityId,
        relatedEntityType = n.RelatedEntityType,
        isActive = n.IsActive,
        createdBy = n.CreatedBy,
        createdDate = n.CreatedDate,
        updatedBy = n.UpdatedBy,
        updatedAt = n.UpdatedAt,
    };

    // JS `x || default`: default when x is NaN (null) OR 0; otherwise x (incl. negatives).
    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

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

    private static IResult AccessDenied() =>
        Results.Json(new { success = false, message = "Access denied" }, statusCode: StatusCodes.Status403Forbidden);
}
