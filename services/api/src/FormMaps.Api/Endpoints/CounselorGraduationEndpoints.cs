using FormMaps.Application.Auth;
using FormMaps.Application.Graduation;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// The counselor graduation-plan surface — faithful port of legacy routes/counselor-graduation.ts, mounted at
/// /api/v1/counselor (index.ts:354). TWO of its three routes ship here, under the same lane flag
/// FORMMAPS_ROUTE_GRADUATION_TO_DOTNET (issue #55).
///
/// <para>NOT PORTED, DECISION D1: POST /me/students/:studentId/graduation-plan/generate
/// (counselor-graduation.ts:46) is aiLimiter-rate-limited (index.ts:307) and calls Bedrock. It stays on Node
/// and already carries an UNCONDITIONAL carve-out at the top of next.config.ts's rewrite array. Note it sits at
/// SEVEN path segments — one deeper than the GET here and one deeper than the PUT's sibling — so the rewrite
/// entries must be literal and must never become a :studentId/graduation-plan/:path* prefix.</para>
///
/// <para>GUARD: <c>authenticate</c> at the router plus <c>requirePermission("counselor:dashboard")</c> on both
/// routes, then the ASSIGNMENT GATE. That gate answers 404 "Student not found" for an unassigned student —
/// deliberately indistinguishable from a genuinely missing one, the same shape counselor-analytics ships, so a
/// counselor cannot enumerate the school's roster by probing. Reproduced exactly, including the fact that it
/// runs BEFORE any body validation on the PUT: a bad status on an unassigned student is a 404, not a 400.</para>
/// </summary>
public static class CounselorGraduationEndpoints
{
    public static IEndpointRouteBuilder MapCounselorGraduationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorGraduation");

        group.MapGet("/me/students/{studentId}/graduation-plan", GetPlanAsync);
        group.MapPut("/me/students/{studentId}/graduation-plan/review", ReviewPlanAsync);

        return app;
    }

    // counselor-graduation.ts:23-43.
    private static async Task<IResult> GetPlanAsync(
        string studentId, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICounselorGraduationRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorDashboard(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        if (!await repository.IsAssignedAsync(context, context.Actor!.UserId, studentId, cancellationToken))
        {
            return GraduationPlanEndpoints.NotFound("Student not found");
        }

        var view = await repository.GetPlanAsync(context, studentId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                plan = GraduationPlanEndpoints.PlanJson(view.Plan),
                target = view.Target is null
                    ? null
                    : new
                    {
                        universityName = view.Target.UniversityName,
                        major = view.Target.Major,
                        templateKey = view.Target.TemplateKey
                    }
            }
        });
    }

    // counselor-graduation.ts:67-89. The heaviest route in the lane.
    private static async Task<IResult> ReviewPlanAsync(
        string studentId, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICounselorGraduationRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorDashboard(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // The assignment gate is FIRST — before the body is even read. An unassigned student with a malformed
        // body gets the 404, not the 400.
        if (!await repository.IsAssignedAsync(context, context.Actor!.UserId, studentId, cancellationToken))
        {
            return GraduationPlanEndpoints.NotFound("Student not found");
        }

        var body = await GraduationPlanEndpoints.ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return GraduationPlanEndpoints.BadRequest("Invalid request body");
        }

        // `status !== "approved" && status !== "rejected"` — case-sensitive, and a missing status fails here.
        GraduationPlanEndpoints.TryGetString(body.Value, "status", out var status);
        if (status is not ("approved" or "rejected"))
        {
            return GraduationPlanEndpoints.BadRequest("status must be approved or rejected");
        }

        // A note is required ONLY on reject, and must be a non-blank string.
        var hasNote = GraduationPlanEndpoints.TryGetString(body.Value, "note", out var note);
        if (status == "rejected" && (!hasNote || note!.Trim().Length == 0))
        {
            return GraduationPlanEndpoints.BadRequest("A note is required when rejecting a plan");
        }

        // `typeof note === "string" ? note.trim() : undefined` — a whitespace-only note on an APPROVE trims to
        // "" and is then stored as SQL NULL by reviewPlan's `|| null`. Carried through as the empty string so
        // the repository can make that distinction the way legacy does.
        var trimmedNote = hasNote ? note!.Trim() : null;

        var result = await repository.ReviewPlanAsync(
            context, context.Actor.UserId, studentId, status, trimmedNote, cancellationToken);

        return result.Outcome switch
        {
            ReviewPlanOutcome.NoProposedPlan => GraduationPlanEndpoints.NotFound("No proposed plan to review"),

            // counselor-graduation.ts:84-86 — this route maps EVERY PlanError to 422, unlike the student
            // router's per-code table. NO_CURRENT_YEAR is the only code reviewPlan can raise.
            ReviewPlanOutcome.NoCurrentYear =>
                GraduationPlanEndpoints.PlanError("NO_CURRENT_YEAR", StatusCodes.Status422UnprocessableEntity),

            _ => Results.Ok(new { success = true, data = GraduationPlanEndpoints.PlanJson(result.Plan) }),
        };
    }

    private static (RequestContext Context, IResult? Error) RequireCounselorDashboard(
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

        if (!context.Permissions.Contains(FormMapsPermissions.CounselorDashboard))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
