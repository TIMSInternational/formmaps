using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Assessments timeline reads (legacy timelineRouter, mounted /api/v1/assessments with
/// authenticate + tenantContext — NO requireSubscription). Both are self-scoped on the caller's id;
/// guard = RequireIdentity only (RLS applied by the reader). No canAccessUser, no path userId.
///
/// <para>Reachability (formmaps#109): mapped here since the port, but until 2026-09-03 there was no
/// rewrite for either path in apps/web/next.config.ts, so the /api/:path* catch-all sent both to Node —
/// which ALSO answers 401 unauthenticated, so a status-only check never noticed these handlers had never
/// run. Both now have exact-path rewrites gated by <c>FORMMAPS_ROUTE_ASSESSMENT_TIMELINE_TO_DOTNET</c>
/// (default OFF). Deliberately NOT an /api/v1/assessments/:path* prefix: Node owns that prefix and
/// serves live routes under it (/api/v1/assessments/{id}/report) plus the legacy
/// POST /me/timeline/export, which has no twin here.</para>
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
