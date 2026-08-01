// services/api/src/FormMaps.Api/Endpoints/AuthAdminEndpoints.cs
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FormMaps.Api.Auth;
using FormMaps.Api.Security;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 10 (Auth) admin-surface issuance endpoints -- port of routes/auth-admin.ts's 3 in-scope
/// routes (POST /signup, GET /unsubscribe, PUT /admin/set-password), mounted under /authapi
/// (same mount path as AuthEndpoints -- both auth.ts and auth-admin.ts mount there in legacy's
/// index.ts). A SEPARATE endpoint group/repository from AuthEndpoints/IAuthRepository per this
/// task's plan, even though both live under the same /authapi prefix.
///
/// signup-coach, signup-coach-bulk, coaches, coach/:id, invite-coach (the rest of auth-admin.ts) are
/// explicitly OUT of scope here -- a future Coaching domain's problem.
/// </summary>
public static class AuthAdminEndpoints
{
    public static IEndpointRouteBuilder MapAuthAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/authapi").WithTags("AuthAdmin");
        group.MapPost("/signup", SignupAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapGet("/unsubscribe", UnsubscribeAsync);
        group.MapPut("/admin/set-password", AdminSetPasswordAsync);
        return app;
    }

    // =========================================================================================
    // POST /authapi/signup
    // =========================================================================================

    public sealed record SignupRequest(
        string? Name, string? Email, string? Password, string? RoleId, string? DateOfBirth, bool? AcceptMarketing);

