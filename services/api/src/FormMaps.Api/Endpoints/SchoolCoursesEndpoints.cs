using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolCourses;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// school-courses slice (FM-DOTNET-054 — routes/school-courses.ts, mounted under /api/v1/school-admin): GET /courses
/// (permission <c>courses:read</c>) + POST /courses (permission <c>courses:write</c>). SCOPE = these two only. The
/// PUT/DELETE /courses/:courseId writes stay Node (that path shape collides with the un-ported /courses/pathways,
/// /courses/import, /courses/ai-import siblings — a later slice). Nothing else on this router is touched.
///
/// <para>Both routes: RequireIdentity (401) → the route's permission (403) → resolve the caller's own schoolId
/// (getSchoolId); null/empty schoolId → 400 { success:false, message:"No school" } (NOT 200-empty — this router
/// differs from the FM-050 reads). GET emits { success, data:{ data:[...schoolCourseRows, ...frameworkRows], total,
/// page, limit, totalPages } }. POST emits 201 { success, data:{ id, code } } or 409 "Course code already exists".</para>
/// </summary>
public static class SchoolCoursesEndpoints
{
    public static IEndpointRouteBuilder MapSchoolCoursesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("SchoolCourses");

        group.MapGet("/courses", GetCoursesAsync);
        group.MapPost("/courses", PostCourseAsync);
        group.MapPut("/courses/{courseId}", PutCourseAsync);
        group.MapDelete("/courses/{courseId}", DeleteCourseAsync);

