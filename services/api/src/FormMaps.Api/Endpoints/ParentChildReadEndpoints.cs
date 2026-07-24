using FormMaps.Application.Auth;
using FormMaps.Application.ParentChildReads;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Parent child-link-scoped reads (FM-DOTNET-079 — routes/parent.ts, mounted /api/v1/parent). One dark flag
/// <c>FORMMAPS_ROUTE_PARENT_CHILD_READS_TO_DOTNET</c> co-flips two paths: GET /children/:studentId/progress and
/// GET /children/:studentId/course-plan. Both gated by an accepted+active StudentParentLink (IDOR corpus #1). progress
/// distinguishes the two failure modes (link → 403 "Not linked to this student"; student missing → 404 "Student not
/// found"); course-plan collapses both to 404 "Student not found" (existence-hiding). Disjoint from the FM-078
/// /:parentLinkId catch-all (3-seg vs 1-seg) and its lookahead already excludes `children`.
/// </summary>
public static class ParentChildReadEndpoints
{
    public static IEndpointRouteBuilder MapParentChildReadEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/parent").WithTags("ParentChildReads");
        group.MapGet("/children/{studentId}/progress", ProgressAsync);
        group.MapGet("/children/{studentId}/course-plan", CoursePlanAsync);
        return app;
    }

    private static async Task<IResult> ProgressAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentChildReader reader,
        string studentId, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var result = await reader.GetProgressAsync(context, context.Actor!.UserId, studentId, cancellationToken);
        return result.Outcome switch
        {
            ChildProgressOutcome.NotLinked => Forbidden("Not linked to this student"),
            ChildProgressOutcome.StudentNotFound => NotFound("Student not found"),
            _ => Results.Ok(new { success = true, data = ProgressJson(result.Data!) }),
        };
    }

    private static async Task<IResult> CoursePlanAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IParentChildReader reader,
        string studentId, CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null) return error;

        var result = await reader.GetCoursePlanAsync(context, context.Actor!.UserId, studentId, cancellationToken);
        return result.Linked
            ? Results.Ok(new { success = true, data = CoursePlanJson(result.Data!) })
            : NotFound("Student not found");
    }

    private static object ProgressJson(ChildProgress p) => new
    {
        student = new { id = p.Student.Id, name = p.Student.Name, gradeLevel = p.Student.GradeLevel },
        gpa = p.Gpa,
        isOnTrack = p.IsOnTrack,
        creditProgress = new { earned = p.CreditProgress.Earned, required = p.CreditProgress.Required, percentage = p.CreditProgress.Percentage },
        assessments = new
        {
            pca = new { completed = p.Assessments.PcaCompleted },
            mil = new { completed = p.Assessments.MilCompleted, total = p.Assessments.MilTotal, averageScore = p.Assessments.MilAverageScore },
            evaluation360 = new { total = p.Assessments.Evaluation360Total, completed = p.Assessments.Evaluation360Completed },
        },
    };

    private static object CoursePlanJson(ChildCoursePlan c) => new
    {
        target = c.Target is null ? null : new { universityName = c.Target.UniversityName, major = c.Target.Major },
        approvedPlan = c.ApprovedPlan is null
            ? null
            : new
            {
                approvedAt = c.ApprovedPlan.ApprovedAt,
                items = c.ApprovedPlan.Items.Select(i => new
                {
                    courseCode = i.CourseCode,
                    courseName = i.CourseName,
                    credits = i.Credits,
                    gradeLevel = i.GradeLevel,
                    term = i.Term,
                }),
            },
        currentCourses = c.CurrentCourses.Select(e => new { courseId = e.CourseId, term = e.Term, status = e.Status }),
    };

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

    private static IResult Forbidden(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);

    private static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
}
