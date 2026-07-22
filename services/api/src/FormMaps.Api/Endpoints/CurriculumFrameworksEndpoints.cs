using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// curriculum:manage frameworks surface (FM-DOTNET-055 — routes/school-courses.ts, mounted under
/// /api/v1/school-admin): the FOUR /curriculum/frameworks endpoints ONLY (courses / data-mapping / prerequisite / AI
/// routes stay on Node). This slice is the .NET write-owner for curriculum_frameworks (PUT /curriculum/frameworks)
/// and school_framework_course_overrides (PUT .../:courseId); framework_courses is read-only.
///
/// <para>Auth per endpoint: RequireIdentity (401) → permission <c>curriculum:manage</c> (403). The two frameworks
/// paths and the customize PUT then resolve the caller's own schoolId (getSchoolId); null/empty → 400 "No school".
/// The GET :type/courses catalog read does NOT resolve a school (global catalog, gated only by the permission). The
/// customize PUT returns a DYNAMIC status (404 "Course not found" / 400 "Course does not belong to this framework
/// type") from the service. The frameworks list is DOUBLE-nested {success,data:{data:[…]}}, omitting id+configuredAt
/// for a type with no row.</para>
/// </summary>
public static class CurriculumFrameworksEndpoints
{
    public static IEndpointRouteBuilder MapCurriculumFrameworksEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin").WithTags("CurriculumFrameworks");

        group.MapGet("/curriculum/frameworks", ListFrameworksAsync);
        group.MapPut("/curriculum/frameworks", UpdateFrameworksAsync);
        group.MapGet("/curriculum/frameworks/{type}/courses", ListFrameworkCoursesAsync);
        group.MapPut("/curriculum/frameworks/{type}/courses/{courseId}", CustomizeFrameworkCourseAsync);

