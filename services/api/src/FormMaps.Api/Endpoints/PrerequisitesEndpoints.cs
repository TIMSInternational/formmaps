using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Prerequisites;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school-courses PREREQUISITES slice (FM-DOTNET-057 — routes/school-courses.ts, mounted under /api/v1/school-admin),
/// dark behind FORMMAPS_ROUTE_PREREQUISITES_TO_DOTNET. Five endpoints:
/// GET /courses/:courseId/prerequisite-chain (courses:read), PUT /courses/:courseId/prerequisites (courses:write),
/// GET /prerequisites/check/:studentId/:courseId, /eligible/:studentId, /missing/:studentId/:courseId (curriculum:manage).
///
/// <para>Every endpoint: RequireIdentity (401) → the route permission (403) → resolve the caller's own schoolId
/// (getSchoolId); null/empty schoolId → 400 { success:false, message:"No school" }. Student/course misses → 404 with
/// the exact legacy message ("Student not found" / "Course not found").</para>
/// </summary>
public static class PrerequisitesEndpoints
{
    public static IEndpointRouteBuilder MapPrerequisitesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("Prerequisites");

        group.MapGet("/courses/{courseId}/prerequisite-chain", GetPrerequisiteChainAsync);
        group.MapPut("/courses/{courseId}/prerequisites", PutPrerequisitesAsync);
        group.MapGet("/prerequisites/check/{studentId}/{courseId}", CheckEligibilityAsync);
        group.MapGet("/prerequisites/eligible/{studentId}", EligibleAsync);
        group.MapGet("/prerequisites/missing/{studentId}/{courseId}", MissingAsync);

        return app;
    }

    // ---------------------------------------------------------------- GET /courses/:courseId/prerequisite-chain

    private static async Task<IResult> GetPrerequisiteChainAsync(
        string courseId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPrerequisitesReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CoursesRead, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var result = await reader.GetPrerequisiteChainAsync(context, schoolId, courseId, cancellationToken);
        if (result is null)
        {
            return NotFound("Course not found");
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                courseId = result.CourseId,
                courseCode = result.CourseCode,
                chain = result.Chain.Select(ChainEntryJson),
                totalDepth = result.TotalDepth
            }
        });
    }

    // ---------------------------------------------------------------- PUT /courses/:courseId/prerequisites

    private static async Task<IResult> PutPrerequisitesAsync(
        string courseId,
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPrerequisitesWriter writer,
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
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var updated = await writer.UpdatePrerequisitesAsync(context, schoolId, courseId, context.Actor!.UserId, body.Value, cancellationToken);
        if (!updated)
        {
            return NotFound("Course not found");
        }

        return Results.Ok(new { success = true });
    }

    // ---------------------------------------------------------------- GET /prerequisites/check/:studentId/:courseId

    private static async Task<IResult> CheckEligibilityAsync(
        string studentId,
        string courseId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPrerequisitesReader reader,
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

        var result = await reader.CheckEligibilityAsync(context, schoolId, studentId, courseId, cancellationToken);
        if (result.Outcome != PrerequisiteLookupOutcome.Ok)
        {
            return NotFound(result.Outcome == PrerequisiteLookupOutcome.StudentNotFound ? "Student not found" : "Course not found");
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = result.StudentId,
                courseId = result.CourseId,
                courseCode = result.CourseCode,
                courseName = result.CourseName,
                eligible = result.Eligible,
                errors = result.Errors,
                missingPrerequisites = result.Missing.Select(MissingJson)
            }
        });
    }

    // ---------------------------------------------------------------- GET /prerequisites/eligible/:studentId

    private static async Task<IResult> EligibleAsync(
        string studentId,
        string? gradeLevel,
        string? department,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPrerequisitesReader reader,
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

        var result = await reader.ComputeEligibleAsync(context, schoolId, studentId, cancellationToken);
        if (result.Outcome != PrerequisiteLookupOutcome.Ok)
        {
            return NotFound("Student not found");
        }

        IEnumerable<EligibleCandidate> filtered = result.Candidates.Where(c => c.Eligible);

        // gradeFilter = query.gradeLevel ? parseInt : null. NaN (JsParseInt null) → includes(NaN) is always false →
        // excludes everything; a real int → includes(int); absent/empty → no filter.
        if (!string.IsNullOrEmpty(gradeLevel))
        {
            var parsed = PcaExamPagination.JsParseInt(gradeLevel);
            filtered = parsed is null
                ? filtered.Where(_ => false)
                : filtered.Where(c => c.GradeLevels.Contains(parsed.Value));
        }

        // deptFilter = query.department ? toLowerCase : null; match (department||"").toLowerCase().includes(deptFilter).
        if (!string.IsNullOrEmpty(department))
        {
            var dept = department.ToLowerInvariant();
            filtered = filtered.Where(c => c.Department.ToLowerInvariant().Contains(dept));
        }

        var eligible = filtered
            .Select(c => new
            {
                id = c.CourseId,
                code = c.CourseCode,
                name = c.CourseName,
                department = c.Department,
                credits = c.Credits,
                gradeLevels = c.GradeLevels
            })
            .ToList();

        return Results.Ok(new { success = true, data = new { data = eligible, total = eligible.Count } });
    }

    // ---------------------------------------------------------------- GET /prerequisites/missing/:studentId/:courseId

    private static async Task<IResult> MissingAsync(
        string studentId,
        string courseId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        IPrerequisitesReader reader,
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

        var result = await reader.CheckEligibilityAsync(context, schoolId, studentId, courseId, cancellationToken);
        if (result.Outcome != PrerequisiteLookupOutcome.Ok)
        {
            return NotFound(result.Outcome == PrerequisiteLookupOutcome.StudentNotFound ? "Student not found" : "Course not found");
        }

        // Missing endpoint omits the `eligible` field (legacy returns errors + missingPrerequisites only).
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = result.StudentId,
                courseId = result.CourseId,
                courseCode = result.CourseCode,
                courseName = result.CourseName,
                errors = result.Errors,
                missingPrerequisites = result.Missing.Select(MissingJson)
            }
        });
    }

    // ---------------------------------------------------------------- JSON shapes

    // A chain entry: { code, name, department, credits, depth, frameworkType, isHonors }. credits is heterogeneous
    // (catalog=string, non-catalog=number 0) — STJ serializes the boxed object by runtime type.
    private static object ChainEntryJson(PrerequisiteChainEntry e) => new
    {
        code = e.Code,
        name = e.Name,
        department = e.Department,
        credits = e.Credits,
        depth = e.Depth,
        frameworkType = e.FrameworkType,
        isHonors = e.IsHonors
    };

    private static object MissingJson(MissingPrerequisite m) => new { code = m.Code, name = m.Name };

    // ---------------------------------------------------------------- body reader + guard (mirrors SchoolCoursesEndpoints)

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
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
