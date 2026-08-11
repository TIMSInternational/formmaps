using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Diagnostic group for the request-context pipeline. Two routes, with DIFFERENT auth postures on
/// purpose. Both were re-measured against a local build on 2026-08-10 (formmaps#109); record what was
/// found here so the next audit does not re-file it a third time.
///
/// <para><c>GET /current</c> is ANONYMOUS BY DESIGN and returns 200 without a credential. It is not an
/// exposure, and the reason is specific: <see cref="ToResponse" /> serialises nothing but
/// <see cref="IRequestContextAccessor.Current" /> -- the caller's OWN context, derived entirely from the
/// caller's own token by <c>LegacyJwtRequestContextFactory</c>. It reads no database and touches no other
/// user. Anonymously it answers
/// <c>{isAuthenticated:false, actor:null, tenant:null, permissions:[], tokenSource:"None",
/// failureReason:"no_token"}</c>; with a credential it echoes back claims the holder already possesses
/// and could decode locally. The one thing it adds is a token-validation oracle
/// (<c>failureReason</c> distinguishes no_token / invalid_token / token_expired /
/// missing_required_claims), which is not meaningful here: the tokens are HS256 with issuer, audience,
/// lifetime and an explicit algorithm allowlist enforced, so there is nothing to steer, and any guarded
/// route already leaks the same distinction via 200-vs-401. For calibration, the unconditional
/// <c>GET /version</c> in Program.cs discloses strictly MORE to an anonymous caller (exact runtime
/// version and environment name). Do not "harden" this route without a finding that names data it
/// actually reveals.</para>
///
/// <para><c>GET /protected-smoke</c> IS GUARDED -- it calls
/// <see cref="IProtectedRequestGuard.RequireTenantContext" /> and returns <c>decision.StatusCode</c>
/// (measured: 401 <c>missing_identity</c> anonymously). formmaps#109's route table lists only
/// <c>/current</c> for this group and omits this route entirely; that omission understates the group and
/// should not be read as a claim that this route is open. It is the deliberate positive control for the
/// guard, and the pair (200 here, 401 there) is what makes the group useful as a smoke test at all.</para>
///
/// <para>Neither route is reachable through app.formmaps.com: there is no <c>/api/v1/context</c> rewrite
/// in apps/web/next.config.ts, so Node answers (and 404s) the whole prefix. That half of #109 is
/// accurate. Mapped-but-unreachable is the real defect class here, NOT the anonymous 200.</para>
/// </summary>
public static class RequestContextEndpoints
{
    public static IEndpointRouteBuilder MapRequestContextEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/context")
            .WithTags("Request Context");

        group.MapGet("/current", (IRequestContextAccessor requestContextAccessor) =>
            Results.Ok(new
            {
                success = true,
                data = ToResponse(requestContextAccessor.Current)
            }));

        group.MapGet("/protected-smoke", (
            IRequestContextAccessor requestContextAccessor,
            IProtectedRequestGuard guard) =>
        {
            var decision = guard.RequireTenantContext(requestContextAccessor.Current);
            if (!decision.Allowed)
            {
                return Results.Json(
                    new
                    {
                        success = false,
                        code = decision.Code,
                        message = decision.Message
                    },
                    statusCode: decision.StatusCode);
            }

            return Results.Ok(new
            {
                success = true,
                data = ToResponse(requestContextAccessor.Current)
            });
        });

        return app;
    }

    private static object ToResponse(RequestContext context)
    {
        return new
        {
            isAuthenticated = context.IsAuthenticated,
            actor = context.Actor is null
                ? null
                : new
                {
                    userId = context.Actor.UserId,
                    role = context.Actor.NormalizedRole,
                    email = context.Actor.Email,
                    name = context.Actor.Name
                },
            tenant = context.Tenant is null
                ? null
                : new
                {
                    userId = context.Tenant.UserId,
                    schoolId = context.Tenant.SchoolId,
                    isSuperAdmin = context.Tenant.IsSuperAdmin
                },
            permissions = context.Permissions.Order(StringComparer.Ordinal).ToArray(),
            tokenSource = context.TokenSource.ToString(),
            isDevelopmentOverride = context.IsDevelopmentOverride,
            failureReason = context.FailureReason
        };
    }
}
