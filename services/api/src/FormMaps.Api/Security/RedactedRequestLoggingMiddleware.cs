using System.Diagnostics;

namespace FormMaps.Api.Security;

public sealed class RedactedRequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RedactedRequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        var safeUrl = RequestLogRedactor.RedactUrl(
            $"{httpContext.Request.PathBase}{httpContext.Request.Path}{httpContext.Request.QueryString}");

        httpContext.Items["FormMaps.SafeUrl"] = safeUrl;

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await next(httpContext);
        }
        finally
        {
            stopwatch.Stop();
            logger.LogInformation(
                "HTTP {Method} {SafeUrl} responded {StatusCode} in {ElapsedMilliseconds}ms",
                httpContext.Request.Method,
                safeUrl,
                httpContext.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
    }
}
