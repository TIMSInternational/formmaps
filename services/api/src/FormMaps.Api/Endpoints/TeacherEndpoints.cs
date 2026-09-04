using System.Globalization;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Teacher;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Teacher portal + teacher onboarding -- port of routes/teacher.ts (issue #62), mounted /api/v1/teacher at
/// index.ts:356. FOUR routes, one dark flag <c>FORMMAPS_ROUTE_TEACHER_ONBOARDING_TO_DOTNET</c>, default OFF.
///
/// <para><b>THE SPLIT AUTH BOUNDARY.</b> Legacy declares two routes, then mounts middleware, then declares two
/// more. The middleware applies only to what follows it, and that asymmetry is the design, not an oversight:</para>
/// <list type="table">
///   <item><term>GET /onboarding/verify (teacher.ts:18)</term><description>ANONYMOUS. <c>systemContext</c> only.</description></item>
///   <item><term>POST /onboarding/complete (teacher.ts:33)</term><description>ANONYMOUS. <c>systemContext</c> only.</description></item>
///   <item><term>-- router.use(authenticate) at :84, router.use(tenantContext) at :85 --</term><description /></item>
///   <item><term>GET /profile (teacher.ts:91)</term><description>AUTH + <c>requirePermission("teacher:dashboard")</c>.</description></item>
///   <item><term>GET /evaluations/pending (teacher.ts:111)</term><description>AUTH + <c>requirePermission("evaluations:read")</c>.</description></item>
/// </list>
/// <para>Getting this wrong in either direction is a serious defect. Requiring auth on the onboarding pair
/// breaks onboarding outright -- the teacher being onboarded has, by definition, no session yet, so a 401 there
/// is unrecoverable. Dropping auth from the profile pair exposes teacher PII and another user's 360 evaluation
/// tokens. TeacherEndpointsTests pins each of the four on its own side of the line, in both directions.</para>
///
/// <para><b>WHAT systemContext ESTABLISHES, AND WHAT PROTECTS THE PRE-AUTH PAIR.</b> Legacy's <c>systemContext</c>
/// (middleware/tenantContext.ts:20-22) calls <c>runAsSystem</c>, which resolves to <c>{ mode: "bypass" }</c> in
/// prismaRls.ts and emits <c>SELECT set_config('app.bypass_rls','on',true)</c>. It sets NO tenant: neither
/// <c>app.current_school_id</c> nor <c>app.current_user_id</c> is bound, and every policy's bypass branch matches.
/// The .NET equivalent is <see cref="RequestContext.System"/>, which TenantGucPlanResolver maps to
/// <c>TenantGucPlan.Bypass</c> and RlsSessionCommandBuilder renders as the same <c>set_config</c> statement --
/// so the two runtimes establish the same thing, which is the parity this port needed.</para>
///
/// <para>The consequence must be stated plainly, because it is a finding and not a failure: on these two routes
/// THE INVITE TOKEN IS THE ONLY THING PROTECTING TENANT DATA. <c>teacher_invites</c> IS policied in production
/// (prisma/rls/007-self-scoped.sql) on a direct <c>"schoolId" = app.current_school_id</c> predicate, but a
/// bypass session matches that policy's first branch and reads EVERY school's invites. The rows the pair
/// touches -- the invite, its <c>schools</c> row, the <c>users</c> row it creates or migrates -- are all
/// tenant-scoped, and they are reached with no caller identity whatsoever. Nothing but possession of a valid,
/// unexpired, unused token stands between a caller and another tenant's invite: there is no rate limit on these
/// two routes in legacy, and the endpoint's own predicate is an exact-match token lookup. Token entropy is
/// therefore load-bearing and belongs to whoever mints the invite (schoolService.ts:278, outside this port's
/// scope), not to this route. This port does NOT tighten it -- see the divergences below.</para>
///
/// <para><b>DIVERGENCES NOT MADE</b> (each would be a behaviour change on flip, and #40/#151 were both reverted
/// on this project for exactly this):</para>
/// <list type="bullet">
///   <item><description>No rate limiting on the onboarding pair. AuthEndpoints attaches
///   <c>FormMapsRateLimitPolicies.Auth</c> to every pre-auth route it owns, and it is tempting to match that
///   here since the token-guessing exposure above is real. Legacy attaches none -- teacher.ts:18/:33 are bare --
///   so attaching one would start rejecting traffic the flag is supposed to leave untouched. Recorded as a
///   finding for a follow-up that changes Node and .NET together.</description></item>
///   <item><description>Verify does not distinguish "no such token" from "wrong tenant" because it cannot: it
///   answers <c>{ isValid: false, status: "invalid" }</c> for an unknown token, which is already the
///   non-enumerable shape.</description></item>
///   <item><description>Verify checks EXPIRED before USED (teacher.ts:25 then :26), so an invite that is both
///   reports "expired". Preserved.</description></item>
///   <item><description><c>schoolName</c> is <c>school?.name</c> with NO <c>?? null</c> on verify (:29), so
///   JSON.stringify DROPS the key when the invite has no school or the school row is missing. /profile (:99)
///   DOES write <c>?? null</c> and always emits the key. Two sibling routes, two different shapes; both
///   preserved verbatim.</description></item>
///   <item><description>The 500 on a missing teacher role (:48) is a 500, not a 503 or a 400.</description></item>
/// </list>
/// </summary>
public static class TeacherEndpoints
{
    /// <summary>teacher.ts:91 -- <c>requirePermission("teacher:dashboard")</c>.</summary>
    private const string TeacherDashboardPermission = "teacher:dashboard";

    /// <summary>
    /// teacher.ts:111 -- <c>requirePermission("evaluations:read")</c>. NOT <c>evaluations:manage</c>: read is held
    /// by teacher/student/parent/counselor/school_admin, manage by counselor/school_admin only, so using the
    /// wrong one would lock every teacher out of the route the flag is meant to leave unchanged.
    /// </summary>
    private const string EvaluationsReadPermission = "evaluations:read";

    public static IEndpointRouteBuilder MapTeacherEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/teacher").WithTags("Teacher");

        // --- PRE-AUTH. Nothing below this comment block may consult IProtectedRequestGuard. ---
        group.MapGet("/onboarding/verify", VerifyOnboardingAsync);
        group.MapPost("/onboarding/complete", CompleteOnboardingAsync);

        // --- AUTHENTICATED (legacy router.use(authenticate) at :84 / tenantContext at :85). ---
        group.MapGet("/profile", GetProfileAsync);
        group.MapGet("/evaluations/pending", GetPendingEvaluationsAsync);

        return app;
    }

    // =============================================================================================
    // GET /api/v1/teacher/onboarding/verify -- teacher.ts:18. ANONYMOUS, systemContext only.
    // =============================================================================================

    private static async Task<IResult> VerifyOnboardingAsync(
        HttpContext http, ITeacherOnboardingRepository repository, CancellationToken cancellationToken)
    {
        // qs(req.query.token) -- first value of a repeated param, "" when absent; `if (!token)` then 400.
        var token = http.Request.Query["token"].FirstOrDefault() ?? string.Empty;
        if (token.Length == 0)
        {
            return BadRequest("Token required");
        }

        var invite = await repository.FindInviteByTokenAsync(token, cancellationToken);

        // All three of these are 200s with success:true -- legacy never 404s an unknown token (:24-26).
        if (invite is null)
        {
            return Results.Ok(new { success = true, data = new { isValid = false, status = "invalid" } });
        }

        // :25 before :26 -- an invite that is BOTH expired and used reports "expired".
        if (invite.ExpiresAt < DateTime.UtcNow)
        {
            return Results.Ok(new { success = true, data = new { isValid = false, status = "expired" } });
        }

        if (invite.UsedAt is not null)
        {
            return Results.Ok(new { success = true, data = new { isValid = false, status = "used" } });
        }

        var schoolName = invite.SchoolId is null
            ? null
            : await repository.FindSchoolNameAsync(invite.SchoolId, cancellationToken);

        // `schoolName: school?.name` with no `?? null` (:29): undefined, so JSON.stringify OMITS the key.
        // The two literals below differ ONLY by that key, and keep legacy's property order either way.
        return Results.Ok(new
        {
            success = true,
            data = schoolName is null
                ? new { isValid = true, status = "valid", email = invite.Email, expiresAt = IsoZ(invite.ExpiresAt) }
                : (object)new
                {
                    isValid = true,
                    status = "valid",
                    email = invite.Email,
                    schoolName,
                    expiresAt = IsoZ(invite.ExpiresAt),
                },
        });
    }

    // =============================================================================================
    // POST /api/v1/teacher/onboarding/complete -- teacher.ts:33. ANONYMOUS, systemContext only.
    // =============================================================================================

    public sealed record CompleteOnboardingRequest(string? Token, string? Password, string? Name);

    private static async Task<IResult> CompleteOnboardingAsync(
        CompleteOnboardingRequest? body,
        HttpContext http,
        ITeacherOnboardingRepository repository,
        AccessTokenFactory tokenFactory,
        IAuthRepository authRepository,
        CancellationToken cancellationToken)
    {
        // :36 -- `if (!token || !password)`. JS falsiness, so "" is missing too. `name` is optional.
        if (body is null || string.IsNullOrEmpty(body.Token) || string.IsNullOrEmpty(body.Password))
        {
            return BadRequest("Token and password required");
        }

        // :39-40 -- strength BEFORE the token is looked up, so a weak password on a bogus token still
        // reports the strength message. Ordering preserved.
        var passwordError = PasswordStrength.Validate(body.Password);
        if (passwordError is not null)
        {
            return BadRequest(passwordError);
        }

        // :42-45 -- one collapsed 400 for unknown / already-used / expired. Unlike verify, this route
        // deliberately does NOT distinguish the three.
        var invite = await repository.FindInviteByTokenAsync(body.Token, cancellationToken);
        if (invite is null || invite.UsedAt is not null || invite.ExpiresAt < DateTime.UtcNow)
        {
            return BadRequest("Invalid or expired token");
        }

        // :47-48 -- a 500, on a request that is otherwise entirely valid.
        var role = await repository.FindActiveTeacherRoleAsync(cancellationToken);
        if (role is null)
        {
            return Results.Json(
                new { success = false, message = "Teacher role not found" },
                statusCode: StatusCodes.Status500InternalServerError);
        }

        // :51 -- the email comes from the VERIFIED INVITE, never from the request body. This is what stops a
        // caller with a valid token from onboarding an arbitrary address; do not add a body email field.
        var normalizedEmail = invite.Email.ToLowerInvariant();

        var passwordHash = PasswordHasher.Hash(body.Password);
        var result = await repository.CompleteOnboardingAsync(
            body.Token, normalizedEmail, body.Name, passwordHash, role, invite.SchoolId, cancellationToken);

        if (result.Outcome == TeacherOnboardingOutcome.AccountAlreadyExists)
        {
            // :56 -- 409, and the invite stays unconsumed.
            return Results.Json(
                new { success = false, message = "Account already exists" },
                statusCode: StatusCodes.Status409Conflict);
        }

        // :71-73 -- log the new teacher straight in. schoolId on the JWT is the INVITE's schoolId (which may be
        // null; "" is what this codebase's factory takes for absent, same as AuthEndpoints' login path).
        var permissions = RolePermissions.For(role.Name);
        var accessToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            result.UserId, result.Name, result.Email, role.Name, invite.SchoolId ?? string.Empty, permissions));
        var refreshToken = await authRepository.CreateRefreshTokenAsync(
            result.UserId, AuthCookieWriter.GetClientIp(http.Request), cancellationToken);
        AuthCookieWriter.SetAuthCookies(http.Response, accessToken, refreshToken, tokenFactory.ExpiresInSeconds);

        return Results.Ok(new
        {
            success = true,
            data = new
            {
                userId = result.UserId,
                token = accessToken,
                refreshToken,
                redirectUrl = "/teacher",
                user = new
                {
                    id = result.UserId,
                    name = result.Name,
                    email = result.Email,
                    roleId = role.Id,
                    roleName = role.Name,
                    permissions,
                },
            },
        });
    }

    // =============================================================================================
    // GET /api/v1/teacher/profile -- teacher.ts:91. AUTHENTICATED + teacher:dashboard.
    // =============================================================================================

    private static async Task<IResult> GetProfileAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ITeacherOnboardingRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard, TeacherDashboardPermission);
        if (error is not null)
        {
            return error;
        }

        var user = await repository.GetProfileAsync(context, context.Actor!.UserId, cancellationToken);
        if (user is null)
        {
            // :97 -- 404 "Not found", the message legacy uses verbatim.
            return Results.Json(
                new { success = false, message = "Not found" }, statusCode: StatusCodes.Status404NotFound);
        }

        var schoolName = user.SchoolId is null
            ? null
            : await repository.GetSchoolNameAsync(context, user.SchoolId, cancellationToken);

        // :99 -- `{ ...user, schoolName: school?.name ?? null }`. The key is ALWAYS present here, unlike verify.
        return Results.Ok(new
        {
            success = true,
            data = new { id = user.Id, name = user.Name, email = user.Email, schoolId = user.SchoolId, schoolName },
        });
    }

    // =============================================================================================
    // GET /api/v1/teacher/evaluations/pending -- teacher.ts:111. AUTHENTICATED + evaluations:read.
    // =============================================================================================

    private static async Task<IResult> GetPendingEvaluationsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ITeacherOnboardingRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard, EvaluationsReadPermission);
        if (error is not null)
        {
            return error;
        }

        var rows = await repository.ListPendingEvaluationsAsync(
            context, context.Actor!.UserId, cancellationToken);

        return Results.Ok(new
        {
            success = true,
            data = rows.Select(r => new
            {
                evaluationId = r.EvaluationId,
                studentName = r.StudentName,
                deadline = r.Deadline,
                token = r.Token,
            }),
        });
    }

    // =============================================================================================
    // guard + plumbing
    // =============================================================================================

    /// <summary>
    /// The AUTHENTICATED half of the boundary only. <c>RequireIdentity</c> (not RequireTenantContext) is the
    /// match for legacy's bare <c>authenticate</c>: legacy imposes no school-context precondition on these two
    /// routes, and a school-less teacher reading their own /profile must still get through to the row lookup.
    /// The permission check that follows is legacy's <c>requirePermission</c>, whose 403 body carries the same
    /// "Insufficient permissions" message; <c>code</c> is this codebase's addition, present on every ported
    /// permission denial (see GraduationRulesEndpoints).
    /// </summary>
    private static (RequestContext Context, IResult? Error) Authorize(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, string permission)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(permission))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }

    private static IResult BadRequest(string message) =>
        Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);

    /// <summary>JSON.stringify(Date) shape: millisecond precision, trailing Z.</summary>
    private static string IsoZ(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc)
            .ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
