using FormMaps.Application.AcademicGaps;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// FM-DOTNET-080 — the 3 non-AI reads of routes/academic-gaps.ts (GET /summary, /students/{studentId},
/// /recommendations/{studentId}), mounted /api/v1/school-admin/academic-gaps under one dark flag
/// <c>FORMMAPS_ROUTE_ACADEMIC_GAPS_TO_DOTNET</c>. The 4th route /ai-recommendations/{studentId} is Bedrock and
/// STAYS in Node (a distinct literal segment — no collision, no negative-lookahead needed).
///
/// <para>Auth chain per endpoint: RequireIdentity (401) → coarse permission <c>grades:read</c> (403 "Insufficient
/// permissions", the router-level requirePermission) → getUserAndSchool: the caller's own schoolId null → 400
/// "No school linked"; roleName.ToLowerInvariant() not in { school_admin, counselor } → 403 "Forbidden". A
/// counselor is additionally scoped to their active assignments. The two detail reads return 404 "Student not
/// found" for a missing student / wrong school / counselor-unassigned (legacy collapses all three).</para>
/// </summary>
public static class AcademicGapsEndpoints
{
    private const string SchoolAdminRole = "school_admin";
    private const string CounselorRole = "counselor";

    public static IEndpointRouteBuilder MapAcademicGapsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/school-admin/academic-gaps").WithTags("AcademicGaps");

        group.MapGet("/summary", GetSummaryAsync);
        group.MapGet("/students/{studentId}", GetStudentDetailAsync);
        group.MapGet("/recommendations/{studentId}", GetRecommendationsAsync);

        return app;
    }

    private static async Task<IResult> GetSummaryAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IAcademicGapsReader reader,
        CancellationToken cancellationToken)
    {
        var auth = await AuthorizeAsync(accessor, guard, reader, cancellationToken);
        if (auth.Error is not null)
        {
            return auth.Error;
        }

        var load = await reader.GetSummaryLoadAsync(
            auth.Context, auth.SchoolId!, auth.CounselorScoped, auth.Context.Actor!.UserId, cancellationToken);
        var result = AcademicGapsComputer.ComputeSummary(load);

        // Empty branch (no rules or no students) → { data: [] } with NO summary key.
        if (result.Summary is null)
        {
            return Results.Ok(new { success = true, data = new { data = Array.Empty<object>() } });
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.PerStudent.Select(StudentRowJson),
                summary = new
                {
                    totalStudents = result.Summary.TotalStudents,
                    onTrack = result.Summary.OnTrack,
                    atRisk = result.Summary.AtRisk,
                    offTrack = result.Summary.OffTrack
                }
            }
        });
    }

    private static async Task<IResult> GetStudentDetailAsync(
        string studentId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IAcademicGapsReader reader,
        CancellationToken cancellationToken)
    {
        var auth = await AuthorizeAsync(accessor, guard, reader, cancellationToken);
        if (auth.Error is not null)
        {
            return auth.Error;
        }

        var load = await reader.GetStudentDetailLoadAsync(
            auth.Context, auth.SchoolId!, auth.CounselorScoped, auth.Context.Actor!.UserId, studentId, cancellationToken);
        if (load is null)
        {
            return NotFoundStudent();
        }

        // No current AY / no rule set → the 3-field empty shape (NO studentId/name/gradeLevel — legacy asymmetry).
        if (!load.HasRules)
        {
            return Results.Ok(new { success = true, data = new { gaps = Array.Empty<object>(), creditsEarned = 0, creditsRequired = 0 } });
        }

        var result = AcademicGapsComputer.ComputeStudentDetail(load);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = result.StudentId,
                studentName = result.StudentName,
                gradeLevel = result.GradeLevel,
                creditsEarned = result.CreditsEarned,
                creditsRequired = result.CreditsRequired,
                gaps = result.Gaps.Select(g => new
                {
                    area = g.Area,
                    earned = g.Earned,
                    required = g.Required,
                    shortfall = g.Shortfall
                })
            }
        });
    }

    private static async Task<IResult> GetRecommendationsAsync(
        string studentId,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IAcademicGapsReader reader,
        CancellationToken cancellationToken)
    {
        var auth = await AuthorizeAsync(accessor, guard, reader, cancellationToken);
        if (auth.Error is not null)
        {
            return auth.Error;
        }

        var load = await reader.GetRecommendationsLoadAsync(
            auth.Context, auth.SchoolId!, auth.CounselorScoped, auth.Context.Actor!.UserId, studentId, cancellationToken);
        if (load is null)
        {
            return NotFoundStudent();
        }

        if (!load.HasRules)
        {
            return Results.Ok(new { success = true, data = new { recommendations = Array.Empty<object>() } });
        }

        var result = AcademicGapsComputer.ComputeRecommendations(load);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                recommendations = result.Recommendations.Select(r => new
                {
                    courseId = r.CourseId,
                    courseCode = r.CourseCode,
                    courseName = r.CourseName,
                    credits = r.Credits,
                    category = r.Category,
                    reason = r.Reason
                })
            }
        });
    }

    // getUserAndSchool + the router-level requirePermission("grades:read"). Returns the resolved school + a
    // counselor flag, or a ready-made error IResult.
    private static async Task<AuthResult> AuthorizeAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        IAcademicGapsReader reader,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return AuthResult.Failed(context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.GradesRead))
        {
            return AuthResult.Failed(context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        var scope = await reader.ResolveScopeAsync(context, context.Actor!.UserId, cancellationToken);
        if (string.IsNullOrEmpty(scope.SchoolId))
        {
            return AuthResult.Failed(context, Results.Json(
                new { success = false, message = "No school linked" },
                statusCode: StatusCodes.Status400BadRequest));
        }

        var role = scope.RoleName?.ToLowerInvariant();
        if (role != SchoolAdminRole && role != CounselorRole)
        {
            return AuthResult.Failed(context, Results.Json(
                new { success = false, message = "Forbidden" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return new AuthResult(context, scope.SchoolId, role == CounselorRole, null);
    }

    private static IResult NotFoundStudent() =>
        Results.Json(new { success = false, message = "Student not found" }, statusCode: StatusCodes.Status404NotFound);

    private static object StudentRowJson(StudentGapRow s) => new
    {
        studentId = s.StudentId,
        studentName = s.StudentName,
        gradeLevel = s.GradeLevel,
        overallStatus = s.OverallStatus,
        creditDeficit = s.CreditDeficit,
        missingRequiredCourses = s.MissingRequiredCourses,
        creditsEarned = s.CreditsEarned,
        creditsRequired = s.CreditsRequired,
        progressPercent = s.ProgressPercent,
        topGap = s.TopGap
    };

    private readonly record struct AuthResult(RequestContext Context, string? SchoolId, bool CounselorScoped, IResult? Error)
    {
        public static AuthResult Failed(RequestContext context, IResult error) => new(context, null, false, error);
    }
}
