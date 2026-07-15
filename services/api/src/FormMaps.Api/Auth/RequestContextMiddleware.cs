using FormMaps.Application.Auth;

namespace FormMaps.Api.Auth;

public sealed class RequestContextMiddleware(
    RequestDelegate next,
    LegacyJwtRequestContextFactory requestContextFactory)
{
    public async Task InvokeAsync(HttpContext httpContext, IRequestContextAccessor requestContextAccessor)
    {
        requestContextAccessor.Current = requestContextFactory.Create(httpContext);

        await next(httpContext);
    }
}
