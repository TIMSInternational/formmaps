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

        return app;
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
