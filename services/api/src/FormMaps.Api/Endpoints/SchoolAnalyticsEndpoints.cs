using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolAnalytics;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// School-analytics reads (FM-DOTNET-049 — routes/school.ts /analytics/*, mounted under /api/v1/school-admin).
/// The four method-unambiguous GETs: /overview, /trends, /performance-trends (identical to /trends), /top-performers.
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → permission <c>analytics:school</c> (403) → resolve the
/// caller's own schoolId (getSchoolId). Unlike the school-admin router, NO-SCHOOL IS NOT AN ERROR here: when the
/// resolved schoolId is null/empty each handler returns 200 with its OWN per-endpoint empty default —
/// overview → { totalStudents: 0 } (ONLY that field, NOT the full 6-field object); trends/performance-trends →
/// { labels: [], values: [] }; top-performers → { data: [] }.</para>
/// </summary>
public static class SchoolAnalyticsEndpoints
{
    public static IEndpointRouteBuilder MapSchoolAnalyticsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin/analytics").WithTags("SchoolAnalytics");

        group.MapGet("/overview", GetOverviewAsync);
        group.MapGet("/trends", GetTrendsAsync);
        // /performance-trends is an IDENTICAL call to /trends (same service fn, same defaults) — legacy dup route.
        group.MapGet("/performance-trends", GetTrendsAsync);
        group.MapGet("/top-performers", GetTopPerformersAsync);

        return app;
    }

    private static async Task<IResult> GetOverviewAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAnalyticsReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → 200 with ONLY totalStudents:0 (NOT the full 6-field object — this is the distinct legacy shape).
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { totalStudents = 0 } });
        }

        var overview = await reader.GetOverviewAsync(context, schoolId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalStudents = overview.TotalStudents,
                activeStudents = overview.ActiveStudents,
                assessmentCompletionRate = overview.AssessmentCompletionRate,
                averageProgressScore = overview.AverageProgressScore,
                studentsAtRisk = overview.StudentsAtRisk,
                counselorCoverage = overview.CounselorCoverage
            }
        });
    }

    private static async Task<IResult> GetTrendsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAnalyticsReader reader,
        string? metric,
        string? range,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { labels = Array.Empty<string>(), values = Array.Empty<int>() } });
        }

        // qs(metric) || "completion_rate" / qs(range) || "30d" — empty string is JS-falsy → the default.
        var resolvedMetric = string.IsNullOrEmpty(metric) ? "completion_rate" : metric;
        var resolvedRange = string.IsNullOrEmpty(range) ? "30d" : range;

        var trends = await reader.GetTrendsAsync(context, schoolId, resolvedMetric, resolvedRange, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                metric = trends.Metric,
                range = trends.Range,
                labels = trends.Labels,
                values = trends.Values
            }
        });
    }

    private static async Task<IResult> GetTopPerformersAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolAnalyticsReader reader,
        string? limit,
        string? gradeLevel,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>() } });
        }

        // limit = Math.min(50, Math.max(1, parseInt(qs(limit)) || 10)) — NaN AND 0 fall through to 10.
        var parsedLimit = PcaExamPagination.JsParseInt(limit);
        var resolvedLimit = Math.Min(50, Math.Max(1, parsedLimit is null or 0 ? 10 : parsedLimit.Value));

        // gradeLevel = req.query.gradeLevel ? parseInt(...) : undefined, then service `if (gradeLevel)` drops NaN/0.
        int? resolvedGrade = null;
        if (!string.IsNullOrEmpty(gradeLevel))
        {
            var parsed = PcaExamPagination.JsParseInt(gradeLevel);
            if (parsed is not null and not 0)
            {
                resolvedGrade = parsed;
            }
        }

        var rows = await reader.GetTopPerformersAsync(context, schoolId, resolvedLimit, resolvedGrade, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = rows.Select(r => new
                {
                    studentId = r.StudentId,
                    name = r.Name,
                    gradeLevel = r.GradeLevel,
                    progressScore = r.ProgressScore,
                    assessmentStatus = r.AssessmentStatus
                })
            }
        });
    }

    /// <summary>
    /// Auth chain shared by all four analytics endpoints: RequireIdentity (401) → permission analytics:school (403)
    /// → resolve the caller's own schoolId. Returns the resolved schoolId (which MAY be null/empty — that is NOT an
    /// error here; each handler renders its own 200 empty default). Error is non-null ONLY for 401/403.
    /// </summary>
    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.AnalyticsSchool))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
