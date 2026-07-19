using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Authed test-scores READ endpoints (legacy routes/test-scores.ts, mounted /api/v1/test-scores with
/// authenticate + tenantContext). Ported: GET /superscore + GET /college-fit (self-scoped via the request
/// actor, RequireIdentity only) and GET /students/{id}/test-scores (bespoke role auth — counselor needs an
/// active assignment [miss → 404], parent needs an active link [miss → 403]; any other role → 403). The
/// list GET / and the POST/PUT/DELETE writes share the bare /api/v1/test-scores path and cut over in a
/// later write slice.
/// </summary>
public static class TestScoreEndpoints
{
    public static IEndpointRouteBuilder MapTestScoreEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/test-scores").WithTags("TestScores");

        group.MapGet("/superscore", GetSuperscoreAsync);
        group.MapGet("/college-fit", GetCollegeFitAsync);
        group.MapGet("/students/{id}/test-scores", GetStudentScoresAsync);

        return app;
    }

    // GET /superscore — the caller's own SAT/ACT superscore.
    private static async Task<IResult> GetSuperscoreAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var data = await reader.GetSuperscoreAsync(context, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /college-fit — the caller's SAT superscore vs the university catalog.
    private static async Task<IResult> GetCollegeFitAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreReader reader,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var data = await reader.GetCollegeFitAsync(context, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // GET /students/{id}/test-scores — counselor/parent view of a student's scores (bespoke role auth).
    private static async Task<IResult> GetStudentScoresAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreReader reader,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var studentId = id.Length > 100 ? id[..100] : id;
        var role = context.Actor!.Role;

        if (string.Equals(role, FormMapsRoles.Counselor, StringComparison.Ordinal))
        {
            if (!await reader.HasActiveCounselorAssignmentAsync(context, context.Actor.UserId, studentId, cancellationToken))
            {
                return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
            }
        }
        else if (string.Equals(role, FormMapsRoles.Parent, StringComparison.Ordinal))
        {
            var parentEmail = (context.Actor.Email ?? string.Empty).Trim().ToLowerInvariant();
            if (!await reader.HasActiveParentLinkAsync(context, studentId, parentEmail, cancellationToken))
            {
                return Results.Json(
                    new { success = false, message = "Forbidden: no active parent link" },
                    statusCode: StatusCodes.Status403Forbidden);
            }
        }
        else
        {
            return Results.Json(new { success = false, message = "Forbidden" }, statusCode: StatusCodes.Status403Forbidden);
        }

        var testType = http.Request.Query["testType"].Count > 0 ? http.Request.Query["testType"][0] : null;
        var data = await reader.ListActiveScoresAsync(context, studentId, string.IsNullOrEmpty(testType) ? null : testType, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
