using System.Text;
using System.Text.Json;

namespace FormMaps.Api.Security;

public sealed class JsonBodySanitizationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (!ShouldSanitize(httpContext.Request))
        {
            await next(httpContext);
            return;
        }

        httpContext.Request.EnableBuffering();

        using var reader = new StreamReader(
            httpContext.Request.Body,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false,
            leaveOpen: true);

        var body = await reader.ReadToEndAsync(httpContext.RequestAborted);
        httpContext.Request.Body.Position = 0;

        if (string.IsNullOrWhiteSpace(body))
        {
            await next(httpContext);
            return;
        }

        try
        {
            var sanitized = JsonBodySanitizer.SanitizeJson(body);
            if (!string.Equals(body, sanitized, StringComparison.Ordinal))
            {
                var bytes = Encoding.UTF8.GetBytes(sanitized);
                httpContext.Request.Body = new MemoryStream(bytes);
                httpContext.Request.ContentLength = bytes.Length;
            }
        }
        catch (JsonException)
        {
            httpContext.Request.Body.Position = 0;
        }

        await next(httpContext);
    }

    private static bool ShouldSanitize(HttpRequest request)
    {
        return IsMutation(request.Method) &&
            request.ContentLength > 0 &&
            request.ContentType?.StartsWith("application/json", StringComparison.OrdinalIgnoreCase) == true;
    }

    private static bool IsMutation(string method)
    {
        return HttpMethods.IsPost(method) ||
            HttpMethods.IsPut(method) ||
            HttpMethods.IsPatch(method) ||
            HttpMethods.IsDelete(method);
    }
}
