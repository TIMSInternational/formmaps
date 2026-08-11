using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Authed test-scores endpoints (legacy routes/test-scores.ts, mounted /api/v1/test-scores with authenticate +
/// tenantContext — no subscription, no permission; self-scoped ownership per handler). Reads: GET /superscore +
/// GET /college-fit (self, RequireIdentity only) + GET /students/{id}/test-scores (bespoke role auth). Bare-path
/// list + writes: GET / (own active scores), POST / (create for self), PUT /{id} + DELETE /{id} (own-active-row
/// gate → uniform 404). The bare path + /{id} path cut over together (Next rewrites match by path, not method).
/// </summary>
public static class TestScoreEndpoints
{
    public static IEndpointRouteBuilder MapTestScoreEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/test-scores").WithTags("TestScores");

        group.MapGet("/superscore", GetSuperscoreAsync);
        group.MapGet("/college-fit", GetCollegeFitAsync);
        group.MapGet("/students/{id}/test-scores", GetStudentScoresAsync);
        group.MapGet("/", ListMyScoresAsync);
        group.MapPost("/", CreateScoreAsync);
        group.MapPut("/{id}", UpdateScoreAsync);
        group.MapDelete("/{id}", DeleteScoreAsync);

        return app;
    }

    // GET / — the caller's own active scores (optional ?testType filter), testDate DESC.
    private static async Task<IResult> ListMyScoresAsync(
        HttpContext http,
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

        var testType = http.Request.Query["testType"].Count > 0 ? http.Request.Query["testType"][0] : null;
        var data = await reader.ListActiveScoresAsync(
            context, context.Actor!.UserId, string.IsNullOrEmpty(testType) ? null : testType, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    // POST / — create a score for the caller.
    private static async Task<IResult> CreateScoreAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreWriter writer,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        var outcome = await writer.CreateAsync(context, context.Actor!.UserId, body, cancellationToken);
        return outcome.Status switch
        {
            TestScoreWriteStatus.Created => Results.Json(new { success = true, data = outcome.Row }, statusCode: StatusCodes.Status201Created),
            _ => ValidationError(outcome.Message),
        };
    }

    // PUT /{id} — update an own, active score (ownership 404 precedes validation 400).
    private static async Task<IResult> UpdateScoreAsync(
        HttpContext http,
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreWriter writer,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        var outcome = await writer.UpdateAsync(context, context.Actor!.UserId, id, body, cancellationToken);
        return outcome.Status switch
        {
            TestScoreWriteStatus.Ok => Results.Ok(new { success = true, data = outcome.Row }),
            TestScoreWriteStatus.ValidationError => ValidationError(outcome.Message),
            _ => TestScoreNotFound(),
        };
    }

    // DELETE /{id} — soft-delete an own, active score.
    private static async Task<IResult> DeleteScoreAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        ITestScoreWriter writer,
        string id,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var identity = protectedRequestGuard.RequireIdentity(context);
        if (!identity.Allowed)
        {
            return Deny(identity);
        }

        var deleted = await writer.DeleteAsync(context, context.Actor!.UserId, id, cancellationToken);
        return deleted
            ? Results.Ok(new { success = true, message = "Test score deleted successfully" })
            : TestScoreNotFound();
    }

    private static IResult ValidationError(string? message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    // Uniform IDOR 404 for the writes (missing == not-owned == already-deleted), legacy "Test score not found".
    private static IResult TestScoreNotFound() =>
        Results.Json(new { success = false, message = "Test score not found" }, statusCode: StatusCodes.Status404NotFound);

    // Empty-object sentinel for an absent/malformed body (legacy express.json() yields {} -> zod "Required"
    // on create / no-op on update). A PRESENT non-object body (array/primitive) is preserved verbatim so the
    // validator can reject it with "Expected object, received <type>" (matches legacy z.object(...)).
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    private static async Task<JsonElement> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        try
        {
            var element = await http.Request.ReadFromJsonAsync<JsonElement>(cancellationToken);
            return element.ValueKind == JsonValueKind.Undefined ? EmptyObject : element;
        }
        catch (JsonException)
        {
            return EmptyObject;
        }
        catch (BadHttpRequestException)
        {
            return EmptyObject;
        }
        catch (InvalidOperationException)
        {
            // No / non-JSON Content-Type on an empty request — legacy express.json() yields {} here.
            return EmptyObject;
        }
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

        // formmaps#121. A parent has NO schoolId, so student_test_scores' school-inherit policy admits none of the
        // child's rows under the parent's own session — the list came back empty even once the gate passed. The
        // parent link check below is the authorization: explicit, named on parentUserId, and not leaning on RLS.
        // Only after it passes is the READ widened to a system session, and only for that role. A counselor shares
        // the student's school, so RLS stays a real backstop on their path and it is left untouched.
        var readAsParent = false;
        if (string.Equals(role, FormMapsRoles.Counselor, StringComparison.Ordinal))
        {
            if (!await reader.HasActiveCounselorAssignmentAsync(context, context.Actor.UserId, studentId, cancellationToken))
            {
                return Results.Json(new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
            }
        }
        else if (string.Equals(role, FormMapsRoles.Parent, StringComparison.Ordinal))
        {
            if (!await reader.HasActiveParentLinkAsync(context, studentId, context.Actor.UserId, cancellationToken))
            {
                return Results.Json(
                    new { success = false, message = "Forbidden: no active parent link" },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            readAsParent = true;
        }
        else
        {
            return Results.Json(new { success = false, message = "Forbidden" }, statusCode: StatusCodes.Status403Forbidden);
        }

        var testType = http.Request.Query["testType"].Count > 0 ? http.Request.Query["testType"][0] : null;
        var readContext = readAsParent ? RequestContext.System() : context;
        var data = await reader.ListActiveScoresAsync(readContext, studentId, string.IsNullOrEmpty(testType) ? null : testType, cancellationToken);
        return Results.Ok(new { success = true, data });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);
}
