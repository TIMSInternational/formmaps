// services/api/src/FormMaps.Api/Endpoints/AuthEndpoints.cs
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using FormMaps.Api.Auth;
using FormMaps.Api.Security;
using FormMaps.Application.Auth;
using FormMaps.Application.Email;
using FormMaps.Domain.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 10 (Auth) session-issuance endpoints -- port of routes/auth.ts's 11 routes, mounted under
/// <c>/authapi</c> (the one domain that keeps the legacy mount path verbatim, matching the frontend
/// rewrite target). Wires together Tasks 1-11's repository/hasher/token-factory/email-template
/// building blocks. See this file's inline comments for how each of the 9 items Tasks 6-10 explicitly
/// deferred here is resolved; task-12-report.md documents each against its exact legacy citation.
///
/// Pre-auth routes (login/refresh/school-admin-registration/forgot/reset-password) use
/// <see cref="RequestContext.System"/> directly -- there is no caller identity yet, matching the
/// plan's Global Constraints. Authenticated routes (logout/profile/change-*) use
/// <see cref="IProtectedRequestGuard.RequireIdentity"/>, same convention as MessagesEndpoints/
/// GradebookEndpoints.
/// </summary>
public static class AuthEndpoints
{
    // Legacy's requirePermission("admin:users") middleware gate on PUT /change-role -- no
    // FormMapsPermissions constant exists for this string yet (SuperAdmin-only permission, not shared
    // by any already-ported domain's checks), so it is inlined here as a literal, matching legacy's
    // own literal string argument to requirePermission(...).
    private const string AdminUsersPermission = "admin:users";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/authapi").WithTags("Auth");
        group.MapPost("/login", LoginAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/refresh", RefreshAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/refresh-token", RefreshAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapDelete("/refresh", LogoutAsync);
        group.MapGet("/profile", GetProfileAsync);
        group.MapPut("/change-password", ChangePasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPut("/change-email", ChangeEmailAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPut("/change-role", ChangeRoleAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Sensitive);
        group.MapPost("/school-admin/complete-registration", CompleteSchoolAdminRegistrationAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/forgot-password", ForgotPasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        group.MapPost("/reset-password", ResetPasswordAsync).RequireRateLimiting(FormMapsRateLimitPolicies.Auth);
        return app;
    }

    // =========================================================================================
    // POST /authapi/login
    // =========================================================================================

    public sealed record LoginRequest(string? Email, string? Password);

    private static async Task<IResult> LoginAsync(
        LoginRequest? body, HttpContext httpContext, IAuthRepository repository,
        AccessTokenFactory tokenFactory, IEmailSender emailSender, EmailTemplates emailTemplates,
        CancellationToken cancellationToken)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Email) || string.IsNullOrWhiteSpace(body.Password))
            return BadRequest("Invalid email or password");

        var email = NormalizeEmail(body.Email);
        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);

        var lockout = await repository.GetLockoutStatusAsync(email, cancellationToken);
        if (lockout.IsLocked)
        {
            var remainingMinutes = Math.Ceiling((lockout.LockedUntil!.Value - DateTimeOffset.UtcNow).TotalMinutes);
            return Results.Json(new { success = false, message = $"Account temporarily locked. Try again in {remainingMinutes} minute(s)" }, statusCode: StatusCodes.Status429TooManyRequests);
        }

        var user = await repository.FindUserByEmailAsync(email, cancellationToken);
        if (user is null || !user.IsActive || user.PasswordHash is null)
            return Unauthorized("Invalid email or password");

        var verify = PasswordHasher.Verify(body.Password, user.PasswordHash);
        if (!verify.Valid)
        {
            var newCount = await repository.RecordFailedLoginAsync(email, clientIp, cancellationToken);
            if (newCount >= 5)
            {
                // Best-effort account-locked notice -- fire-and-forget, matches legacy's
                // import(...).then(sendEmail).catch(()=>{}) (never awaited, never fails the request).
                var locked = emailTemplates.BuildAccountLocked(forgotPasswordUrl: FrontendUrl.Build("/forgot-password"));
                _ = emailSender.SendAsync(email, locked.Subject, locked.Html, CancellationToken.None);
            }
            return Unauthorized("Invalid email or password");
        }

