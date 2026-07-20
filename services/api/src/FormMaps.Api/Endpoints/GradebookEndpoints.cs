using FormMaps.Application.Auth;
using FormMaps.Application.Gradebook;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Gradebook transcript read (legacy routes/school-gradebook.ts GET /gradebook/students/:studentId, mounted
/// under /api/v1/school-admin). Shares the school-admin guard chain — RequireIdentity -> permission
/// "school:manage" (403) -> resolve the caller's schoolId via getSchoolUser (400 "No school") — but lives in
/// its own endpoint group + reader (the legacy file's grade writes stay Node). Cross-school / non-student ->
/// 404 "Student not found". SINGLE-wrap envelope { success, data: transcript }.
/// </summary>
public static class GradebookEndpoints
{
    public static IEndpointRouteBuilder MapGradebookEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/school-admin/gradebook/students/{studentId}", GetStudentTranscriptAsync)
            .WithTags("Gradebook");

        return app;
    }

    private static async Task<IResult> GetStudentTranscriptAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IGradebookReader reader,
        string studentId,
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

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Json(
                new { success = false, message = "No school" },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var transcript = await reader.GetStudentTranscriptAsync(context, schoolId, studentId, cancellationToken);
        if (transcript is null)
        {
            return Results.Json(
                new { success = false, message = "Student not found" },
                statusCode: StatusCodes.Status404NotFound);
        }

        // SINGLE wrap ({ success, data }) — the byYear record props serialize camelCase (Web policy); the year
        // keys are dictionary keys (DictionaryKeyPolicy null) so they stay verbatim ("2025-2026" / "Unknown").
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                byYear = transcript.ByYear,
                gpaUnweighted = transcript.GpaUnweighted,
                gpaWeighted = transcript.GpaWeighted,
                totalCredits = transcript.TotalCredits
            }
        });
    }
}
