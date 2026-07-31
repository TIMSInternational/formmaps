using System.Text;
using System.Text.Json;

namespace FormMaps.Api.Security;

public sealed class JsonBodySanitizationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        // Task 4 fix round 1 (Critical finding, adversarial review): the Stripe billing webhook
        // verifies HMAC signatures over the exact raw request bytes Stripe sent (see
        // StripeWebhookVerifier -> Stripe.EventUtility.ConstructEvent). This middleware
        // re-serializes JSON bodies and swaps in the re-serialized bytes whenever they differ from
        // the original (e.g. HTML-escaping of &, <, > or different Unicode handling) -- which would
        // break signature verification for any real Stripe payload containing such characters.
        // Mirrors the /hubs/messages exemption pattern in MutationContentTypeMiddleware/
        // RequestTimeoutMiddleware. Scoped to the webhook path only -- does not loosen sanitization
        // for any other mutation endpoint.
        if (httpContext.Request.Path.StartsWithSegments("/api/v1/billing/webhook"))
        {
            await next(httpContext);
            return;
        }

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
