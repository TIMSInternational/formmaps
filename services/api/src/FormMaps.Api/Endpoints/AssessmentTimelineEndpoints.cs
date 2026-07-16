using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Assessments timeline reads (legacy timelineRouter, mounted /api/v1/assessments with
/// authenticate + tenantContext — NO requireSubscription). Both are self-scoped on the caller's id;
/// guard = RequireIdentity only (RLS applied by the reader). No canAccessUser, no path userId.
/// </summary>
public static class AssessmentTimelineEndpoints
{
    public static IEndpointRouteBuilder MapAssessmentTimelineEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/assessments")
            .WithTags("AssessmentTimeline");

        group.MapGet("/me/timeline", GetTimelineAsync);
        group.MapGet("/me/timeline/stats", GetTimelineStatsAsync);

        return app;
    }

    private static async Task<IResult> GetTimelineAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IAssessmentTimelineReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var pageQuery = http.Request.Query["page"];
        var limitQuery = http.Request.Query["limit"];
        var pagination = PcaExamPagination.Resolve(
            pageQuery.Count > 0 ? pageQuery[0] : null,
            limitQuery.Count > 0 ? limitQuery[0] : null,
            defaultLimit: 50);

        var sources = await reader.ReadSourcesAsync(context, context.Tenant!.UserId, cancellationToken);
        var data = AssessmentTimeline.BuildTimeline(
            sources.Pca, sources.Evals, sources.Courses, pagination.Page, pagination.Limit);
        return Results.Ok(new { success = true, data });
    }

    private static async Task<IResult> GetTimelineStatsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IAssessmentTimelineReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;

        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var sources = await reader.ReadSourcesAsync(context, context.Tenant!.UserId, cancellationToken);
        var data = AssessmentTimeline.BuildStats(sources.Pca, sources.Evals, sources.Courses);
        return Results.Ok(new { success = true, data });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(
            new { success = false, code = decision.Code, message = decision.Message },
            statusCode: decision.StatusCode);
}
