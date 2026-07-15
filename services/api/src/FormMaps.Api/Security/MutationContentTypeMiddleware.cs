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
