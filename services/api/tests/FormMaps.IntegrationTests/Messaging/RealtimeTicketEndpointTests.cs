// services/api/tests/FormMaps.IntegrationTests/Messaging/RealtimeTicketEndpointTests.cs
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// End-to-end coverage for the two security-critical properties of Task 7's realtime layer:
/// 1. POST /api/v1/messages/realtime-ticket mints a genuinely short-lived ticket (30s TTL, ~60s once
///    ClockSkew is counted — see RealtimeTicketFactory.TicketLifetime), gated behind
///    the normal cookie/header identity guard like any other messages endpoint.
/// 2. That ticket authenticates a REAL SignalR connection to /hubs/messages via the query-string
///    fallback -- and the SAME query-string fallback is inert everywhere else, proven both by a raw
///    REST call (?access_token= on a non-hub endpoint) and by a hub connection attempt with no token at
///    all. This exercises the actual ASP.NET Core pipeline (middleware order, DI scoping into the hub's
///    OnConnectedAsync), not just the isolated ExtractToken unit added to LegacyJwtRequestContextFactoryTests.
/// </summary>
[Collection(nameof(JwtSecretCollection))]
public class RealtimeTicketEndpointTests : IDisposable
{
    // formmaps#37: restores whatever JWT_SECRET was before this class ran. Membership in
    // JwtSecretCollection serializes these classes; this scope stops the value leaking
    // between them (ApiSecurityUtilityTests asserts it is ABSENT).
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes-long";

    // The scope replaces this class's previous bare constructor
    // Environment.SetEnvironmentVariable call, which never restored the prior value.
    private readonly JwtSecretScope jwtSecretScope = new(Secret);
    public void Dispose() => jwtSecretScope.Dispose();

