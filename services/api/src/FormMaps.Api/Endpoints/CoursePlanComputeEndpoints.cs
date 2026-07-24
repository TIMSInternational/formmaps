using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.StudentCoursePlan;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// The two course-plan.ts compute reads (FM-DOTNET-086 — L149-200, mounted /api/v1/student). One dark flag
/// <c>FORMMAPS_ROUTE_STUDENT_COURSE_PLAN_COMPUTE_TO_DOTNET</c> co-flips both GET paths (path-not-method):
/// GET /course-plan/recommendations, GET /course-plan/eligibility. Self-scoped — RequireIdentity only. Completes the
/// course-plan.ts mini-phase; /course-plan/recommendations is LOCAL keyword scoring (NOT Bedrock).
/// </summary>
public static class CoursePlanComputeEndpoints
{
    public static IEndpointRouteBuilder MapCoursePlanComputeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("StudentCoursePlan");
        group.MapGet("/course-plan/recommendations", RecommendationsAsync);
        group.MapGet("/course-plan/eligibility", EligibilityAsync);
        return app;
    }

    private static async Task<IResult> RecommendationsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICoursePlanComputeReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var data = await reader.GetRecommendationsAsync(context, context.Actor!.UserId, cancellationToken);
        var v = data.Verdict;

        if (!data.Done)
        {
            // Gate: no recommendations until all 3 assessments are complete.
            return Results.Ok(new
            {
                success = true,
                data = Array.Empty<object>(),
                locked = true,
                completion = CompletionJson(v)
            });
        }

        var scored = CoursePlanRecommendationsScorer.Score(data.Courses, data.EnrolledCourseIds, data.PreferredFieldsLower);
        return Results.Ok(new { success = true, data = scored.Select(x => CourseJson(x.Course, x.MatchScore)) });
    }

    private static async Task<IResult> EligibilityAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICoursePlanComputeReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireSelf(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var entries = await reader.GetEligibilityAsync(context, context.Actor!.UserId, cancellationToken);
        if (entries is null)
        {
            return Results.Ok(new { success = true, data = Array.Empty<object>() }); // no school
        }

        return Results.Ok(new
        {
            success = true,
            data = entries.Select(e => new { courseId = e.CourseId, courseCode = e.CourseCode, eligible = e.Eligible, missing = e.MissingCodes })
        });
    }

    // computeStudentCompletion's return shape (7 fields — readyForInsights == allDone; the ported verdict carries 6).
    private static object CompletionJson(StudentCompletionVerdict v) => new
    {
        liaCompleted = v.LiaCompleted,
        liaTotal = v.LiaTotal,
        evalCompleted = v.EvalCompleted,
        evalTotal = v.EvalTotal,
        pcaCompleted = v.PcaCompleted,
        allDone = v.AllDone,
        readyForInsights = v.AllDone
    };

    // Raw Prisma Course row (schema field order) + matchScore (spread `{...c, matchScore}`). rating/recommendedScore
    // are decimal.js STRINGS; the array columns are arrays; syllabus is verbatim jsonb; dates ISO-Z.
    private static object CourseJson(CourseRow c, int matchScore) => new
    {
        id = c.Id,
        title = c.Title,
        shortDescription = c.ShortDescription,
        fullDescription = c.FullDescription,
        provider = c.Provider,
        instructor = c.Instructor,
        category = c.Category,
        subcategory = c.Subcategory,
        difficulty = c.Difficulty,
        duration = c.Duration,
        durationUnit = c.DurationUnit,
        estimatedHours = c.EstimatedHours,
        thumbnailUrl = c.ThumbnailUrl,
        videoUrl = c.VideoUrl,
        courseraUrl = c.CourseraUrl,
        externalId = c.ExternalId,
        rating = c.Rating,
        reviewCount = c.ReviewCount,
        enrollmentCount = c.EnrollmentCount,
        certificate = c.Certificate,
        language = c.Language,
        country = c.Country,
        region = c.Region,
        skills = c.Skills,
        matchingCompetencies = c.MatchingCompetencies,
        careerPaths = c.CareerPaths,
        learningObjectives = c.LearningObjectives,
        prerequisites = c.Prerequisites,
        syllabus = c.Syllabus,
        recommendedScore = c.RecommendedScore,
        sourceUrl = c.SourceUrl,
        isActive = c.IsActive,
        createdBy = c.CreatedBy,
        createdDate = c.CreatedDate,
        updatedBy = c.UpdatedBy,
        updatedAt = c.UpdatedAt,
        matchScore
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
}
