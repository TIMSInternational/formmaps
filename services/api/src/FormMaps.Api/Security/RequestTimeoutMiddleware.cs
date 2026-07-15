using Microsoft.Extensions.Options;

namespace FormMaps.Api.Security;

public sealed class RequestTimeoutMiddleware(
    RequestDelegate next,
    IOptions<ApiSecurityOptions> options)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        var timeout = TimeSpan.FromMilliseconds(Math.Max(1, options.Value.RequestTimeoutMilliseconds));
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(httpContext.RequestAborted);
        timeoutCts.CancelAfter(timeout);

        var originalToken = httpContext.RequestAborted;
        httpContext.RequestAborted = timeoutCts.Token;

        try
        {
            await next(httpContext);
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested && !originalToken.IsCancellationRequested)
        {
            if (!httpContext.Response.HasStarted)
            {
                httpContext.Response.StatusCode = StatusCodes.Status504GatewayTimeout;
                await httpContext.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "Request timeout"
                });
            }
        }
        finally
        {
            httpContext.RequestAborted = originalToken;
        }
    }
}