        await repository.ClearLoginAttemptsAsync(email, cancellationToken);

        var permissions = RolePermissions.For(user.RoleName);
        var accessToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            user.Id, user.Name, user.Email, user.RoleName, user.SchoolId ?? "", permissions));
        var refreshToken = await repository.CreateRefreshTokenAsync(user.Id, clientIp, cancellationToken);
        var language = await repository.GetLanguageAsync(user.Id, cancellationToken);

        AuthCookieWriter.SetAuthCookies(httpContext.Response, accessToken, refreshToken, tokenFactory.ExpiresInSeconds);

        // NOTE (item, documented in task-12-report.md): legacy's user object also carries
        // avatarUrl/coverUrl from a "profiles" table join. Task 8 deliberately scoped that join out
        // of GetProfileAsync/AuthUserRow ("a distinct table... isn't part of this task's
        // schema-extension scope"), so AuthUserRow has no field to source them from here either --
        // this is a carried-forward, documented gap, not something introduced in this task.
        return Results.Ok(new
        {
            success = true,
            message = "Login successful",
            data = new
            {
                token = accessToken,
                refreshToken,
                language,
                user = new { id = user.Id, name = user.Name, email = user.Email, roleId = user.RoleId, roleName = user.RoleName, schoolId = user.SchoolId, permissions },
            },
        });
    }

    // =========================================================================================
    // POST /authapi/refresh & POST /authapi/refresh-token
    // =========================================================================================

    public sealed record RefreshRequest(string? RefreshToken);

    private static async Task<IResult> RefreshAsync(
        RefreshRequest? body, HttpContext httpContext, IAuthRepository repository, AccessTokenFactory tokenFactory,
        CancellationToken cancellationToken)
    {
        var refreshTokenValue = httpContext.Request.Cookies["refresh_token"];
        if (string.IsNullOrEmpty(refreshTokenValue)) refreshTokenValue = body?.RefreshToken;
        if (string.IsNullOrEmpty(refreshTokenValue))
            return BadRequest("Refresh token is required");

        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);
        var rotated = await repository.RotateRefreshTokenAsync(refreshTokenValue, clientIp, cancellationToken);
        if (rotated is null)
        {
            AuthCookieWriter.ClearAuthCookies(httpContext.Response);
            return Unauthorized("Invalid or expired refresh token");
        }

        // Legacy's refreshAccessToken re-fetches the user AFTER rotation succeeds (to build the new
        // JWT payload) and re-checks !user.isActive there too -- a second, redundant-looking guard on
        // top of RotateRefreshTokenAsync's own TOCTOU isActive re-check (Task 7). Reproduced here for
        // the same defense-in-depth reason legacy has it.
        var user = await repository.FindUserByIdWithRoleAsync(rotated.UserId, cancellationToken);
        if (user is null || !user.IsActive)
        {
            AuthCookieWriter.ClearAuthCookies(httpContext.Response);
            return Unauthorized("Invalid or expired refresh token");
        }

        var permissions = RolePermissions.For(user.RoleName);
        var accessToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            user.Id, user.Name, user.Email, user.RoleName, user.SchoolId ?? "", permissions));
        var expiresIn = tokenFactory.ExpiresInSeconds;

        AuthCookieWriter.SetAuthCookies(httpContext.Response, accessToken, rotated.NewToken, expiresIn);

        return Results.Ok(new
        {
            success = true,
            message = "Token refreshed successfully",
            data = new { token = accessToken, accessToken, refreshToken = rotated.NewToken, expiresIn },
        });
    }

    // =========================================================================================
    // DELETE /authapi/refresh -- Logout
    // =========================================================================================

    private static async Task<IResult> LogoutAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IAuthRepository repository,
        HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);
        await repository.RevokeAllRefreshTokensAsync(context.Tenant!.UserId, clientIp, cancellationToken);
        AuthCookieWriter.ClearAuthCookies(httpContext.Response);

        // "Success" (capitalized) inside data is verbatim from legacy's
        // `res.json({ success: true, message: "Refresh token revoked", data: { Success: true } })`.
        // [JsonPropertyName] is required here, not just an anonymous-object property named "Success"
        // -- this codebase's default minimal-API JSON options camelCase every property, which would
        // silently rewrite "Success" to "success" (colliding, in casing only, with the envelope's own
        // top-level "success" key) and lose legacy's exact, if inconsistent, casing.
        return Results.Ok(new { success = true, message = "Refresh token revoked", data = new LogoutData(true) });
    }

    private sealed record LogoutData([property: JsonPropertyName("Success")] bool Success);

    // =========================================================================================
    // GET /authapi/profile
    // =========================================================================================

    private static async Task<IResult> GetProfileAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IAuthRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var profile = await repository.GetProfileAsync(context.Tenant!.UserId, cancellationToken);
        if (profile is null) return NotFound("User not found");

        // "profile" (phone/avatarUrl/location/fullName) is always null here: that's a distinct
        // "profiles" table join Task 8 explicitly scoped out of ProfileRow -- documented gap, not
        // introduced by this task. Every other field mirrors authService.ts's getProfile exactly,
        // including the roleName/role duplication.
        return Results.Ok(new
        {
            success = true,
            message = "Profile retrieved successfully",
            data = new
            {
                id = profile.Id, name = profile.Name, email = profile.Email,
                roleId = profile.RoleId, roleName = profile.RoleName, role = profile.RoleName,
                schoolId = profile.SchoolId, subscriptionStatus = profile.SubscriptionStatus,
                profile = (object?)null,
            },
        });
    }

    // =========================================================================================
    // PUT /authapi/change-password
    // =========================================================================================

    public sealed record ChangePasswordRequest(string? Email, string? Password, string? OldPassword);

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest? body, HttpContext httpContext, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IAuthRepository repository, IEmailSender emailSender, EmailTemplates emailTemplates, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (body is null || string.IsNullOrEmpty(body.Password))
            return BadRequest("Password is required");

        // Item 9: password-strength validation belongs at this layer (Task 1's PasswordStrength),
        // not in the repository. Runs BEFORE any lookup, matching legacy's changePassword ordering
        // (validatePasswordStrength is the very first statement in the function).
        var pwError = PasswordStrength.Validate(body.Password);
        if (pwError is not null) return BadRequest(pwError);

        // Item 1 (role-scoping/existence-hiding, normalized uniformly across change-password/
        // change-email/change-role): legacy's changePassword literally looks up the target BEFORE
        // checking the caller's role (rawEmail ? findByEmail : findById(requesterId); THEN the role
        // check only runs if isAdminAction). That ordering lets an unprivileged caller learn whether
        // an arbitrary email exists in the system before ever being told they're not allowed to act
        // on it. Task 12 is explicitly asked to resolve this: role-check-BEFORE-target-lookup,
        // uniform across all three change-* routes, matching changeEmail's/changeRole's ordering
        // instead of changePassword's. A request carrying `email` is therefore treated as an admin
        // action a priori (self-service calls never populate it), and the caller's role is checked
        // off the ALREADY-authenticated context.Actor -- no DB round-trip needed to know it -- before
        // any target lookup happens.
        // Review finding (JWT-trust trade-off, reviewed, accepted as a documented trade-off -- not
        // fixed, per explicit human decision -- distinct from this file's numbered "item 2"
        // elsewhere, which is about newEmail normalization): legacy re-reads the REQUESTER's
        // role/schoolId live from the DB for this check
        // (authService.ts:198: `const requester = await prisma.user.findUnique({ where: { id:
        // requesterId }, select: { roleName: true, schoolId: true } });`) rather than trusting
        // whatever role/school was stamped into the JWT at login time. This handler instead trusts
        // `context.Actor!.NormalizedRole`/`context.Tenant!.SchoolId` -- the JWT-derived request
        // context RequestContextMiddleware already populated for this request -- with NO live DB
        // re-read of the caller's current role/school. That is a real, deliberate divergence from
        // legacy's specific extra hardening on this one route (and changeEmail's, below): if an
        // admin's role/school were changed by another admin mid-session, this handler would keep
        // honoring the OLD role/school baked into their still-valid access token until it expires or
        // they re-authenticate, whereas legacy would see the change on its very next request. This
        // was raised in review and explicitly decided by Federico (human partner): accept this as
        // the same framework-wide JWT-trust trade-off already used everywhere else in this .NET port
        // (RequestContextMiddleware's whole design, ChangeRoleAsync's "admin:users" permission gate
        // just below, every other RequireIdentity-gated endpoint in this codebase) rather than add a
        // one-off live DB re-read just for these two routes. Not fixed; documented per that decision.
        AuthUserRow target;
        bool isAdminAction;
        if (!string.IsNullOrWhiteSpace(body.Email))
        {
            var requesterRole = context.Actor!.NormalizedRole;
            if (requesterRole is not (FormMapsRoles.SuperAdmin or FormMapsRoles.SchoolAdmin))
                return Forbidden("Cannot change another user's password");

            var normalizedEmail = NormalizeEmail(body.Email);
            var found = await repository.FindUserByEmailAsync(normalizedEmail, cancellationToken);
            // Cross-school target and "not found" collapse to the SAME 404 -- an existence oracle
            // otherwise leaks via a 403-vs-404 status-code difference. Only Super Admin acts cross-school.
            if (found is null || (requesterRole == FormMapsRoles.SchoolAdmin &&
                (string.IsNullOrEmpty(context.Tenant!.SchoolId) || found.SchoolId != context.Tenant.SchoolId)))
                return NotFound("Not found");

            target = found;
            isAdminAction = true;
        }
        else
        {
            var found = await repository.FindUserByIdWithRoleAsync(context.Tenant!.UserId, cancellationToken);
            if (found is null) return NotFound("User not found");
            target = found;
            isAdminAction = false;
        }

        if (!isAdminAction)
        {
            // Self-service: require + verify the current password (blocks takeover via a stolen session).
            if (string.IsNullOrEmpty(body.OldPassword) || target.PasswordHash is null)
                return BadRequest("Current password required");

            var verify = PasswordHasher.Verify(body.OldPassword, target.PasswordHash);
            if (!verify.Valid) return BadRequest("Current password is incorrect");
        }

        var hashed = PasswordHasher.Hash(body.Password);
        await repository.UpdatePasswordAsync(target.Id, hashed, cancellationToken);

        var clientIp = AuthCookieWriter.GetClientIp(httpContext.Request);
        await repository.RevokeAllRefreshTokensAsync(target.Id, clientIp, cancellationToken);

        // Best-effort notification -- legacy AWAITS this (wrapped in try/catch swallowing failures),
        // unlike forgot-password's true fire-and-forget (item 7/9: don't assume one pattern
        // generalizes -- this one is synchronous-but-non-fatal, not detached).
        try
        {
            var notice = emailTemplates.BuildPasswordChanged(target.Name, changedByAdmin: isAdminAction);
            await emailSender.SendAsync(target.Email, notice.Subject, notice.Html, cancellationToken);
        }
        catch
        {
            // best-effort, matches legacy's empty catch
        }

        return Results.Ok(new
        {
            success = true,
            message = "Password changed successfully",
            data = new { id = target.Id, email = target.Email, message = "Password updated successfully" },
        });
    }

    // =========================================================================================
    // PUT /authapi/change-email
    // =========================================================================================

    public sealed record ChangeEmailRequest(string? UserId, string? NewEmail);

    private static async Task<IResult> ChangeEmailAsync(
        ChangeEmailRequest? body, IRequestContextAccessor accessor, IProtectedRequestGuard guard, IAuthRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (body is null || string.IsNullOrWhiteSpace(body.UserId) || string.IsNullOrWhiteSpace(body.NewEmail) || !LooksLikeEmail(body.NewEmail))
            return BadRequest("userId and a valid newEmail are required");

        // Item 2: newEmail must be pre-normalized before calling ChangeEmailAsync -- the repository
        // does not normalize it itself (Task 8's interface doc).
        var newEmail = NormalizeEmail(body.NewEmail);

        // Legacy's changeEmail ALREADY does role-check-before-target-lookup correctly for both
        // branches -- no reordering needed here (unlike change-password above).
        //
        // Review finding (JWT-trust trade-off, reviewed, accepted -- not fixed, per explicit human
        // decision): same as ChangePasswordAsync above -- legacy re-reads the REQUESTER's
        // role/schoolId live from the DB here too (authService.ts:253: `const requester = await
        // prisma.user.findUnique({ where: { id: requesterId }, select: { roleName: true, schoolId:
        // true } });`), while this handler trusts the JWT-derived `context.Actor!.NormalizedRole`/
        // `context.Tenant!.SchoolId` with no live re-read. Accepted as the same framework-wide
        // JWT-trust trade-off used everywhere else in this port (see the fuller writeup on
        // ChangePasswordAsync above and task-12-report.md's fix addendum); not fixed.
        AuthUserRow target;
        if (body.UserId != context.Tenant!.UserId)
        {
            var requesterRole = context.Actor!.NormalizedRole;
            if (requesterRole is not (FormMapsRoles.SuperAdmin or FormMapsRoles.SchoolAdmin))
                return Forbidden("Cannot change another user's email");

            var found = await repository.FindUserByIdWithRoleAsync(body.UserId, cancellationToken);
            if (found is null || (requesterRole == FormMapsRoles.SchoolAdmin &&
                (string.IsNullOrEmpty(context.Tenant.SchoolId) || found.SchoolId != context.Tenant.SchoolId)))
                return NotFound("Not found");

            target = found;
        }
        else
        {
            var found = await repository.FindUserByIdWithRoleAsync(body.UserId, cancellationToken);
            if (found is null) return NotFound("User not found");
            target = found;
        }

        if (target.Email == newEmail) return BadRequest("New email must be different");

        var result = await repository.ChangeEmailAsync(target.Id, newEmail, cancellationToken);
        switch (result)
        {
            case ChangeEmailResult.Conflict:
                return Conflict("Email already in use");
            case ChangeEmailResult.NotFound:
                return NotFound("User not found");
            case ChangeEmailResult.SameEmail:
                return BadRequest("New email must be different");
        }

        return Results.Ok(new
        {
            success = true,
            message = "Email changed successfully",
            data = new
            {
                id = target.Id, name = target.Name, oldEmail = target.Email, newEmail,
                roleId = target.RoleId, roleName = target.RoleName, message = "Email updated successfully",
            },
        });
    }

    // =========================================================================================
    // PUT /authapi/change-role
    // =========================================================================================

    public sealed record ChangeRoleRequest(string? UserId, string? RoleId);

    private static async Task<IResult> ChangeRoleAsync(
        ChangeRoleRequest? body, IRequestContextAccessor accessor, IProtectedRequestGuard guard, IAuthRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        // Legacy gates this ENTIRE route behind requirePermission("admin:users") middleware, before
        // the handler body runs at all -- role-check-before-any-lookup is therefore automatic here
        // (item 1). Since school_admin's permission set does not include "admin:users" (only Super
        // Admin's does -- confirmed against lib/auth.ts's ROLE_PERMISSIONS), this permission alone
        // already fully replicates the "school_admin scoped to their own school" requirement: a
        // school_admin can never reach this handler in the first place, so no separate cross-school
        // check is needed inside it.
        if (!context.Permissions.Contains(AdminUsersPermission))
            return Results.Json(new { success = false, code = "missing_permission", message = "Insufficient permissions" }, statusCode: StatusCodes.Status403Forbidden);

        if (body is null || string.IsNullOrWhiteSpace(body.UserId) || string.IsNullOrWhiteSpace(body.RoleId))
            return BadRequest("userId and roleId are required");

        var target = await repository.FindUserByIdWithRoleAsync(body.UserId, cancellationToken);
        if (target is null) return NotFound("User not found");

        // Item 3 (post-review fix): ChangeRoleAsync's collapsed-null return folds "role not
        // found/inactive" and "user already has this role" into ONE null (plus "target not found",
        // already resolved above by pre-fetching the target ourselves). Rather than guess which of
        // the two remaining legacy messages a null return means, this handler removes the ambiguity
        // structurally -- but the PRECEDENCE of the two remaining checks matters and must match
        // legacy exactly: authService.ts's changeRole (authService.ts:299-304) checks role
        // validity/existence FIRST ("Role not found" if the role id is missing/inactive), and ONLY
        // THEN checks whether the user already has that role ("User already has this role"). An
        // earlier draft of this handler checked same-role BEFORE role validity (mirroring
        // ChangeRoleAsync's OWN internal order, which is itself inverted from legacy) -- the two
        // orderings only diverge for the overlap case, a roleId that is simultaneously the user's
        // CURRENT role AND has since been deactivated: legacy says "Role not found" for that case
        // (role validity fails first), the earlier draft said "User already has this role" (wrong).
        // Fixed by checking role validity via the standalone RoleExistsAndActiveAsync BEFORE the
        // same-role comparison, matching legacy's order exactly; only once role validity is
        // confirmed does the same-role short-circuit apply. See
        // ChangeRole_role_is_current_and_inactive_is_role_not_found_not_already_has_role for the
        // regression test proving this ordering, and task-12-report.md's fix addendum for the full
        // writeup.
        var roleIsValid = await repository.RoleExistsAndActiveAsync(body.RoleId, cancellationToken);
        if (!roleIsValid) return BadRequest("Role not found");

        if (target.RoleId == body.RoleId) return BadRequest("User already has this role");

        // By this point role validity and non-same-role are both already confirmed, so a null here
        // can only be a genuine TOCTOU race (e.g. the role was deactivated or the user's role
        // changed between the checks above and this call) -- not a designed disambiguation path.
        // "Role not found" is the safe, defensible fallback for that residual race window.
        var result = await repository.ChangeRoleAsync(body.UserId, body.RoleId, cancellationToken);
        if (result is null) return BadRequest("Role not found");

        return Results.Ok(new
        {
            success = true,
            message = "User role updated successfully",
            data = new
            {
                id = result.Id, name = result.Name, email = result.Email,
                oldRoleId = result.OldRoleId, oldRoleName = result.OldRoleName,
                newRoleId = result.NewRoleId, newRoleName = result.NewRoleName,
                message = "User role updated successfully",
            },
        });
    }

    // =========================================================================================
    // POST /authapi/school-admin/complete-registration
    // =========================================================================================

    public sealed record CompleteSchoolAdminRegistrationRequest(string? Token, string? Password, string? Name);

    private static async Task<IResult> CompleteSchoolAdminRegistrationAsync(
        CompleteSchoolAdminRegistrationRequest? body, HttpContext httpContext, IAuthRepository repository,
        AccessTokenFactory tokenFactory, CancellationToken cancellationToken)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Token) || string.IsNullOrWhiteSpace(body.Password) || string.IsNullOrWhiteSpace(body.Name))
            return BadRequest("token, password, and name are required");

        var pwError = PasswordStrength.Validate(body.Password);
        if (pwError is not null) return BadRequest(pwError);

        var school = await repository.FindSchoolByInvitationTokenAsync(body.Token, cancellationToken);
        if (school is null) return BadRequest("Invalid invitation token");

        // Item 4: FindSchoolByInvitationTokenAsync deliberately does NOT check expiry itself (Task 9)
        // -- it returns a non-null row with a past InvitationTokenExpiresAt for an expired token. This
        // handler performs that comparison itself, reproducing legacy's exact two distinct messages
        // (authService.ts:321-326): "Invalid invitation token" for an unknown/null row (above) vs.
        // "Invitation token has expired" for a known row whose expiry has passed (here).
        if (school.InvitationTokenExpiresAt is { } expiresAt && expiresAt < DateTimeOffset.UtcNow)
            return BadRequest("Invitation token has expired");

        var adminRoleId = await repository.EnsureSchoolAdminRoleAsync(cancellationToken);

        // Item 9: password hashing belongs here, not in the repository.
        var hashedPassword = PasswordHasher.Hash(body.Password);

        // Item 5: email must be pre-normalized before UpsertSchoolAdminUserAsync -- the repository
        // does not normalize it itself (Task 9's interface doc), matching legacy's
        // `const email = normalizeEmail(school.adminEmail);`.
        var normalizedEmail = NormalizeEmail(school.AdminEmail);

        var user = await repository.UpsertSchoolAdminUserAsync(
            school.Id, normalizedEmail, body.Name, hashedPassword, adminRoleId, FormMapsRoles.SchoolAdmin, cancellationToken);
        await repository.ActivateSchoolAsync(school.Id, cancellationToken);

        var permissions = RolePermissions.For(user.RoleName);
        var jwtToken = tokenFactory.CreateAccessToken(new AccessTokenClaims(
            user.Id, user.Name, user.Email, user.RoleName, user.SchoolId ?? "", permissions));

        // Legacy calls setAuthCookies(res, result.data.token) with a SINGLE argument -- only
        // access_token + logged_in are set, no refresh_token cookie (school-admin registration
        // completion does not mint a refresh token at all).
        AuthCookieWriter.SetAuthCookies(httpContext.Response, jwtToken, refreshToken: null, tokenFactory.ExpiresInSeconds);

        return Results.Ok(new
        {
            success = true,
            message = "School admin registration completed successfully",
            data = new
            {
                success = true,
                token = jwtToken,
                user = new { id = user.Id, email = user.Email, name = user.Name, role = new { name = user.RoleName }, schoolId = school.Id, permissions },
            },
        });
    }

    // =========================================================================================
    // POST /authapi/forgot-password
    // =========================================================================================

    public sealed record ForgotPasswordRequest(string? Email);

    private static IResult ForgotPasswordAsync(
        ForgotPasswordRequest? body, IServiceScopeFactory scopeFactory)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Email) || !LooksLikeEmail(body.Email))
            return BadRequest("Invalid email");

        // Item 7: read against the real legacy handler (routes/auth.ts POST /forgot-password +
        // authService.ts's forgotPassword), NOT the login handler's fire-and-forget shape -- they
        // are NOT the same pattern. Login only detaches the EMAIL SEND; its DB writes (lockout
        // bookkeeping) are synchronous, awaited before responding. forgot-password is different:
        // legacy responds FIRST (`res.json(...)`) and only THEN calls `svc.forgotPassword(email)`
        // WITHOUT awaiting it -- so the token-invalidation write, the token-creation write, AND the
        // email send are ALL fire-and-forget, all fully after the response. Reproduced exactly: the
        // 200 is returned immediately below, and every bit of work (repository calls included) runs
        // in a detached background task, in a FRESH DI scope (IServiceScopeFactory) since the
        // request's own scope may be disposed by the time this task actually runs -- resolving a
        // scoped IAuthRepository/IEmailSender/EmailTemplates off the completed request's scope would
        // be unsafe (see BillingReconciliationWorker for this codebase's existing
        // IServiceScopeFactory-per-background-unit precedent).
        _ = ProcessForgotPasswordAsync(body.Email, scopeFactory);

        return Results.Ok(new { success = true, message = "If an account exists with this email, a reset link has been sent" });
    }

    private static async Task ProcessForgotPasswordAsync(string rawEmail, IServiceScopeFactory scopeFactory)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<IAuthRepository>();
            var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();

            var email = NormalizeEmail(rawEmail);
            var user = await repository.FindUserByEmailAsync(email, CancellationToken.None);
            if (user is null) return;
            if (!user.IsActive) return; // matches legacy: no auto-reactivation, no email sent, silent

            await repository.InvalidatePriorResetTokensAsync(user.Id, CancellationToken.None);

            var rawToken = InvitationTokenGenerator.Generate();
            await repository.CreatePasswordResetTokenAsync(user.Id, HashResetToken(rawToken), TimeSpan.FromHours(1), CancellationToken.None);

            var resetUrl = FrontendUrl.Build($"/forgot-password?token={rawToken}");
            var emailTemplates = scope.ServiceProvider.GetRequiredService<EmailTemplates>();
            var message = emailTemplates.BuildPasswordReset(user.Name, resetUrl);
            await emailSender.SendAsync(user.Email, message.Subject, message.Html, CancellationToken.None);
        }
        catch
        {
            // Best-effort background work -- matches legacy's `catch (bgErr) { logger.error(...) }`.
            // No caller is listening for this task's outcome (the 200 was already sent).
        }
    }

    // =========================================================================================
    // POST /authapi/reset-password
    // =========================================================================================

    public sealed record ResetPasswordRequest(string? Token, string? Password);

    private static async Task<IResult> ResetPasswordAsync(
        ResetPasswordRequest? body, HttpContext httpContext, IAuthRepository repository, CancellationToken cancellationToken)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Token) || string.IsNullOrWhiteSpace(body.Password))
            return BadRequest("token and password are required");

        var pwError = PasswordStrength.Validate(body.Password);
        if (pwError is not null) return BadRequest(pwError);

        // Item 6: ApplyPasswordResetAsync trusts the caller to have already validated the token/user
        // pairing (Task 10). This handler MUST call FindResetTokenAsync first and reproduce legacy's
        // validation itself -- unlike school-admin-registration's two DISTINCT messages, legacy's
        // resetPassword collapses ALL FOUR causes (unknown token / already used / expired /
        // inactive user) into ONE message, "Invalid or expired reset token" (authService.ts:406-409):
        // `if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date() ||
        // !resetToken.user.isActive) { return { status: 400, message: "Invalid or expired reset token" }; }`
        var resetToken = await repository.FindResetTokenAsync(HashResetToken(body.Token), cancellationToken);
        if (resetToken is null || resetToken.UsedAt is not null || resetToken.ExpiresAt < DateTimeOffset.UtcNow || !resetToken.UserIsActive)
            return BadRequest("Invalid or expired reset token");

        var hashed = PasswordHasher.Hash(body.Password);

        // Only NOW, with a fully-validated resetTokenId/userId pair, is ApplyPasswordResetAsync
        // called -- never on unvalidated input. Legacy hardcodes the literal string "password-reset"
        // as the revokedByIp marker for the sessions this specific flow revokes (authService.ts:421:
        // `revokedByIp: "password-reset"`), NOT the requester's real client IP -- reproduced exactly,
        // even though AuthCookieWriter.GetClientIp(httpContext.Request) is available here.
        // Final whole-branch review (Important): the FindResetTokenAsync check above runs in its own
        // read-only transaction, so it cannot by itself enforce single-use -- two concurrent requests
        // carrying the same valid token both pass it. ApplyPasswordResetAsync now consumes the token
        // with a guarded UPDATE and returns false if it lost that race; collapse that onto the exact
        // same message legacy uses for every other invalid-token cause.
        var applied = await repository.ApplyPasswordResetAsync(resetToken.Id, resetToken.UserId, hashed, "password-reset", cancellationToken);
        if (!applied) return BadRequest("Invalid or expired reset token");

        return Results.Ok(new { success = true, message = "Password reset successfully" });
    }

    // =========================================================================================
    // helpers
    // =========================================================================================

    /// <summary>Port of legacy lib/normalizeEmail.ts::normalizeEmail -- trim + lowercase.</summary>
    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    /// <summary>
    /// Minimal shape check standing in for zod's z.string().email() -- this task's coverage list
    /// does not pin zod's exact per-field error text, only status codes/legacy override messages, so
    /// this is a reasonable approximation (documented in task-12-report.md) rather than a full RFC
    /// 5322 validator.
    /// </summary>
    private static bool LooksLikeEmail(string value) => value.Contains('@') && value.IndexOf('@') > 0 && value.IndexOf('@') < value.Length - 1;

    /// <summary>Port of legacy authService.ts's hashResetToken: SHA-256 hex digest of the raw token.</summary>
    private static string HashResetToken(string rawToken) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
    private static IResult Unauthorized(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status401Unauthorized);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Conflict(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status409Conflict);
}
