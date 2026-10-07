using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Api.Auth;

public sealed class RequestContextMiddleware(
    RequestDelegate next,
    LegacyJwtRequestContextFactory requestContextFactory)
{
    /// <summary>
    /// Task 7 fix: SignalR resolves a hub instance from a FRESH DI scope per hub invocation (via the
    /// root IServiceScopeFactory), not the scope tied to the original HTTP request -- so a hub reading
    /// the scoped IRequestContextAccessor sees a different instance than the one this middleware just
    /// populated, and always observes RequestContext.Anonymous(). HttpContext.Items is plain data (not a
    /// DI-scoped service), captured once here at request time and still reachable from
    /// HubCallerContext.GetHttpContext() during OnConnectedAsync for the connection's original HTTP
    /// request -- unlike re-resolving IRequestContextAccessor from httpContext.RequestServices inside the
    /// hub, which for long-polling reads back unauthenticated due to HttpContext recycling across polls.
    /// </summary>
    public const string RequestContextItemsKey = "FormMaps.RequestContext";

    public async Task InvokeAsync(HttpContext httpContext, IRequestContextAccessor requestContextAccessor)
    {
        var context = requestContextFactory.Create(httpContext);

        // Super Admin "act as a school" (ActingSchool). Every other role's header is ignored without a lookup, so it
        // can never widen a school admin's reach. The school must exist: a typo fails here, not as a row pointing
        // at no school.
        var actingSchoolId = context.Actor?.IsSuperAdmin == true ? ActingSchool.ReadHeader(httpContext.Request) : null;
        if (actingSchoolId is not null)
        {
            // Resolved here, not injected: only this rare request pays for a database-backed service.
            if (!ActingSchool.IsSchoolIdShape(actingSchoolId) ||
                !await httpContext.RequestServices.GetRequiredService<ISchoolExistenceChecker>()
                    .SchoolExistsAsync(context, actingSchoolId, httpContext.RequestAborted))
            {
                httpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                await httpContext.Response.WriteAsJsonAsync(
                    new { success = false, message = ActingSchool.UnknownSchoolMessage }, httpContext.RequestAborted);
                return;
            }

            context = context.WithActingSchool(actingSchoolId);
        }

        requestContextAccessor.Current = context;
        httpContext.Items[RequestContextItemsKey] = context;

        await next(httpContext);
    }
}
