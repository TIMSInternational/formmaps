using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// The student graduation-plan surface — faithful port of legacy routes/graduation-plan.ts, mounted at
/// /api/v1/student (index.ts:327, behind authenticate + tenantContext). SIX of its seven routes ship here under
/// the existing lane flag FORMMAPS_ROUTE_GRADUATION_TO_DOTNET (issue #55).
///
/// <para>NOT PORTED, and never will be — DECISION D1: POST /graduation-plan/generate (graduation-plan.ts:50) is
/// aiLimiter-rate-limited (index.ts:306) and calls Bedrock through generateDraftPlan + generateRationale. It
/// stays on Node permanently and already has an UNCONDITIONAL carve-out at the top of next.config.ts's rewrite
/// array, ahead of every flag-gated rule. Nothing in this file may claim that path.</para>
///
/// <para>THE PATH SHAPE MATTERS. /api/v1/student/graduation-plan/target, /submit and /supplemental are all
/// DEEPER than the bare /api/v1/student/graduation-plan, and /generate sits at the same depth as /target and
/// /submit — so the rewrite entries must be literal paths, never a /api/v1/student/graduation-plan/:path*
/// prefix, which would swallow the D1 carve-out if it were ever reordered below this block.</para>
///
/// <para>GUARD, deliberately thin: <c>authenticate</c> at the mount and NOTHING else. Legacy declares no
/// requirePermission and no role check on any of these six — every one is implicitly self-scoped by passing
/// <c>req.userId</c> straight into the service. That is reproduced as RequireIdentity plus a repository that
/// only ever takes the caller's own id; there is no path here that accepts a studentId from the client.</para>
///
/// <para>ERROR ENVELOPE: legacy's PLAN_ERROR_STATUS table (graduation-plan.ts:14-18) maps PlanError codes to
/// statuses. Of the seven codes only NO_DRAFT is reachable from the six ported routes — the rest are thrown
/// exclusively by generateDraftPlan, which stays on Node. NO_DRAFT is 400 with
/// <c>{ success:false, code, message:"Plan request cannot be fulfilled" }</c>.</para>
/// </summary>
public static class GraduationPlanEndpoints
{
    public static IEndpointRouteBuilder MapGraduationPlanEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/student").WithTags("GraduationPlan");

        group.MapGet("/graduation-plan/target", GetTargetAsync);
        group.MapPut("/graduation-plan/target", PutTargetAsync);
        group.MapGet("/graduation-plan/supplemental", GetSupplementalAsync);
        group.MapGet("/graduation-plan", GetPlanAsync);
        group.MapPost("/graduation-plan/submit", SubmitPlanAsync);
        group.MapDelete("/graduation-plan", DiscardDraftAsync);