    [Fact]
    public async Task Anonymous_request_is_401()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/messages/realtime-ticket", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Authenticated_request_mints_a_ticket_that_expires_in_about_30_seconds()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");

        // The advertised expiresIn must equal the real TTL -- these drifted apart once (60 advertised,
        // ~90 effective), which is the bug RealtimeTicketFactory.TicketLifetime now documents.
        Assert.Equal(30, data.GetProperty("expiresIn").GetInt32());

        var ticket = data.GetProperty("ticket").GetString();
        Assert.NotNull(ticket);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(ticket);
        Assert.Equal("caller-1", jwt.Subject);
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(35), $"ValidTo was {jwt.ValidTo:O}");
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(15), $"ValidTo was {jwt.ValidTo:O}");
    }

    [Fact]
    public async Task Ticket_authenticates_a_real_hub_connection_via_the_query_string()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var ticket = await GetTicketAsync(client);

        // Deliberately NOT using AccessTokenProvider: the .NET SignalR client sends that as an
        // Authorization: Bearer header on every request, even for LongPolling -- which would never
        // exercise ExtractToken's query-string fallback (the fallback exists for browsers, which can't
        // set custom headers on a native WebSocket/EventSource handshake). Baking the ticket directly
        // into the connection URL instead mirrors what a real browser JS client does: it appears in
        // negotiate/poll/send as a literal ?access_token= query parameter.
        var url = new Uri(client.BaseAddress!, $"hubs/messages?access_token={Uri.EscapeDataString(ticket)}");
        await using var connection = new HubConnectionBuilder()
            .WithUrl(url, options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

        // OnConnectedAsync calls Context.Abort() (not an exception) when unauthenticated, so a
        // successful StartAsync here is NOT by itself proof of authentication -- Context.Abort() doesn't
        // fail the initial handshake for every transport. The delayed re-check below is the actual
        // assertion: it catches the case where the connection is silently torn down a moment after
        // connecting (exactly how the DI-scope bug in MessagesHub.OnConnectedAsync shipped undetected --
        // every connection "succeeded" at StartAsync and then died ~1-3s later).
        await connection.StartAsync();
        Assert.Equal(HubConnectionState.Connected, connection.State);

        await Task.Delay(TimeSpan.FromSeconds(3));
        Assert.Equal(HubConnectionState.Connected, connection.State);
    }

    [Fact]
    public async Task Connected_client_receives_a_push_sent_through_the_notifier()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var ticket = await GetTicketAsync(client); // minted for "caller-1"
        var url = new Uri(client.BaseAddress!, $"hubs/messages?access_token={Uri.EscapeDataString(ticket)}");
        await using var connection = new HubConnectionBuilder()
            .WithUrl(url, options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

        var received = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<JsonElement>("messageReceived", payload => received.TrySetResult(payload));

        await connection.StartAsync();

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var notifier = scope.ServiceProvider.GetRequiredService<IMessagesRealtimeNotifier>();
            await notifier.NotifyMessageReceivedAsync("caller-1", new { id = "m-1", text = "hello" });
        }

        var completed = await Task.WhenAny(received.Task, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.Same(received.Task, completed);
        var payload = await received.Task;
        Assert.Equal("m-1", payload.GetProperty("id").GetString());
    }

    [Fact]
    public async Task Hub_connection_with_no_token_is_aborted()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(client.BaseAddress!, "hubs/messages"), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

        var closedTcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.Closed += _ => { closedTcs.TrySetResult(); return Task.CompletedTask; };

        var startFailed = false;
        try
        {
            await connection.StartAsync();
        }
        catch
        {
            startFailed = true;
        }

        if (!startFailed)
        {
            // Context.Abort() during OnConnectedAsync doesn't fail the initial handshake for every
            // transport -- give the server a moment to tear the connection down and observe Closed.
            var completed = await Task.WhenAny(closedTcs.Task, Task.Delay(TimeSpan.FromSeconds(5)));
            Assert.Same(closedTcs.Task, completed);
        }

        Assert.NotEqual(HubConnectionState.Connected, connection.State);
    }

    [Fact]
    public async Task Ticket_used_as_query_string_on_a_non_hub_endpoint_is_still_401()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var ticket = await GetTicketAsync(client);

        // No cookie, no Authorization header -- only the query-string token, on an ordinary REST route.
        var response = await client.PostAsync(
            $"/api/v1/messages/conversations?access_token={ticket}",
            new StringContent("""{"recipientId":"someone"}""", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Ticket_replayed_as_a_bearer_header_on_a_non_hub_endpoint_is_rejected()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var ticket = await GetTicketAsync(client);

        // Same secret/issuer/audience as a normal session JWT -- without a distinguishing claim, this
        // would otherwise be a fully valid Authorization: Bearer credential against ANY RequireIdentity
        // REST endpoint for its ~60s lifetime, not just the hub. Proves the ticket is scoped by content,
        // not merely by how LegacyJwtRequestContextFactory.ExtractToken happens to find it.
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/messages/conversations")
        {
            Content = new StringContent("""{"recipientId":"someone"}""", Encoding.UTF8, "application/json"),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ticket);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// Task 9 follow-up regression test. The bug this pins: the ticket's TTL is NOT the whole story --
    /// LegacyJwtOptions.ClockSkew (30s) is applied to every token including this one, so the EFFECTIVE
    /// acceptance window is TTL + skew. With the original 60s TTL that was ~90s, and a ticket was still
    /// accepted a full 61s after minting (measured, not theorised). The TTL is now 30s so that 30 + 30
    /// lands on the ~60s the design always intended.
    ///
    /// Deliberately wall-clock rather than a forged token with a hand-picked `exp`: a forged token proves
    /// only that lifetime validation runs, and would have passed happily against the buggy 60s TTL. Only
    /// minting a REAL ticket through the REAL endpoint and letting real time pass measures the number
    /// that actually shipped. Both probes reuse ONE ticket measured from a single mint instant, so the
    /// whole test costs ~70s rather than 110s.
    /// </summary>
    [Fact]
    public async Task Ticket_effective_hub_window_is_bounded_at_about_60_seconds_including_clock_skew()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        // Warm the host BEFORE the clock starts. Every offset below is measured from `mintedAt`, but the
        // server stamps `exp` when it actually mints -- so any latency between those two instants shifts
        // the real expiry later than this test believes. The FIRST request to a WebApplicationFactory
        // builds the whole host and JITs the pipeline, which is sub-second on an idle machine but several
        // seconds under a loaded parallel suite run; that alone was enough to push the t=65s probe back
        // inside the real window and fail this test intermittently (observed: green in isolation, red in
        // the full Messaging run). This throwaway mint absorbs that cost so `mintedAt` is honest.
        await GetTicketAsync(client);

        var mintedAt = DateTime.UtcNow;
        var ticket = await GetTicketAsync(client);

        // Comfortably INSIDE the intended window (30s TTL + 30s skew = ~60s): must still connect, so a
        // future over-tightening that breaks legitimate browsers fails here rather than in production.
        await DelayUntilAsync(mintedAt, TimeSpan.FromSeconds(45));
        Assert.Equal(HubConnectionState.Connected, await TryConnectAsync(factory, client, ticket));

        // Just PAST it. Against the original 60s TTL this connected (60 + 30 = 90s of runway) -- that is
        // precisely the bug, and this assertion is what catches its return.
        await DelayUntilAsync(mintedAt, TimeSpan.FromSeconds(65));
        Assert.NotEqual(HubConnectionState.Connected, await TryConnectAsync(factory, client, ticket));
    }

    private static async Task DelayUntilAsync(DateTime start, TimeSpan offsetFromStart)
    {
        var remaining = start + offsetFromStart - DateTime.UtcNow;
        if (remaining > TimeSpan.Zero) await Task.Delay(remaining);
    }

    private static async Task<HubConnectionState> TryConnectAsync(Factory factory, HttpClient client, string ticket)
    {
        var url = new Uri(client.BaseAddress!, $"hubs/messages?access_token={Uri.EscapeDataString(ticket)}");
        await using var connection = new HubConnectionBuilder()
            .WithUrl(url, options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

        var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.Closed += _ => { closed.TrySetResult(); return Task.CompletedTask; };

        try
        {
            await connection.StartAsync();
        }
        catch
        {
            return HubConnectionState.Disconnected;
        }

        // Context.Abort() during OnConnectedAsync does not fail the LongPolling handshake -- the teardown
        // arrives a moment later, so a bare post-StartAsync state read would report a false Connected.
        await Task.WhenAny(closed.Task, Task.Delay(TimeSpan.FromSeconds(3)));
        return connection.State;
    }

    private static async Task<string> GetTicketAsync(HttpClient client)
    {
        var response = await Send(client);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").GetProperty("ticket").GetString()!;
    }

    private static Task<HttpResponseMessage> Send(HttpClient client)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/messages/realtime-ticket");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "student");
        return client.SendAsync(request);
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                // Minimal API resolves every declared service-type endpoint parameter (including
                // IMessagesRepository on /conversations) BEFORE the handler body -- and therefore before
                // guard.RequireIdentity runs -- so a real repository (which needs a configured Postgres
                // connection string this test intentionally doesn't provide) would 500 regardless of auth
                // outcome. Swapping in a throwing fake keeps that DI resolution succeeding while still
                // proving, via the assertions below, that an unauthenticated/wrongly-scoped request never
                // actually reaches it.
                services.RemoveAll<IMessagesRepository>();
                services.AddSingleton<IMessagesRepository>(new ThrowingMessagesRepository());
            });
        }
    }

    private sealed class ThrowingMessagesRepository : IMessagesRepository
    {
        private static Exception Unexpected() =>
            new InvalidOperationException("IMessagesRepository should not be reached for an unauthenticated/out-of-scope request.");

        public Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<IReadOnlyList<ContactRow>> GetContactsAsync(
            RequestContext context, string userId, string role, string? schoolId, string? search,
            CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<CreateConversationResult> CreateConversationAsync(
            RequestContext context, string userId, string role, string? schoolId, string targetId,
            CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<ConversationMessagesResult> GetConversationMessagesAsync(
            RequestContext context, string userId, string conversationId, int page, int limit,
            CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<SendMessageResult> SendMessageAsync(
            RequestContext context, string userId, string conversationId, string content,
            CancellationToken cancellationToken = default) =>
            throw Unexpected();

        public Task<int> BroadcastAsync(
            RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
            CancellationToken cancellationToken = default) =>
            throw Unexpected();
    }
}
