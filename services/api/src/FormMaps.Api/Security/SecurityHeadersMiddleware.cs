namespace FormMaps.Api.Security;

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        httpContext.Response.OnStarting(() =>
        {
            var headers = httpContext.Response.Headers;

            headers["X-FormMaps-Service"] = "formmaps-api";
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            headers["X-Content-Type-Options"] = "nosniff";
            headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
            headers.Pragma = "no-cache";
            headers.Expires = "0";

            return Task.CompletedTask;
        });

        await next(httpContext);
    }
}
