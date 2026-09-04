using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Gradebook;
using FormMaps.Application.Transcript;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Transcript + GPA surface — faithful port of legacy routes/transcript.ts, mounted at /api/v1/transcript
/// (index.ts:378, behind authenticate + tenantContext). All nine routes ship under the single lane flag
/// FORMMAPS_ROUTE_GRADUATION_TO_DOTNET (issue #55).
///
/// THREE DIFFERENT AUTHORIZATION SHAPES live in this one file, and they are NOT interchangeable:
///   * self routes (GET /, /gpa, POST /compute-gpa) gate on <c>userRole.toLowerCase() === "student"</c> and
///     resolve the school by a FRESH READ of users.schoolId for the caller;
///   * cross-student routes (/students/:id/*) gate on the RAW role string against the literal set
///     {counselor, parent, Super Admin, school_admin} — case-sensitive, so a "Counselor" or "Student" is 403 —
///     then run a per-role access check;
///   * school-admin routes gate on the RAW role being exactly "school_admin" or "Super Admin" and take the
///     school from the TOKEN claim (<c>req.schoolId</c>), NOT from a users read. That difference is real: a
///     token minted with a stale schoolId reaches a different school on these four routes than on the first
///     three. Ported as written.
///
/// formmaps#121 (transcript.ts:18-27): a parent has NO schoolId, so student_grades / student_gpas / users all
/// vanish under their own RLS session and the transcript rendered empty even after the link gate passed. For
/// that role ONLY, the reads run as <see cref="RequestContext.System"/>; the parentCanAccessStudent link check
/// immediately above is the authorization. Same shape, same rationale as TestScoreEndpoints.
/// </summary>
public static class TranscriptEndpoints
{
    public static IEndpointRouteBuilder MapTranscriptEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/transcript").WithTags("Transcript");

        group.MapGet("", GetOwnTranscriptAsync);
        group.MapGet("/gpa", GetOwnGpaAsync);
        group.MapPost("/compute-gpa", ComputeOwnGpaAsync);
        group.MapGet("/students/{id}/transcript", GetStudentTranscriptAsync);
        group.MapGet("/students/{id}/gpa", GetStudentGpaAsync);
        group.MapPut("/school-admin/gpa-config", PutGpaConfigAsync);
        group.MapGet("/school-admin/gpa-config", GetGpaConfigAsync);
        group.MapPost("/school-admin/class-ranks", PostClassRanksAsync);
        group.MapGet("/school-admin/class-ranks", GetClassRanksAsync);

