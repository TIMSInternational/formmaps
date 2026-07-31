using Microsoft.Net.Http.Headers;

namespace FormMaps.Api.Security;

public sealed class MutationContentTypeMiddleware(RequestDelegate next)
{
    private static readonly HashSet<string> AllowedMediaTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/json",
        "multipart/form-data"
    };

    public async Task InvokeAsync(HttpContext httpContext)
    {
        // Task 10 prereq (Task 9 adversarial review, confirmed from source): the real browser
        // @microsoft/signalr JS client sends `Content-Type: text/plain` on its hub-negotiate POST
        // (and on LongPolling sends), which this middleware would otherwise 415 -- no .NET test
        // client caught this because the .NET SignalR test client sends no Content-Type at all.
        // RequestTimeoutMiddleware.cs already exempts this same path for an analogous reason
        // (long-lived hub connections don't fit this middleware's assumptions either); mirroring
        // that precedent here. Scoped to the hub path only -- does not loosen the check for any
        // other mutation endpoint.
        if (httpContext.Request.Path.StartsWithSegments("/hubs/messages"))
        {
            await next(httpContext);
            return;
        }

        if (IsMutation(httpContext.Request.Method) &&
            !IsAllowedContentType(httpContext.Request.ContentType))
        {
            httpContext.Response.StatusCode = StatusCodes.Status415UnsupportedMediaType;
            await httpContext.Response.WriteAsJsonAsync(new
            {
                success = false,
                message = "Content-Type must be application/json or multipart/form-data"
            });
            return;
        }

        await next(httpContext);
    }

    private static bool IsMutation(string method)
    {
        return HttpMethods.IsPost(method) ||
            HttpMethods.IsPut(method) ||
            HttpMethods.IsPatch(method) ||
            HttpMethods.IsDelete(method);
    }

    private static bool IsAllowedContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return true;
        }

        return MediaTypeHeaderValue.TryParse(contentType, out var parsed) &&
            parsed.MediaType.HasValue &&
            AllowedMediaTypes.Contains(parsed.MediaType.Value);
    }
}
