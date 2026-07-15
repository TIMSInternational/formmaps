using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

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
