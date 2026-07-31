using Microsoft.Extensions.Options;

namespace FormMaps.Api.Security;

public sealed class RequestTimeoutMiddleware(
    RequestDelegate next,
    IOptions<ApiSecurityOptions> options)
{
    public async Task InvokeAsync(HttpContext httpContext)
    {
        // Task 7 fix (Finding 4): SignalR hub connections are long-lived by design (WebSocket/long-
        // polling), so a fixed request timeout doesn't apply. Empirically verified against a real Kestrel
        // host with a real WebSocket-transport SignalR client: the CancelAfter-based RequestAborted swap
        // below did NOT terminate an already-upgraded /hubs/messages connection (survived 10s+ against
        // timeouts as low as 1ms) -- but relying on that as an unwritten implementation detail of how
        // SignalR's WebSocket accept interacts with a swapped-in token is fragile (version-dependent,
        // untested under production reverse-proxy topologies), and leaving it in place would also hold
        // this middleware's own CancellationTokenSource/timer alive for the connection's entire lifetime.
        // Excluding the hub path explicitly removes both concerns.
        if (httpContext.Request.Path.StartsWithSegments("/hubs/messages"))
        {
            await next(httpContext);
            return;
        }

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
