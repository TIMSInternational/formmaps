using Microsoft.Extensions.Options;

namespace FormMaps.Api.Security;

public sealed class RequestBodySizeLimitMiddleware(
    RequestDelegate next,
    IOptions<ApiSecurityOptions> options)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        var limit = Math.Max(1, options.Value.JsonBodyLimitBytes);

        if (IsJson(httpContext.Request.ContentType) &&
            httpContext.Request.ContentLength > limit)
        {
            httpContext.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
            await httpContext.Response.WriteAsJsonAsync(new
            {
                success = false,
                message = "Request body too large"
            });
            return;
        }

        await next(httpContext);
    }

    private static bool IsJson(string? contentType)
    {
        return contentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true;
    }
}