        return app;
    }

    // ---------------------------------------------------------------- GET /courses (courses:read)

    private static async Task<IResult> GetCoursesAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolCoursesReader reader,
        string? page,
        string? limit,
        string? search,
        string? department,
        string? gradeLevel,
        string? includeFramework,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = await AuthorizeAsync(accessor, guard, scope, FormMapsPermissions.CoursesRead, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        // No-school → 400 "No school" (distinct from the FM-050 reads' 200-empty).
        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        // page = max(1, JsParseInt(page)||1); limit = min(500, max(1, JsParseInt(limit)||20)) — the 500 CAP (the
        // prereq-edit picker loads the whole catalog in one page). NaN AND 0 fall through to the default (JS `||`).
        var parsedPage = PcaExamPagination.JsParseInt(page);
        var resolvedPage = Math.Max(1, parsedPage is null or 0 ? 1 : parsedPage.Value);
        var parsedLimit = PcaExamPagination.JsParseInt(limit);
        var resolvedLimit = Math.Min(500, Math.Max(1, parsedLimit is null or 0 ? 20 : parsedLimit.Value));
        var skip = (long)(resolvedPage - 1) * resolvedLimit;

        // gradeLevel = query present ? JsParseInt(qs) : null. Then applied ONLY when truthy (JS `if (gradeLevel)`):
        // a NaN (JsParseInt null) OR 0 is dropped by the reader (GradeLevel null). qs(undefined)="" → parseInt("")=NaN.
        int? gradeLevelValue = null;
        if (gradeLevel is not null)
        {
            var parsedGrade = PcaExamPagination.JsParseInt(gradeLevel);
            gradeLevelValue = parsedGrade is null or 0 ? null : parsedGrade; // truthy-only (0/NaN skipped)
        }

        var query = new SchoolCoursesQuery(
            resolvedPage,
            resolvedLimit,
            skip,
            Search: string.IsNullOrEmpty(search) ? null : search,
            Department: string.IsNullOrEmpty(department) ? null : department,
            GradeLevel: gradeLevelValue,
            // query.includeFramework !== "false" — default TRUE; ONLY the literal string "false" disables it.
            IncludeFramework: includeFramework != "false");

        var result = await reader.ListCoursesAsync(context, schoolId, query, cancellationToken);

        // data.data = [...schoolCourseRows, ...frameworkCourseRows] — framework rows appended un-paginated (quirk).
        var data = result.SchoolCourses.Select(SchoolCourseJson)
            .Concat(result.FrameworkCourses.Select(FrameworkCourseJson));

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data,
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // ---------------------------------------------------------------- POST /courses (courses:write)

    private static async Task<IResult> PostCourseAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolCoursesWriter writer,
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

        // The raw body IS the input (legacy does NO app validation; the writer applies the `||` defaults + relies on
        // the DB NOT-NULL/type path for 500s). A malformed JSON body surfaces the sanctioned house 400 (FM-051/052
        // precedent); an empty body is {} → all defaults, code/name absent → NOT-NULL → 500 (faithful).
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await writer.CreateCourseAsync(context, schoolId, body.Value, cancellationToken);
        if (result.Duplicate)
        {
            return Results.Json(
                new { success = false, message = "Course code already exists" },
                statusCode: StatusCodes.Status409Conflict);
        }

        return Results.Json(
            new { success = true, data = new { id = result.Id, code = result.Code } },
            statusCode: StatusCodes.Status201Created);
    }

    // ---------------------------------------------------------------- PUT /courses/{courseId} (courses:write)

    private static async Task<IResult> PutCourseAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolCoursesWriter writer,
        string courseId,
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
            return InvalidBody();
        }

        var id = await writer.UpdateCourseAsync(context, schoolId, courseId, body.Value, cancellationToken);
        if (id is null)
        {
            return CourseNotInSchool(); // 403 — uniform for both not-found AND wrong-school
        }

        return Results.Json(new { success = true, data = new { id } });
    }

    // ---------------------------------------------------------------- DELETE /courses/{courseId} (courses:write)

    private static async Task<IResult> DeleteCourseAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ISchoolCoursesWriter writer,
        string courseId,
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

        var deleted = await writer.DeleteCourseAsync(context, schoolId, courseId, cancellationToken);
        if (!deleted)
        {
            return CourseNotInSchool(); // 403
        }

        return Results.Json(new { success = true });
    }

    // ---------------------------------------------------------------- JSON shapes

    // A school_courses row = the FULL model (camelCase) + enrollmentCount (legacy spreads the row then adds the count).
    private static object SchoolCourseJson(SchoolCourseRow c) => new
    {
        id = c.Id,
        schoolId = c.SchoolId,
        code = c.Code,
        name = c.Name,
        department = c.Department,
        credits = c.Credits,
        gradeLevels = c.GradeLevels,
        prerequisites = c.Prerequisites,
        corequisites = c.Corequisites,
        frameworkType = c.FrameworkType,
        frameworkCourseId = c.FrameworkCourseId,
        description = c.Description,
        maxEnrollment = c.MaxEnrollment,
        isHonors = c.IsHonors,
        status = c.Status,
        isActive = c.IsActive,
        createdBy = c.CreatedBy,
        createdDate = c.CreatedDate,
        updatedBy = c.UpdatedBy,
        updatedAt = c.UpdatedAt,
        enrollmentCount = c.EnrollmentCount
    };

    // A framework_courses row = the 9-field subset with prerequisites ALWAYS [] and isFrameworkCourse:true.
    private static object FrameworkCourseJson(FrameworkCourseRow f) => new
    {
        id = f.Id,
        code = f.Code,
        name = f.Name,
        department = f.Department,
        credits = f.Credits,
        gradeLevels = f.GradeLevels,
        prerequisites = Array.Empty<string>(),
        frameworkType = f.FrameworkType,
        isFrameworkCourse = true
    };

    // ---------------------------------------------------------------- body reader + guard

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EmptyObject for an empty/whitespace body (express.json() yields {}); null when present-but-malformed JSON.
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

    private static IResult InvalidBody() =>
        Results.Json(new { success = false, message = "Invalid request body" }, statusCode: StatusCodes.Status400BadRequest);

    // The 403 (NOT 404) both updateCourse/deleteCourse return for a not-found OR wrong-school course (uniform — the
    // course-vs-mapping asymmetry: courses → 403 "Course not in your school"; mappings → 404 "Mapping not found").
    private static IResult CourseNotInSchool() =>
        Results.Json(new { success = false, message = "Course not in your school" }, statusCode: StatusCodes.Status403Forbidden);

    /// <summary>
    /// Shared guard chain: RequireIdentity (401) → the route's permission (403) → resolve the caller's own schoolId.
    /// Error is non-null ONLY for 401/403; the caller maps a null/empty schoolId to 400 "No school".
    /// </summary>
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
