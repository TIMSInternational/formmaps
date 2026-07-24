using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student course-planning CRUD (FM-DOTNET-084 — routes/course-plan.ts, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_TO_DOTNET</c> co-flips three PATHS (Next matches path-not-method):
/// GET /course-plan, POST /course-plan/courses, DELETE /course-plan/courses/:courseId. Self-scoped — RequireIdentity
/// only (req.userId), gated per-endpoint by requireSchoolMembership (a fresh users read of the caller's schoolId):
/// GET → the empty 200 shape when school-less, POST/DELETE → 400. The change-requests / recommendations / eligibility
/// paths on this router stay Node (later slices) — distinct paths, no collision.
/// </summary>
public static class StudentCoursePlanEndpoints
{
    private const string NoSchoolMessage = "You are not affiliated with a school";
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapStudentCoursePlanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentCoursePlan");
        group.MapGet("/course-plan", GetAsync);
        group.MapPost("/course-plan/courses", CreateAsync);
        group.MapDelete("/course-plan/courses/{courseId}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> GetAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentCoursePlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // qs(req.query.academicYearId): first value (arrays → [0]); null/empty → resolve the current year.
        var academicYearId = http.Request.Query["academicYearId"].FirstOrDefault();

        var view = await repository.GetCoursePlanAsync(context, context.Actor!.UserId, academicYearId, cancellationToken);

        if (!view.HasSchool)
        {
            return Results.Ok(new
            {
                success = true,
                data = new { plan = new { enrollments = Array.Empty<object>() }, recommendations = Array.Empty<object>() }
            });
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                plan = new
                {
                    studentId = context.Actor!.UserId,
                    gradeLevel = view.GradeLevel,
                    enrollments = view.Enrollments.Select(RowJson),
                    totalCreditsEarned = view.TotalCreditsEarned
                },
                recommendations = Array.Empty<object>()
            }
        });
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentCoursePlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return InternalError(); // malformed / primitive body → express.json rejects pre-route → 500
        }

        var outcome = await repository.CreateCourseAsync(context, context.Actor!.UserId, body.Value, cancellationToken);
        return outcome.Status switch
        {
            CreateCoursePlanStatus.NoSchool => BadRequest(NoSchoolMessage),
            CreateCoursePlanStatus.NoCurrentYear => BadRequest("No current academic year"),
            CreateCoursePlanStatus.InvalidBody => InternalError(),
            _ => Results.Json(new { success = true }, statusCode: StatusCodes.Status201Created)
        };
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IStudentCoursePlanRepository repository,
        string courseId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var status = await repository.DeleteCourseAsync(context, context.Actor!.UserId, courseId, cancellationToken);
        return status == DeleteCoursePlanStatus.NoSchool
            ? BadRequest(NoSchoolMessage)
            : Results.Ok(new { success = true });
    }

    // Raw Prisma studentCoursePlan row (schema field order).
    private static object RowJson(CoursePlanRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        schoolId = r.SchoolId,
        academicYearId = r.AcademicYearId,
        term = r.Term,
        courseId = r.CourseId,
        status = r.Status,
        sortOrder = r.SortOrder,
        notes = r.Notes,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt
    };

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject; // express.json → {} → courseId undefined → Prisma missing → 500 (deferred past the 400s)
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            // express.json({strict:true}) accepts only objects/arrays; a top-level PRIMITIVE is rejected pre-route → 500.
            // An array is accepted → reaches the handler as body.courseId undefined → 500 (deferred).
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null; // primitive → 500
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

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

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
