using FormMaps.Application.Auth;
using FormMaps.Application.Pathways;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school-courses DERIVED PATHWAYS slice (FM-DOTNET-058 — routes/school-courses.ts, mounted under /api/v1/school-admin),
/// dark behind FORMMAPS_ROUTE_PATHWAYS_TO_DOTNET. ONE endpoint: GET /courses/pathways (curriculum:manage).
///
/// <para>RequireIdentity (401) → curriculum:manage (403) → resolve the caller's own schoolId (getSchoolId); null/empty
/// → 400 { success:false, message:"No school" }. Never 404s — an empty catalog is { truncated:false, groups:[] }. The
/// literal "pathways" segment is more specific than the (deferred, Node-owned) bare /courses/:courseId — no collision.</para>
/// </summary>
public static class PathwaysEndpoints
{
    public static IEndpointRouteBuilder MapPathwaysEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("Pathways");

        group.MapGet("/courses/pathways", GetPathwaysAsync);

        return app;
    }

    private static async Task<IResult> GetPathwaysAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPathwaysReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CurriculumManage, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var result = await reader.ComputePathwaysAsync(context, schoolId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                truncated = result.Truncated,
                groups = result.Groups.Select(g => new
                {
                    department = g.Department,
                    chains = g.Chains.Select(chain => chain.Select(NodeJson))
                })
            }
        });
    }

    private static object NodeJson(PathwayNode n) => new
    {
        courseId = n.CourseId,
        code = n.Code,
        name = n.Name,
        isHonors = n.IsHonors
    };

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

    private static async Task<(RequestContext Context, string? SchoolId, IResult? Error)> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        string permission,
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

        if (!context.Permissions.Contains(permission))
        {
            return (context, null, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        return (context, schoolId, null);
    }
}