    private static async Task<IResult> SignupAsync(
        SignupRequest? body, HttpContext httpContext, IAuthAdminRepository repository, AccessTokenFactory tokenFactory,
        CancellationToken cancellationToken)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Name) || string.IsNullOrWhiteSpace(body.Email) ||
            string.IsNullOrWhiteSpace(body.Password))
            return BadRequest("name, email, and password are required");

        // Legacy's zod schema requires dateOfBirth as a non-empty string ("Date of birth is required"
        // if missing) -- the COPPA age-gate math itself (isNaN/future/under-13) lives in
        // authAdminService.ts's signup, checked further below, AFTER password strength.
        if (string.IsNullOrWhiteSpace(body.DateOfBirth))
            return BadRequest("Date of birth is required");

        // Item (password-strength validation belongs at this layer, not the repository): matches
        // Task 12's ChangePasswordAsync/ResetPasswordAsync convention. Legacy's zod schema ALSO
        // enforces password min8/max100 before this ever runs, but validatePasswordStrength
        // (authAdminService.ts's signup, first statement) is the check whose exact message text this
        // task's coverage cares about.
        var pwError = PasswordStrength.Validate(body.Password);
        if (pwError is not null) return BadRequest(pwError);

        // Age gate (COPPA), verbatim from authAdminService.ts's signup:
        //   const dob = new Date(dateOfBirth);
        //   if (isNaN(dob.getTime()) || dob > new Date()) return { message: "A valid date of birth is required." };
        //   const thirteenAgo = new Date(); thirteenAgo.setFullYear(thirteenAgo.getFullYear() - 13);
        //   if (dob > thirteenAgo) return { message: "You must be at least 13 years old to create an
        //   account. Please ask your school to invite you." };
        if (!DateTime.TryParse(
                body.DateOfBirth, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dateOfBirth) ||
            dateOfBirth > DateTime.UtcNow)
            return BadRequest("A valid date of birth is required.");

        var thirteenYearsAgo = DateTime.UtcNow.AddYears(-13);
        if (dateOfBirth > thirteenYearsAgo)
            return BadRequest("You must be at least 13 years old to create an account. Please ask your school to invite you.");

        var email = NormalizeEmail(body.Email);

        // Duplicate-email rejection is deliberately generic -- does NOT say "email already exists" or
        // similar, matching authAdminService.ts's signup exactly: `if (existing) return { ...message:
        // "Unable to create account with this email" };` -- avoids leaking which field collided.
        if (await repository.EmailExistsAsync(email, cancellationToken))
            return BadRequest("Unable to create account with this email");

        string roleId, roleName;
        if (!string.IsNullOrWhiteSpace(body.RoleId))
        {
            var role = await repository.FindActiveRoleByIdAsync(body.RoleId, cancellationToken);
            if (role is null) return BadRequest("Invalid role");
            roleId = role.Id;
            roleName = role.Name;
        }
        else
        {
            // Default self-serve role, per authAdminService.ts's signup: `role = await
            // prisma.role.findFirst({ where: { name: ROLES.Student, isActive: true } }); if (!role)
            // role = await prisma.role.create(...)` -- find-or-create, same shape as Task 9's
            // EnsureSchoolAdminRoleAsync generalized to any role name.
            roleId = await repository.EnsureRoleAsync(FormMapsRoles.Student, cancellationToken);
            roleName = FormMapsRoles.Student;
        }

        var hashedPassword = PasswordHasher.Hash(body.Password);
        var user = await repository.CreateUserAsync(body.Name, email, hashedPassword, roleId, roleName, dateOfBirth, cancellationToken);

        // Records the acceptMarketing choice captured at signup (authAdminService.ts's comment: "was
        // previously discarded") -- defaults to false when omitted, matching
        // `acceptMarketing ?? false`.
        await repository.UpsertUserMarketingSettingsAsync(user.Id, body.AcceptMarketing ?? false, cancellationToken);

        var permissions = RolePermissions.For(user.RoleName);
        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);

        // Same issuance mechanism as Task 6/7's login (AccessTokenFactory + a refresh-token write +
        // AuthCookieWriter) -- a self-serve signup user has no schoolId yet, matching login's
        // `user.SchoolId ?? ""` fallback for the same claim.
        var accessToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            user.Id, user.Name, user.Email, user.RoleName, "", permissions));
        var refreshToken = await repository.CreateRefreshTokenAsync(user.Id, clientIp, cancellationToken);

        AuthCookieWriter.SetAuthCookies(httpContext.Response, accessToken, refreshToken, tokenFactory.ExpiresInSeconds);

        return Results.Json(new
        {
            success = true,
            message = "User registered successfully",
            data = new
            {
                token = accessToken,
                refreshToken,
                user = new
                {
                    id = user.Id, name = user.Name, email = user.Email,
                    roleId = user.RoleId, roleName = user.RoleName, permissions,
                },
            },
        }, statusCode: StatusCodes.Status201Created);
    }

    // =========================================================================================
    // GET /authapi/unsubscribe
    // =========================================================================================

    private const string UnsubscribePurpose = "unsubscribe";
    private const string InvalidUnsubscribeLinkBody = "This unsubscribe link is invalid or has expired.";
    private const string UnsubscribeSuccessBody =
        "You've been unsubscribed from FormMaps marketing emails. You'll still receive essential account and school messages.";
    private const string UnsubscribeErrorBody = "Something went wrong. Please try again later.";

    /// <summary>
    /// One-click marketing unsubscribe (CAN-SPAM), per auth-admin.ts's GET /unsubscribe. Legacy's
    /// entire response family here is PLAIN TEXT via Express's `res.send(string)` -- NOT the
    /// `{success,message,data}` JSON envelope every other route in this domain uses -- confirmed
    /// directly against auth-admin.ts:58/64/65 (`res.status(400).send(...)`,
    /// `res.status(200).send(...)`, `res.status(500).send(...)`, none of them `res.json(...)`).
    /// Express's res.send(string) defaults Content-Type to text/html (not text/plain) when no
    /// Content-Type has been set, which is the case here -- reproduced as "text/html" below.
    /// </summary>
    private static async Task<IResult> UnsubscribeAsync(
        HttpContext httpContext, IAuthAdminRepository repository, CancellationToken cancellationToken)
    {
        var token = httpContext.Request.Query["token"].ToString();
        var userId = VerifyUnsubscribeToken(token);
        if (userId is null)
            return PlainText(InvalidUnsubscribeLinkBody, StatusCodes.Status400BadRequest);

        try
        {
            await repository.UpsertUserMarketingSettingsAsync(userId, false, cancellationToken);
        }
        catch
        {
            // Matches legacy's outer try/catch: `catch (err) { logger.error(err, "Unsubscribe
            // error:"); res.status(500).send("Something went wrong. Please try again later."); }`.
            return PlainText(UnsubscribeErrorBody, StatusCodes.Status500InternalServerError);
        }

        return PlainText(UnsubscribeSuccessBody, StatusCodes.Status200OK);
    }

    /// <summary>
    /// Verifies a `purpose:"unsubscribe"` JWT using the SAME JWT_SECRET env var / HMAC-SHA256
    /// verification the rest of this app already uses (AccessTokenFactory/LegacyJwtRequestContextFactory) --
    /// but NOT that factory's full TokenValidationParameters. Confirmed directly against how this
    /// token is actually minted (lib/email.ts:166 -- `jwt.sign({ sub: userId, purpose: "unsubscribe"
    /// }, process.env.JWT_SECRET!, { algorithm: "HS256", expiresIn: "365d" })`, deliberately with NO
    /// issuer/audience) and verified (auth-admin.ts:55 -- `jwt.verify(token, process.env.JWT_SECRET!)`,
    /// no options at all, so no issuer/audience/clock-skew enforcement either). Reproducing
    /// LegacyJwtRequestContextFactory's ValidateIssuer/ValidateAudience=true here would reject every
    /// real unsubscribe link outright (it never carries an "iss"/"aud" claim), so this method builds
    /// its own minimal TokenValidationParameters instead: signature + algorithm only, no
    /// issuer/audience, ClockSkew=Zero (legacy's plain jwt.verify has no clockTolerance option, i.e.
    /// zero), RequireExpirationTime=false (some tokens -- e.g. this task's own coverage's
    /// hand-signed test token -- carry no "exp" at all, exactly like jsonwebtoken's default when
    /// `expiresIn` isn't passed to jwt.sign).
    /// </summary>
    private static string? VerifyUnsubscribeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var secret = Environment.GetEnvironmentVariable("JWT_SECRET");
        if (string.IsNullOrWhiteSpace(secret)) return null;

        var handler = new JwtSecurityTokenHandler();
        var parameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            RequireExpirationTime = false,
            RequireSignedTokens = true,
            ClockSkew = TimeSpan.Zero,
            AlgorithmValidator = static (algorithm, _, _, _) =>
                string.Equals(algorithm, SecurityAlgorithms.HmacSha256, StringComparison.Ordinal),
        };

        try
        {
            var principal = handler.ValidateToken(token, parameters, out _);
            var purpose = principal.FindFirst("purpose")?.Value;
            var sub = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value ?? principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.Equals(purpose, UnsubscribePurpose, StringComparison.Ordinal) || string.IsNullOrWhiteSpace(sub))
                return null; // matches legacy: `if (payload.purpose !== "unsubscribe" || !payload.sub) throw ...`
            return sub;
        }
        catch
        {
            // Any failure (bad signature, malformed/garbage token, expired) -- matches legacy's
            // catch-all around jwt.verify: `catch { res.status(400).send(...); return; }`.
            return null;
        }
    }

    private static IResult PlainText(string body, int statusCode) =>
        Results.Text(body, "text/html", Encoding.UTF8, statusCode);

    // =========================================================================================
    // PUT /authapi/admin/set-password (Super Admin / School Admin onboarding bypass)
    // =========================================================================================

    public sealed record AdminSetPasswordRequest(string? Email, string? Password);

    private static async Task<IResult> AdminSetPasswordAsync(
        AdminSetPasswordRequest? body, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IAuthAdminRepository repository, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (!context.Permissions.Contains(FormMapsPermissions.SchoolManage))
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);

        if (body is null || string.IsNullOrWhiteSpace(body.Email) || string.IsNullOrWhiteSpace(body.Password))
            return BadRequest("email and password required");

        var pwError = PasswordStrength.Validate(body.Password);
        if (pwError is not null) return BadRequest(pwError);

        var email = NormalizeEmail(body.Email);
        var target = await repository.FindUserByEmailForAdminAsync(email, cancellationToken);
        if (target is null) return NotFound("Not found");

        // Inline schoolId-scoping check, ported EXACTLY from auth-admin.ts:203-221 -- deliberately
        // NOT Task 12's change-password/change-email 404-collapse convention. This route's legacy
        // behavior is a 403 for a cross-school target (and for a caller with no schoolId at all),
        // never a 404 -- a real, documented divergence from ChangePasswordAsync/ChangeEmailAsync's
        // "cross-school and not-found collapse to the SAME 404" rule, kept exactly as legacy has it
        // per this task's explicit instruction not to "consistency-fix" it.
        //
        // The caller's schoolId is also a LIVE DB re-read (GetUserSchoolIdAsync), not the
        // JWT-derived context.Tenant.SchoolId Task 12 chose to trust for change-password/change-email
        // -- legacy re-reads it live here too (auth-admin.ts:214), and this task's brief is explicit
        // that this route's check must be ported exactly, not unified with Task 12's JWT-trust
        // trade-off.
        var callerSchoolId = await repository.GetUserSchoolIdAsync(context.Tenant!.UserId, cancellationToken);
        if (string.IsNullOrEmpty(callerSchoolId) || target.SchoolId != callerSchoolId)
            return Forbidden("Not authorized");

        var hashedPassword = PasswordHasher.Hash(body.Password);
        await repository.SetPasswordForSchoolUserAsync(target.Id, hashedPassword, cancellationToken);

        // No "message" key in the success envelope -- deliberately verbatim from auth-admin.ts:220:
        // `res.json({ success: true, data: { userId: user.id, email: user.email } });` -- unlike
        // every other route in this domain, legacy omits "message" here. Confirmed directly against
        // that exact line before writing this; not an oversight.
        return Results.Ok(new { success = true, data = new { userId = target.Id, email = target.Email } });
    }

    // =========================================================================================
    // helpers
    // =========================================================================================

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
}
