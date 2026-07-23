using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.CourseImport;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// course bulk-import CORE slice (FM-DOTNET-059 — routes/school-courses.ts, mounted under /api/v1/school-admin), dark
/// behind FORMMAPS_ROUTE_COURSE_IMPORT_TO_DOTNET. TWO endpoints (both courses:write):
/// POST /courses/import → 202, GET /courses/import/{jobId} → 200/404 "Job not found". The third route
/// (/courses/import/{jobId}/download-failures) is DEFERRED to FM-060 (stays Node).
///
/// <para>Both: RequireIdentity (401) → courses:write (403) → resolve the caller's own schoolId (getSchoolId);
/// null/empty → 400 { success:false, message:"No school" }. The literal "import" segment (2-seg) and
/// "import/{jobId}" (3-seg) are more specific than the deferred bare /courses/:courseId (still Node) and disjoint from
/// /courses (exact), /courses/pathways and /courses/{courseId}/prerequisite* → collision-free.</para>
/// </summary>
public static class CourseImportEndpoints
{
    public static IEndpointRouteBuilder MapCourseImportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("CourseImport");

        group.MapPost("/courses/import", PostImportAsync);
        group.MapGet("/courses/import/{jobId}", GetImportJobAsync);
        group.MapGet("/courses/import/{jobId}/download-failures", GetImportFailuresAsync);

        return app;
    }

    // ---------------------------------------------------------------- POST /courses/import

    private static async Task<IResult> PostImportAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICourseImportWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CoursesWrite, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var body = await ReadBodyAsync(http, cancellationToken);

        // `rows` must be a non-empty JSON array (a malformed/absent body → null body → the rows check fails). Legacy:
        // !Array.isArray(rows) || rows.length === 0 → 400 "rows array required (parsed CSV data)".
        if (body is not { } root
            || root.ValueKind != JsonValueKind.Object
            || !root.TryGetProperty("rows", out var rowsElement)
            || rowsElement.ValueKind != JsonValueKind.Array
            || rowsElement.GetArrayLength() == 0)
        {
            return Results.Json(
                new { success = false, message = "rows array required (parsed CSV data)" },
                statusCode: StatusCodes.Status400BadRequest);
        }

        // filename = the JSON string, or "import.csv" when absent/non-string (legacy `filename || "import.csv"`).
        var filename = "import.csv";
        if (body.Value.TryGetProperty("filename", out var filenameElement)
            && filenameElement.ValueKind == JsonValueKind.String)
        {
            var value = filenameElement.GetString();
            if (!string.IsNullOrEmpty(value))
            {
                filename = value;
            }
        }

        var rows = rowsElement.EnumerateArray().Select(ImportRowParser.Parse).ToList();
        var result = await writer.ImportCoursesAsync(context, schoolId, context.Actor!.UserId, rows, filename, cancellationToken);

        return Results.Json(
            new
            {
                success = true,
                data = new
                {
                    jobId = result.JobId,
                    totalRows = result.TotalRows,
                    validRows = result.ValidRows,
                    invalidRows = result.InvalidRows,
                    validationErrors = result.ValidationErrors.Select(ValidationErrorJson)
                }
            },
            statusCode: StatusCodes.Status202Accepted);
    }

    // ---------------------------------------------------------------- GET /courses/import/{jobId}

    private static async Task<IResult> GetImportJobAsync(
        string jobId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICourseImportReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CoursesWrite, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var result = await reader.GetImportJobAsync(context, schoolId, jobId, cancellationToken);
        if (result is null)
        {
            return NotFound("Job not found");
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                jobId = result.JobId,
                status = result.Status,
                totalRows = result.TotalRows,
                processedRows = result.ProcessedRows,
                failedRows = result.FailedRows,
                validationErrors = result.ValidationErrors.Select(ValidationErrorJson),
                completedAt = result.CompletedAt
            }
        });
    }

    // ---------------------------------------------------------------- GET /courses/import/{jobId}/download-failures

    private static async Task<IResult> GetImportFailuresAsync(
        string jobId,
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICourseImportReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CoursesWrite, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var csv = await reader.GetImportFailuresCsvAsync(context, schoolId, jobId, cancellationToken);
        if (csv is null)
        {
            return NotFound("Job not found");
        }

        // text/csv attachment; filename=course-import-failures-{jobId}.csv. Legacy `res.send(csv)` (Express) rewrites
        // the Content-Type via setCharset → `text/csv; charset=utf-8` (verified against Express 5.2.1) — the charset
        // MUST be in the media-type string (an Encoding arg alone does NOT append it), else accented content (Spanish
        // course names) mojibakes in Excel/Windows-1252-defaulting clients.
        http.Response.Headers.ContentDisposition = $"attachment; filename=course-import-failures-{jobId}.csv";
        return Results.Text(csv, "text/csv; charset=utf-8");
    }

    // ---------------------------------------------------------------- json shapes

    private static object ValidationErrorJson(ImportValidationError e) => new { row = e.Row, errors = e.Errors };

    // ---------------------------------------------------------------- body reader + guard (mirrors PrerequisitesEndpoints)

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null; // absent body → the rows check → 400 "rows array required..."
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null; // malformed body → the rows check → 400 "rows array required..."
        }
    }

    private static IResult NoSchool() =>
        Results.Json(new { success = false, message = "No school" }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);

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
