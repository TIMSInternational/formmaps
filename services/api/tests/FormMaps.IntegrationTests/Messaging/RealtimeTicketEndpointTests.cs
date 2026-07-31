// services/api/tests/FormMaps.IntegrationTests/Messaging/RealtimeTicketEndpointTests.cs
using System.IdentityModel.Tokens.Jwt;
using System.Net;
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
/// 1. POST /api/v1/messages/realtime-ticket mints a genuinely short-lived (~60s) ticket, gated behind
///    the normal cookie/header identity guard like any other messages endpoint.
/// 2. That ticket authenticates a REAL SignalR connection to /hubs/messages via the query-string
///    fallback -- and the SAME query-string fallback is inert everywhere else, proven both by a raw
///    REST call (?access_token= on a non-hub endpoint) and by a hub connection attempt with no token at
///    all. This exercises the actual ASP.NET Core pipeline (middleware order, DI scoping into the hub's
///    OnConnectedAsync), not just the isolated ExtractToken unit added to LegacyJwtRequestContextFactoryTests.
/// </summary>
public class RealtimeTicketEndpointTests
{
    public RealtimeTicketEndpointTests() =>
        Environment.SetEnvironmentVariable("JWT_SECRET", "formmaps-test-secret-that-is-at-least-32-bytes-long");

    [Fact]
    public async Task Anonymous_request_is_401()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/messages/realtime-ticket", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Authenticated_request_mints_a_ticket_that_expires_in_about_60_seconds()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var response = await Send(client);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(60, data.GetProperty("expiresIn").GetInt32());

        var ticket = data.GetProperty("ticket").GetString();
        Assert.NotNull(ticket);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(ticket);
        Assert.Equal("caller-1", jwt.Subject);
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(65));
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(30));
    }

    [Fact]
    public async Task Ticket_authenticates_a_real_hub_connection_via_the_query_string()
    {
        using var factory = new Factory();
        using var client = factory.CreateClient();

        var ticket = await GetTicketAsync(client);

        await using var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(client.BaseAddress!, "hubs/messages"), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
                options.AccessTokenProvider = () => Task.FromResult<string?>(ticket);
            })
            .Build();

        // OnConnectedAsync calls Context.Abort() (not an exception) when unauthenticated, so a
        // successful StartAsync here is a real assertion that the query-string token authenticated --
        // not just that the HTTP handshake succeeded.
        await connection.StartAsync();
        Assert.Equal(HubConnectionState.Connected, connection.State);
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
    }
}
