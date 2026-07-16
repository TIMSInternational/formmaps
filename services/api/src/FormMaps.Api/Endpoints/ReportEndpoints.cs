using FormMaps.Application.Auth;
using FormMaps.Application.Reports;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

public static class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/reports")
            .WithTags("Reports");

        group.MapGet("/benchmark", GetBenchmarkAsync);
        group.MapGet("/user-report/{userId}", GetUserReportAsync);
        group.MapGet("/pca/{userId}", GetPcaReportAsync);
        group.MapGet("/lia/{userId}", GetLiaReportAsync);
        group.MapGet("/timeline/{userId}", GetTimelineReportAsync);
        group.MapGet("/coaching/{userId}", GetCoachingReportAsync);

        return app;
    }

    private static async Task<IResult> GetUserReportAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IUserReportReader reportReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireIdentity(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var report = await reportReader.ReadAsync(context, userId, cancellationToken);
        if (report is null)
        {
            return NotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                student = new
                {
                    id = report.Student.Id,
                    name = report.Student.Name,
                    email = report.Student.Email,
                    gradeLevel = report.Student.GradeLevel,
                    joinedAt = report.Student.JoinedAt
                },
                academic = new
                {
                    gpa = report.Academic.Gpa,
                    creditsEarned = report.Academic.CreditsEarned,
                    totalGrades = report.Academic.TotalGrades
                },
                assessments = new
                {
                    pca = new
                    {
                        completed = report.Assessments.Pca.Completed,
                        count = report.Assessments.Pca.Count
                    },
                    mil = new
                    {
                        completedExams = report.Assessments.Mil.CompletedExams,
                        totalExams = report.Assessments.Mil.TotalExams,
                        averageScore = report.Assessments.Mil.AverageScore
                    },
                    evaluation360 = new
                    {
                        total = report.Assessments.Evaluation360.Total,
                        completed = report.Assessments.Evaluation360.Completed
                    }
                },
                courses = new
                {
                    enrolled = report.Courses.Enrolled,
                    completed = report.Courses.Completed
                },
                generatedAt = report.GeneratedAt
            }
        });
    }

    private static async Task<IResult> GetPcaReportAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        IPcaReportReader reportReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireIdentity(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var report = await reportReader.ReadAsync(context, userId, cancellationToken);
        if (report is null)
        {
            return NotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = report.StudentId,
                studentName = report.StudentName,
                completed = report.Completed,
                evaluations = report.Evaluations.Select(evaluation => new
                {
                    id = evaluation.Id,
                    userId = evaluation.UserId,
                    pcaCod = evaluation.PcaCod,
                    isActive = evaluation.IsActive,
                    createdDate = evaluation.CreatedDate,
                    updatedAt = evaluation.UpdatedAt
                }),
                careerProfile = report.CareerProfile,
                generatedAt = report.GeneratedAt
            }
        });
    }

    private static async Task<IResult> GetLiaReportAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        ILiaReportReader reportReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireIdentity(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var report = await reportReader.ReadAsync(context, userId, cancellationToken);
        if (report is null)
        {
            return NotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = report.StudentId,
                studentName = report.StudentName,
                // Dictionary keys are serialized verbatim (Web defaults leave DictionaryKeyPolicy
                // null), preserving the PascalCase cognitive keys exactly as legacy emits them.
                cognitiveProfile = report.CognitiveProfile,
                overallScore = report.OverallScore,
                completedExams = report.CompletedExams,
                totalExams = report.TotalExams,
                strengths = report.Strengths,
                areasForGrowth = report.AreasForGrowth,
                generatedAt = report.GeneratedAt
            }
        });
    }

    private static async Task<IResult> GetTimelineReportAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        ITimelineReportReader reportReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireIdentity(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var report = await reportReader.ReadAsync(context, userId, cancellationToken);
        if (report is null)
        {
            return NotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = report.StudentId,
                studentName = report.StudentName,
                // TimelineEvent records omit the score key on evaluation/course events
                // (JsonIgnoreCondition.WhenWritingNull on a nullable Score).
                events = report.Events,
                totalEvents = report.TotalEvents,
                summary = new
                {
                    mil = report.Summary.Mil,
                    evaluations = report.Summary.Evaluations,
                    courses = report.Summary.Courses
                },
                generatedAt = report.GeneratedAt
            }
        });
    }

    private static async Task<IResult> GetCoachingReportAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IUserAccessGuard userAccessGuard,
        ICoachingReportReader reportReader,
        string userId,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireIdentity(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!await userAccessGuard.CanAccessUserAsync(context, userId, cancellationToken))
        {
            return NotFound();
        }

        var report = await reportReader.ReadAsync(context, userId, cancellationToken);
        if (report is null)
        {
            return NotFound();
        }

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                studentId = report.StudentId,
                studentName = report.StudentName,
                totalSessions = report.TotalSessions,
                completedSessions = report.CompletedSessions,
                totalSpent = report.TotalSpent,
                currency = report.Currency,
                reviewsGiven = report.ReviewsGiven,
                // CoachingSession records expose only id/coachName/coachSpecialization/date/
                // status/amount — sensitive booking and coach columns were never selected.
                sessions = report.Sessions,
                generatedAt = report.GeneratedAt
            }
        });
    }

    // IDOR defense: denial reveals nothing about existence — always 404 "Not found", never 403.
    private static IResult NotFound()
    {
        return Results.Json(
            new
            {
                success = false,
                message = "Not found"
            },
            statusCode: StatusCodes.Status404NotFound);
    }

    private static async Task<IResult> GetBenchmarkAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ISchoolBenchmarkReportReader reportReader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var guardDecision = protectedRequestGuard.RequireTenantContext(context);
        if (!guardDecision.Allowed)
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = guardDecision.Code,
                    message = guardDecision.Message
                },
                statusCode: guardDecision.StatusCode);
        }

        if (!context.Permissions.Contains(FormMapsPermissions.AnalyticsSchool))
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = "missing_permission",
                    message = "Insufficient permissions"
                },
                statusCode: StatusCodes.Status403Forbidden);
        }

        var schoolId = context.Tenant?.SchoolId;
        if (string.IsNullOrWhiteSpace(schoolId))
        {
            return Results.Json(
                new
                {
                    success = false,
                    code = "missing_school_context",
                    message = "School context is required for benchmark reports."
                },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var report = await reportReader.ReadAsync(context, schoolId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                totalStudents = report.TotalStudents,
                averageGpa = report.AverageGpa,
                pcaCompletionRate = report.PcaCompletionRate,
                milAverageScore = report.MilAverageScore,
                gpaDistribution = new
                {
                    above35 = report.GpaDistribution.Above35,
                    above30 = report.GpaDistribution.Above30,
                    above25 = report.GpaDistribution.Above25,
                    below25 = report.GpaDistribution.Below25
                },
                generatedAt = report.GeneratedAt
            }
        });
    }
}