        return app;
    }

    // ---------------------------------------------------------------- GET /curriculum/frameworks

    private static async Task<IResult> ListFrameworksAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICurriculumFrameworksReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var frameworks = await reader.ListFrameworksAsync(context, schoolId, cancellationToken);
        // DOUBLE-nested: { success, data: { data: [ … ] } }.
        return Results.Ok(new { success = true, data = new { data = frameworks.Select(FrameworkJson).ToArray() } });
    }

    // ---------------------------------------------------------------- PUT /curriculum/frameworks

    private static async Task<IResult> UpdateFrameworksAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICurriculumFrameworksWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        var frameworks = ParseFrameworks(body.Value);
        await writer.UpdateFrameworksAsync(context, schoolId, frameworks, cancellationToken);
        return Results.Ok(new { success = true });
    }

    // ---------------------------------------------------------------- GET /curriculum/frameworks/{type}/courses

    private static async Task<IResult> ListFrameworkCoursesAsync(
        string type,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICurriculumFrameworksReader reader,
        string? page,
        string? limit,
        string? search,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // NO school resolution — global catalog read (gated only by the permission). 100-cap, default limit 50.
        var pagination = PcaExamPagination.Resolve(page, limit, defaultLimit: 50);
        var normalizedSearch = string.IsNullOrEmpty(search) ? null : search;
        var result = await reader.ListFrameworkCoursesAsync(
            context, type, pagination.Page, pagination.Limit, pagination.Skip, normalizedSearch, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(CourseJson).ToArray(),
                total = result.Total,
                page = result.Page,
                limit = result.Limit,
                totalPages = result.TotalPages
            }
        });
    }

    // ---------------------------------------------------------------- PUT /curriculum/frameworks/{type}/courses/{courseId}

    private static async Task<IResult> CustomizeFrameworkCourseAsync(
        string type,
        string courseId,
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ISchoolAdminScopeResolver scope,
        ICurriculumFrameworksWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await scope.ResolveSchoolIdAsync(context, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return NoSchool();
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InvalidBody();
        }

        var input = FrameworkOverrideBuilder.Build(body.Value);
        var userId = context.Actor!.UserId;
        var result = await writer.CustomizeFrameworkCourseAsync(
            context, schoolId, userId, type, courseId, input, cancellationToken);

        if (result.Error is not null)
        {
            // Dynamic status from the service (404 not-found / 400 wrong-type).
            return Results.Json(new { success = false, message = result.Error }, statusCode: result.Status);
        }

        return Results.Ok(new { success = true, data = OutcomeJson(result.Data!) });
    }

    // ---------------------------------------------------------------- JSON shapes

    // Missing-row entry OMITS id + configuredAt (JS undefined); an existing row includes id + configuredAt (ISO-Z or null).
    private static object FrameworkJson(FrameworkSummary f) => f.HasRow
        ? new
        {
            id = f.Id,
            type = f.Type,
            label = f.Type,
            enabled = f.Enabled,
            configuredAt = f.ConfiguredAt,
            courseCount = f.CourseCount
        }
        : new
        {
            type = f.Type,
            label = f.Type,
            enabled = f.Enabled,
            courseCount = f.CourseCount
        };

    private static object CourseJson(FrameworkCourseRow c) => new
    {
        id = c.Id,
        frameworkType = c.FrameworkType,
        code = c.Code,
        name = c.Name,
        department = c.Department,
        credits = c.Credits,
        gradeLevels = c.GradeLevels,
        description = c.Description,
        isGlobal = c.IsGlobal,
        schoolId = c.SchoolId,
        isActive = c.IsActive,
        createdBy = c.CreatedBy,
        createdDate = c.CreatedDate,
        updatedBy = c.UpdatedBy,
        updatedAt = c.UpdatedAt
    };

    // NOTE the SINGULAR key `gradeLevel` holding an int[].
    private static object OutcomeJson(CustomizeOutcome o) => new
    {
        id = o.Id,
        code = o.Code,
        name = o.Name,
        frameworkType = o.FrameworkType,
        department = o.Department,
        credits = o.Credits,
        gradeLevel = o.GradeLevel,
        description = o.Description,
        isCustomized = o.IsCustomized
    };

    // ---------------------------------------------------------------- frameworks body parse

    // req.body.frameworks || [] → array of { type: string, enabled: boolean }. No element validation (faithful):
    // HasEnabled = the element carries a JSON boolean (true/false); a present non-boolean (or absent) → HasEnabled
    // false with Enabled=false — non-destructive, so the writer keeps an existing enabled on UPDATE (legacy
    // `update:{enabled:undefined}` skips) and defaults false on CREATE. An element without a string `type` (half the
    // ON CONFLICT key) is skipped rather than 500 at the DB (documented, non-destructive divergence).
    private static IReadOnlyList<(string Type, bool Enabled, bool HasEnabled)> ParseFrameworks(JsonElement body)
    {
        var frameworks = new List<(string Type, bool Enabled, bool HasEnabled)>();
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty("frameworks", out var list)
            || list.ValueKind != JsonValueKind.Array)
        {
            return frameworks;
        }

        foreach (var element in list.EnumerateArray())
        {
            if (element.ValueKind != JsonValueKind.Object
                || !element.TryGetProperty("type", out var typeEl)
                || typeEl.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var hasEnabled = element.TryGetProperty("enabled", out var enabledEl)
                && (enabledEl.ValueKind == JsonValueKind.True || enabledEl.ValueKind == JsonValueKind.False);
            var enabled = hasEnabled && enabledEl.ValueKind == JsonValueKind.True;
            frameworks.Add((typeEl.GetString()!, enabled, hasEnabled));
        }

        return frameworks;
    }

    // ---------------------------------------------------------------- auth + body reader

    // RequireIdentity (401) → permission curriculum:manage (403). No school resolution here (each caller decides).
    private static (RequestContext Context, IResult? Error) Authorize(
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

        if (!context.Permissions.Contains(FormMapsPermissions.CurriculumManage))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // EmptyObject for an empty/whitespace body (express.json() yields {}); null when present-but-malformed JSON (→ 400).
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
}