        return app;
    }

    // ---------------------------------------------------------------- target

    // graduation-plan.ts:28-33.
    private static async Task<IResult> GetTargetAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IGraduationPlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await repository.GetTargetOrSuggestionAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = TargetJson(result) });
    }

    // graduation-plan.ts:35-48. The ONLY body validation legacy performs on this route.
    private static async Task<IResult> PutTargetAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IGraduationPlanRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            // Malformed JSON never reaches the handler in express either — express.json() rejects it first.
            // Same 400 and same envelope as the landed lanes (GraduationRulesEndpoints / TranscriptEndpoints).
            return BadRequest("Invalid request body");
        }

        // `typeof major !== "string" || major.trim().length === 0` — a number, null, or a whitespace-only
        // string are all "major required". Note the trim happens for the CHECK and for the stored value.
        if (!TryGetString(body.Value, "major", out var major) || major!.Trim().Length == 0)
        {
            return BadRequest("major required");
        }

        // `typeof universityId === "string" ? universityId : undefined` — a NUMBER universityId is dropped, not
        // stringified, so it never reaches the university lookup.
        TryGetString(body.Value, "universityId", out var universityId);
        TryGetString(body.Value, "universityName", out var universityName);

        // req.schoolId ?? null — the TOKEN claim, not a users read.
        var saved = await repository.SetTargetAsync(
            context,
            context.Actor!.UserId,
            string.IsNullOrEmpty(context.Tenant?.SchoolId) ? null : context.Tenant.SchoolId,
            new SetTargetInput(universityId, universityName, major.Trim()),
            cancellationToken);

        return Results.Ok(new { success = true, data = SavedTargetJson(saved) });
    }

    // ---------------------------------------------------------------- plan

    // graduation-plan.ts:69-74. A student with no plan is a 200 with `data: null`, not a 404.
    private static async Task<IResult> GetPlanAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IGraduationPlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var plan = await repository.GetCurrentPlanAsync(context, context.Actor!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = PlanJson(plan) });
    }

    // graduation-plan.ts:76-84. NO_DRAFT is the only PlanError reachable here.
    private static async Task<IResult> SubmitPlanAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IGraduationPlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var result = await repository.SubmitPlanAsync(context, context.Actor!.UserId, cancellationToken);
        if (!result.HadDraft)
        {
            return PlanError("NO_DRAFT", StatusCodes.Status400BadRequest);
        }

        return Results.Ok(new { success = true, data = PlanJson(result.Plan) });
    }

    // graduation-plan.ts:86-92. The success body is `{ success: true }` with NO data key at all.
    private static async Task<IResult> DiscardDraftAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IGraduationPlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var discarded = await repository.DiscardDraftAsync(context, context.Actor!.UserId, cancellationToken);
        return discarded
            ? Results.Ok(new { success = true })
            : NotFound("No draft to discard");
    }

    // graduation-plan.ts:94-99. No AI anywhere on this path despite the name.
    private static async Task<IResult> GetSupplementalAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IGraduationPlanRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireIdentity(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var courses = await repository.GetSupplementalRecommendationsAsync(
            context, context.Actor!.UserId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = courses.Select(c => new
            {
                id = c.Id,
                title = c.Title,
                provider = c.Provider,
                category = c.Category,
                rating = c.Rating,
                matchScore = c.MatchScore,
                fillsGap = c.FillsGap,
                reason = c.Reason
            }).ToList()
        });
    }

    // ---------------------------------------------------------------- projections

    /// <summary>
    /// TWO SHAPES, not one with nulls. A saved target is the nine-key <c>targetDto</c>
    /// (graduationPlanService.ts:32); a suggestion is a four-key literal (:54) with no id / fieldKey /
    /// selectivityTier / templateKey / templateLabel property at all, because JSON.stringify drops the
    /// undefineds the TypeScript interface declares as optional.
    /// </summary>
    internal static object? TargetJson(TargetOrSuggestion result)
    {
        if (result.Saved is not null)
        {
            return SavedTargetJson(result.Saved);
        }

        if (result.Suggested is null)
        {
            return null;
        }

        return new
        {
            universityId = result.Suggested.UniversityId,
            universityName = result.Suggested.UniversityName,
            major = result.Suggested.Major,
            suggested = true
        };
    }

    internal static object SavedTargetJson(SavedTargetRow t) => new
    {
        id = t.Id,
        universityId = t.UniversityId,
        universityName = t.UniversityName,
        major = t.Major,
        fieldKey = t.FieldKey,
        selectivityTier = t.SelectivityTier,
        templateKey = t.TemplateKey,
        templateLabel = RigorTemplates.ResolveTemplateLabel(t.FieldKey, t.SelectivityTier),
        suggested = false
    };

    /// <summary>
    /// <c>planDto</c>'s wire shape. <c>createdDate</c> is always present (it is a non-null column reached
    /// through a defined property); <c>submittedAt</c>, <c>rationale</c> and <c>reviewNote</c> are explicit
    /// nulls.
    /// </summary>
    internal static object? PlanJson(GraduationPlanDto? plan) => plan is null ? null : new
    {
        id = plan.Id,
        status = plan.Status,
        templateKey = plan.TemplateKey,
        templateLabel = plan.TemplateLabel,
        gapReport = plan.GapReport,
        warnings = plan.Warnings,
        rationale = plan.Rationale,
        totalPlannedCredits = plan.TotalPlannedCredits,
        submittedAt = plan.SubmittedAt,
        reviewNote = plan.ReviewNote,
        createdDate = plan.CreatedDate,
        items = plan.Items.Select(i => new
        {
            courseId = i.CourseId,
            courseCode = i.CourseCode,
            courseName = i.CourseName,
            credits = i.Credits,
            gradeLevel = i.GradeLevel,
            term = i.Term,
            category = i.Category,
            reason = i.Reason,
            source = i.Source,
            sortOrder = i.SortOrder
        }).ToList()
    };

    // ---------------------------------------------------------------- guard + envelopes

    internal static (RequestContext Context, IResult? Error) RequireIdentity(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
    }

    internal static IResult PlanError(string code, int statusCode) => Results.Json(
        new { success = false, code, message = "Plan request cannot be fulfilled" },
        statusCode: statusCode);

    internal static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    internal static IResult NotFound(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    /// <summary>`req.body || {}` — an absent body is an empty object; malformed JSON never gets here.</summary>
    internal static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
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
            return document.RootElement.ValueKind == JsonValueKind.Object ? document.RootElement.Clone() : EmptyObject;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>`typeof x === "string"` — anything else, including null and a number, yields false.</summary>
    internal static bool TryGetString(JsonElement body, string name, out string? value)
    {
        value = null;
        if (body.ValueKind != JsonValueKind.Object
            || !body.TryGetProperty(name, out var property)
            || property.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        value = property.GetString();
        return value is not null;
    }
}
