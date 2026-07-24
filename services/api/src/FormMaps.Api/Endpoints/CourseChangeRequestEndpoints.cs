using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Student course change-requests CRUD (FM-DOTNET-085 — routes/course-plan.ts L92-143, mounted /api/v1/student). One
/// dark flag <c>FORMMAPS_ROUTE_STUDENT_CHANGE_REQUESTS_TO_DOTNET</c> co-flips two PATHS (Next matches path-not-method):
/// POST+GET /course-plan/change-requests, DELETE /course-plan/change-requests/:requestId. Self-scoped — RequireIdentity
/// only, gated per-endpoint by requireSchoolMembership. Disjoint from the FM-084 /course-plan[/courses] sources and the
/// Node-only /course-plan/recommendations|eligibility siblings (later slice).
/// </summary>
public static class CourseChangeRequestEndpoints
{
    private const string NoSchoolMessage = "You are not affiliated with a school";
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapCourseChangeRequestEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentCoursePlan");
        group.MapPost("/course-plan/change-requests", CreateAsync);
        group.MapGet("/course-plan/change-requests", ListAsync);
        group.MapDelete("/course-plan/change-requests/{requestId}", DeleteAsync);
        return app;
    }

    private static async Task<IResult> CreateAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICourseChangeRequestRepository repository,
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
            return InternalError(); // malformed / primitive → 500
        }

        var outcome = await repository.CreateAsync(context, context.Actor!.UserId, body.Value, cancellationToken);
        return outcome.Status switch
        {
            CreateChangeRequestStatus.NoSchool => BadRequest(NoSchoolMessage),
            CreateChangeRequestStatus.InvalidBody => InternalError(),
            _ => Results.Json(new { success = true, data = RowJson(outcome.Row!) }, statusCode: StatusCodes.Status201Created)
        };
    }

    private static async Task<IResult> ListAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICourseChangeRequestRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var page = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(http.Request.Query["page"]), 1));
        var limit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(http.Request.Query["limit"]), 20)));
        var status = http.Request.Query["status"].FirstOrDefault();

        var view = await repository.ListAsync(context, context.Actor!.UserId, status, page, limit, cancellationToken);

        if (!view.HasSchool)
        {
            return Results.Ok(new
            {
                success = true,
                data = new { data = Array.Empty<object>(), total = 0, page, limit, totalPages = 0 }
            });
        }

        var totalPages = (int)Math.Ceiling((double)view.Total / limit);
        return Results.Ok(new
        {
            success = true,
            data = new { data = view.Data.Select(RowJson), total = view.Total, page, limit, totalPages }
        });
    }

    private static async Task<IResult> DeleteAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICourseChangeRequestRepository repository,
        string requestId,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var status = await repository.DeleteAsync(context, context.Actor!.UserId, requestId, cancellationToken);
        return status switch
        {
            DeleteChangeRequestStatus.NoSchool => BadRequest(NoSchoolMessage),
            DeleteChangeRequestStatus.CannotCancel => BadRequest("Cannot cancel"),
            _ => Results.Ok(new { success = true })
        };
    }

    // Raw Prisma courseChangeRequest row (schema field order). credits is a decimal.js STRING.
    private static object RowJson(CourseChangeRequestRow r) => new
    {
        id = r.Id,
        studentId = r.StudentId,
        schoolId = r.SchoolId,
        courseId = r.CourseId,
        courseCode = r.CourseCode,
        courseName = r.CourseName,
        credits = r.Credits,
        gradeLevel = r.GradeLevel,
        semester = r.Semester,
        action = r.Action,
        dueDate = r.DueDate,
        studentNote = r.StudentNote,
        status = r.Status,
        counselorNote = r.CounselorNote,
        reviewedBy = r.ReviewedBy,
        reviewedAt = r.ReviewedAt,
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
            return EmptyObject; // express.json → {} → courseId undefined → Prisma missing → 500 (deferred past the 400)
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
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

    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult InternalError() =>
        Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
}