        return app;
    }

    // ---------------------------------------------------------------- self routes (student only)

    // transcript.ts:29-37. No school -> the EMPTY transcript envelope with 200, not an error.
    private static async Task<IResult> GetOwnTranscriptAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireStudent(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await reader.GetUserSchoolIdAsync(context, context.Actor!.UserId, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = EmptyTranscript() });
        }

        var data = await reader.GetTranscriptDataAsync(context, context.Actor.UserId, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = TranscriptJson(data) });
    }

    // transcript.ts:39-45. A missing student_gpas row serializes as the JSON literal null.
    private static async Task<IResult> GetOwnGpaAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireStudent(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var gpa = await reader.GetStudentGpaAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = GpaJson(gpa) });
    }

    // transcript.ts:47-55. Unlike GET /, a school-less student here is a 400, not an empty body.
    private static async Task<IResult> ComputeOwnGpaAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ITranscriptReader reader, ITranscriptWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireStudent(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await reader.GetUserSchoolIdAsync(context, context.Actor!.UserId, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return BadRequest("Student is not associated with a school");
        }

        var gpa = await writer.ComputeAndPersistGpaAsync(context, context.Actor.UserId, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = GpaJson(gpa) });
    }

    // ---------------------------------------------------------------- cross-student routes

    // transcript.ts:57-70.
    private static async Task<IResult> GetStudentTranscriptAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, readContext, error) = await AuthorizeCrossStudentAsync(accessor, guard, reader, id, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var schoolId = await reader.GetUserSchoolIdAsync(readContext!, id, cancellationToken);
        if (string.IsNullOrEmpty(schoolId))
        {
            return Results.Ok(new { success = true, data = EmptyTranscript() });
        }

        var data = await reader.GetTranscriptDataAsync(readContext!, id, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = TranscriptJson(data) });
    }

    // transcript.ts:72-82.
    private static async Task<IResult> GetStudentGpaAsync(
        string id, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, readContext, error) = await AuthorizeCrossStudentAsync(accessor, guard, reader, id, cancellationToken);
        if (error is not null)
        {
            return error;
        }

        var gpa = await reader.GetStudentGpaAsync(readContext!, id, cancellationToken);
        return Results.Ok(new { success = true, data = GpaJson(gpa) });
    }

    // ---------------------------------------------------------------- school-admin routes

    // transcript.ts:86-104.
    private static async Task<IResult> PutGpaConfigAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = RequireSchoolAdmin(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return BadRequest("Invalid request body");
        }

        if (!GpaConfigBody.TryParse(body.Value, out var input, out var message))
        {
            return BadRequest(message);
        }

        var config = await writer.UpsertGpaConfigAsync(
            context, schoolId!, context.Actor!.UserId, input, cancellationToken);
        return Results.Ok(new { success = true, data = GpaConfigJson(config) });
    }

    // transcript.ts:106-115. NOTE the two shapes: a stored row is returned WHOLE (10 columns, with `scale` as a
    // Decimal STRING because legacy never coerces it), while the no-row fallback is a hand-built 4-key object
    // whose `scale` is the JS NUMBER 4. DIVERGENCE NOT MADE: the obvious fix is to coerce `scale` the way
    // serializeStudentGpa coerces the student_gpas Decimals, so both branches agree. Flipping a route flag must
    // be behaviour-neutral, so the string/number split is reproduced exactly and left for a follow-up.
    private static async Task<IResult> GetGpaConfigAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = RequireSchoolAdmin(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var config = await reader.GetGpaConfigAsync(context, schoolId!, cancellationToken);
        if (config is null)
        {
            return Results.Ok(new
            {
                success = true,
                data = new
                {
                    schoolId,
                    scale = 4.0d,
                    unweightedMap = GpaComputation.DefaultUnweightedMap,
                    weightBonuses = GpaComputation.DefaultWeightBonuses
                }
            });
        }

        return Results.Ok(new { success = true, data = GpaConfigJson(config) });
    }

    // transcript.ts:117-126.
    private static async Task<IResult> PostClassRanksAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptWriter writer,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = RequireSchoolAdmin(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await writer.ComputeClassRanksAsync(context, schoolId!, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = new { ranked = result.Ranked, classSize = result.ClassSize } });
    }

    // transcript.ts:128-136. NOTE the message here is "No school", not the "No school associated with this
    // account" the other three school-admin routes use — a legacy inconsistency, ported as written.
    private static async Task<IResult> GetClassRanksAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        CancellationToken cancellationToken)
    {
        var (context, schoolId, error) = RequireSchoolAdmin(accessor, guard, noSchoolMessage: "No school");
        if (error is not null)
        {
            return error;
        }

        var rows = await reader.GetClassRankingsAsync(context, schoolId!, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(ClassRankJson).ToList() });
    }

    // ---------------------------------------------------------------- guards

    // req.userRole?.toLowerCase() !== "student" -> 403 Forbidden.
    private static (RequestContext Context, IResult? Error) RequireStudent(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Deny(decision));
        }

        var role = context.Actor!.Role;
        return string.Equals(role?.ToLowerInvariant(), "student", StringComparison.Ordinal)
            ? (context, null)
            : (context, Forbidden("Forbidden"));
    }

    /// <summary>
    /// The /students/:id/* gate. RAW role against the literal set, then the per-role access check, then the
    /// read-context widening for parents only. Returns (callerContext, readContext, error).
    /// </summary>
    private static async Task<(RequestContext? Context, RequestContext? ReadContext, IResult? Error)> AuthorizeCrossStudentAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, ITranscriptReader reader,
        string studentId, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Deny(decision));
        }

        var role = context.Actor!.Role;
        // Case-SENSITIVE, exactly as legacy: "Counselor" / "Parent" / "SCHOOL_ADMIN" are all 403 here even though
        // FormMapsRoles.Normalize would accept them. This is the gate legacy ships.
        var allowed = string.Equals(role, FormMapsRoles.Counselor, StringComparison.Ordinal)
            || string.Equals(role, FormMapsRoles.Parent, StringComparison.Ordinal)
            || string.Equals(role, FormMapsRoles.SuperAdmin, StringComparison.Ordinal)
            || string.Equals(role, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal);
        if (!allowed)
        {
            return (context, null, Forbidden("Forbidden"));
        }

        if (string.Equals(role, FormMapsRoles.Counselor, StringComparison.Ordinal))
        {
            if (!await reader.CounselorCanAccessStudentAsync(context, context.Actor.UserId, studentId, cancellationToken))
            {
                return (context, null, Forbidden("Access denied"));
            }

            return (context, context, null);
        }

        if (string.Equals(role, FormMapsRoles.Parent, StringComparison.Ordinal))
        {
            if (!await reader.ParentCanAccessStudentAsync(context, context.Actor.UserId, studentId, cancellationToken))
            {
                return (context, null, Forbidden("Access denied"));
            }

            // formmaps#121: parents are school-less, so every subsequent read is System. The link check above,
            // run under the parent's OWN session against the column 009-parent-links.sql policies, is the gate.
            return (context, RequestContext.System(), null);
        }

        // Super Admin / school_admin: no per-student check at all in legacy — RLS is the only backstop, and it
        // is left in place (their own session, same school branch admits the row).
        return (context, context, null);
    }

    // req.userRole !== "school_admin" && req.userRole !== "Super Admin" -> 403; then req.schoolId (TOKEN claim).
    private static (RequestContext Context, string? SchoolId, IResult? Error) RequireSchoolAdmin(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        string noSchoolMessage = "No school associated with this account")
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, null, Deny(decision));
        }

        var role = context.Actor!.Role;
        if (!string.Equals(role, FormMapsRoles.SchoolAdmin, StringComparison.Ordinal)
            && !string.Equals(role, FormMapsRoles.SuperAdmin, StringComparison.Ordinal))
        {
            return (context, null, Forbidden("Forbidden"));
        }

        // req.schoolId = payload.schoolId || undefined (authenticate.ts:36) — the token claim, never a users read.
        var schoolId = context.Tenant?.SchoolId;
        return string.IsNullOrEmpty(schoolId)
            ? (context, null, BadRequest(noSchoolMessage))
            : (context, schoolId, null);
    }

    // ---------------------------------------------------------------- projections

    private static object EmptyTranscript() =>
        new { byYear = new Dictionary<string, object>(), gpaUnweighted = (double?)null, gpaWeighted = (double?)null, totalCredits = 0 };

    private static object TranscriptJson(StudentTranscript t) => new
    {
        byYear = t.ByYear,
        gpaUnweighted = t.GpaUnweighted,
        gpaWeighted = t.GpaWeighted,
        totalCredits = t.TotalCredits
    };

    private static object? GpaJson(StudentGpaRow? gpa) => gpa is null ? null : new
    {
        id = gpa.Id,
        userId = gpa.UserId,
        gpaUnweighted = gpa.GpaUnweighted,
        gpaWeighted = gpa.GpaWeighted,
        totalCredits = gpa.TotalCredits,
        classRank = gpa.ClassRank,
        classSize = gpa.ClassSize,
        rankPercentile = gpa.RankPercentile,
        yearlyBreakdown = gpa.YearlyBreakdown,
        computedAt = gpa.ComputedAt,
        isActive = gpa.IsActive,
        createdBy = gpa.CreatedBy,
        createdDate = gpa.CreatedDate,
        updatedBy = gpa.UpdatedBy,
        updatedAt = gpa.UpdatedAt
    };

    private static object GpaConfigJson(GpaConfigurationRow c) => new
    {
        id = c.Id,
        schoolId = c.SchoolId,
        scale = c.Scale,
        unweightedMap = c.UnweightedMap,
        weightBonuses = c.WeightBonuses,
        isActive = c.IsActive,
        createdBy = c.CreatedBy,
        createdDate = c.CreatedDate,
        updatedBy = c.UpdatedBy,
        updatedAt = c.UpdatedAt
    };

    // `gradeLevel: user?.gradeLevel` is undefined when the users row is invisible, and JSON.stringify DROPS an
    // undefined property. Two shapes rather than one with a null, so the key really is absent in that case.
    private static object ClassRankJson(ClassRankingRow r) => r.UserFound
        ? new
        {
            studentId = r.StudentId,
            studentName = r.StudentName,
            gradeLevel = r.GradeLevel,
            rank = r.Rank,
            gpa = r.Gpa,
            weightedGpa = r.WeightedGpa,
            totalCredits = r.TotalCredits,
            classSize = r.ClassSize,
            percentile = r.Percentile,
            computedAt = r.ComputedAt
        }
        : new
        {
            studentId = r.StudentId,
            studentName = r.StudentName,
            rank = r.Rank,
            gpa = r.Gpa,
            weightedGpa = r.WeightedGpa,
            totalCredits = r.TotalCredits,
            classSize = r.ClassSize,
            percentile = r.Percentile,
            computedAt = r.ComputedAt
        };

    // ---------------------------------------------------------------- envelopes + body

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult Forbidden(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    // Empty/whitespace body -> {} (express.json()); present-but-malformed JSON -> null (caller 400s). Same
    // contract as CalendarEndpoints/SchoolAdminEndpoints.
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
}
