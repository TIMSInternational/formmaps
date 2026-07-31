// services/api/tests/FormMaps.IntegrationTests/Messaging/MessagesEndpointAdversarialTests.cs
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
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
using Microsoft.IdentityModel.Tokens;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// Task 9 (adversarial access-control review), pipeline half -- the parts of the authorization boundary
/// that live in the endpoint/middleware layer rather than in MessagesRepository's SQL (which
/// <see cref="MessagesAdversarialAccessTests"/> covers against a real database).
/// </summary>
public sealed class MessagesEndpointAdversarialTests
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes-long";
    private const string Issuer = "formmaps-api";
    private const string Audience = "formmaps-frontend";

    public MessagesEndpointAdversarialTests() => Environment.SetEnvironmentVariable("JWT_SECRET", Secret);

    // =========================================================================
    // Angle 2 -- the legacy `counselorId` backward-compat field must not be an authorization side door.
    // =========================================================================

    [Fact]
    public async Task Angle2_counselorId_body_field_is_routed_through_the_same_authorization_path_as_recipientId()
    {
        // The gap this rules out: `counselorId` reaching the repository by a path that skips the
        // role/assignment matrix (e.g. an "already a counselor, therefore trusted" short-circuit).
        // MessagesEndpoints only aliases the field -- everything downstream sees one `targetId`, and
        // MessagesAdversarialAccessTests.Angle2_* proves the student->unassigned-counselor case is
        // Forbidden at the SQL layer. Together those two close the angle end to end.
        var repository = new CapturingMessagesRepository(
            new CreateConversationResult(CreateConversationStatus.Forbidden, null, "You are not assigned to this counselor"));
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        var response = await PostAsync(client, "/api/v1/messages/conversations", """{"counselorId":"counselor-9"}""");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("counselor-9", repository.LastTargetId);
        Assert.Equal("student", repository.LastRole);
        Assert.Equal("student-1", repository.LastUserId);
        Assert.Equal("school-1", repository.LastSchoolId);
    }

    [Fact]
    public async Task Angle2_role_passed_to_the_repository_comes_from_the_token_not_the_body()
    {
        // A caller cannot smuggle a privileged role through the request body: the endpoint reads
        // NormalizedRole off the authenticated actor and ignores unknown body properties entirely.
        var repository = new CapturingMessagesRepository(
            new CreateConversationResult(CreateConversationStatus.Forbidden, null, "no"));
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        await PostAsync(client, "/api/v1/messages/conversations",
            """{"counselorId":"counselor-9","role":"super admin","schoolId":"school-999"}""");

        Assert.Equal("student", repository.LastRole);
        Assert.Equal("school-1", repository.LastSchoolId);
    }

    [Fact]
    public async Task Angle2_recipientId_takes_precedence_when_both_fields_are_supplied()
    {
        // Legacy: `const targetId = body.data.recipientId || body.data.counselorId`. Pinning the same
        // precedence here rules out a variant where supplying both fields lets one check run against
        // recipientId while the conversation is actually created against counselorId.
        var repository = new CapturingMessagesRepository(
            new CreateConversationResult(CreateConversationStatus.Forbidden, null, "no"));
        using var factory = new Factory(repository);
        using var client = factory.CreateClient();

        await PostAsync(client, "/api/v1/messages/conversations",
            """{"recipientId":"recipient-1","counselorId":"counselor-9"}""");

        Assert.Equal("recipient-1", repository.LastTargetId);
    }

    // =========================================================================
    // Angle 5 -- the ?access_token= fallback is hub-path-only, independent of the scope claim.
    // =========================================================================

    [Fact]
    public async Task Angle5_full_session_shaped_token_in_the_query_string_is_inert_on_a_rest_endpoint()
    {
        // Complements RealtimeTicketEndpointTests' two ticket-replay tests, which both use a
        // hub-SCOPED token and therefore also trip the scope guard. This token carries NO scope claim
        // -- it is indistinguishable from a real 60-minute session JWT -- so the ONLY thing that can
        // reject it is ExtractToken's StartsWithSegments("/hubs/messages") path gate.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var sessionToken = Mint(TimeSpan.FromMinutes(60), hubScoped: false);

        var get = await client.GetAsync($"/api/v1/messages/unread-count?access_token={Uri.EscapeDataString(sessionToken)}");
        Assert.Equal(HttpStatusCode.Unauthorized, get.StatusCode);

        var post = await PostAsync(client, $"/api/v1/messages/conversations?access_token={Uri.EscapeDataString(sessionToken)}",
            """{"recipientId":"someone"}""", authenticated: false);
        Assert.Equal(HttpStatusCode.Unauthorized, post.StatusCode);
    }

    [Fact]
    public async Task Angle5_the_same_token_as_a_bearer_header_is_accepted_proving_only_the_query_path_is_gated()
    {
        // Control for the test above: without this, an inert-everywhere token would be indistinguishable
        // from a correctly path-gated one. Same token, same endpoint, header instead of query -> 200.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/messages/unread-count");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Mint(TimeSpan.FromMinutes(60), hubScoped: false));

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Angle5_hub_scoped_ticket_is_rejected_on_every_non_hub_path_shape()
    {
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var ticket = Mint(TimeSpan.FromSeconds(60), hubScoped: true);

        foreach (var path in new[]
        {
            "/api/v1/messages/unread-count",
            "/api/v1/messages/contacts",
            "/api/v1/messages/conversations",
            "/hubs/messages-lookalike",
        })
        {
            var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ticket);
            var response = await client.SendAsync(request);

            // 401 on the real routes; 404 on the lookalike (no such route) -- either way, never 200.
            Assert.True(
                response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.NotFound,
                $"{path} returned {(int)response.StatusCode}");
        }
    }

    // =========================================================================
    // Angle 6 -- the realtime ticket's expiry is genuinely enforced on the hub connection.
    // =========================================================================

    [Fact]
    public async Task Angle6_expired_hub_ticket_cannot_connect_to_the_hub()
    {
        // Equivalent to minting a ticket and waiting past its lifetime, but deterministic: this token is
        // byte-for-byte the shape RealtimeTicketFactory produces (same secret/issuer/audience/sub/role,
        // scope=hub) with an `exp` already in the past. Signature and scope are both VALID here, so the
        // only thing that can reject it is ValidateLifetime/RequireExpirationTime in
        // LegacyJwtRequestContextFactory.BuildValidationParameters.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var expired = Mint(TimeSpan.FromSeconds(-120), hubScoped: true);

        await AssertHubConnectionRejectedAsync(factory, client, expired);
    }

    [Fact]
    public async Task Angle6_effective_ticket_window_is_60s_plus_the_configured_30s_clock_skew_documented_not_fixed()
    {
        // DOCUMENTED FINDING (Task 9), deliberately NOT fixed -- this test pins the real behavior so a
        // future tightening is a conscious change rather than an accident.
        //
        // Confirmed by wall clock, not just by this forged token: minting a REAL ticket via
        // POST /api/v1/messages/realtime-ticket and then sleeping before connecting gives
        //   61s wait -> HubConnectionState.Connected
        //   95s wait -> HubConnectionState.Disconnected
        //
        // LegacyJwtOptions.ClockSkew defaults to 30s and is applied to EVERY token, including the
        // realtime ticket (LegacyJwtRequestContextFactory.cs:115). So the ticket documented as "60s" is
        // in practice accepted for up to ~90s. Not fixed because: (a) the ticket is scope-restricted to
        // /hubs/messages, where the only capability it grants is joining a push-only group for its own
        // `sub`; (b) 30s is already a deliberate tightening of MS Identity's 300s default; and
        // (c) forcing zero skew for tickets would make hub connects fail on any clock drift between the
        // instance that minted the ticket and the instance that validates it behind the load balancer.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var justExpired = Mint(TimeSpan.FromSeconds(-10), hubScoped: true);

        var url = new Uri(client.BaseAddress!, $"hubs/messages?access_token={Uri.EscapeDataString(justExpired)}");
        await using var connection = BuildConnection(factory, url);

        await connection.StartAsync();
        await Task.Delay(TimeSpan.FromSeconds(3));

        Assert.Equal(HubConnectionState.Connected, connection.State);
    }

    [Fact]
    public async Task Angle6_token_expired_beyond_the_clock_skew_is_rejected_on_the_hub()
    {
        // The other side of the boundary asserted above: 31s past expiry (just outside the 30s skew) is
        // already rejected, so the window really is bounded at 60s + skew and does not extend further.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        await AssertHubConnectionRejectedAsync(factory, client, Mint(TimeSpan.FromSeconds(-31), hubScoped: true));
    }

    [Fact]
    public async Task Angle6_ticket_signed_with_a_different_secret_cannot_connect_to_the_hub()
    {
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var forged = Mint(TimeSpan.FromSeconds(60), hubScoped: true,
            secret: "an-entirely-different-secret-that-is-at-least-32-bytes");

        await AssertHubConnectionRejectedAsync(factory, client, forged);
    }

    // =========================================================================
    // Handoff to Task 10 (frontend wiring) -- NOT an access-control gap; recorded here because it is
    // only observable through the real HTTP pipeline.
    // =========================================================================

    [Fact]
    public async Task Task10_handoff_hub_negotiate_with_the_browser_clients_text_plain_content_type_is_415()
    {
        // MutationContentTypeMiddleware (Security/ApiSecurityExtensions.cs:99) allows only
        // application/json and multipart/form-data on POST/PUT/PATCH/DELETE, and is registered globally
        // with NO hub exemption -- unlike RequestTimeoutMiddleware, which explicitly exempts
        // /hubs/messages (Security/RequestTimeoutMiddleware.cs:20).
        //
        // The browser SignalR JS client posts negotiate (and every LongPolling send) with
        // "Content-Type: text/plain;charset=UTF-8", so it is rejected 415 before reaching the hub. No
        // .NET test client exercised this: the .NET SignalR client sends no Content-Type on negotiate,
        // and IsAllowedContentType returns true for a MISSING content type -- which is exactly why
        // Tasks 1-8 never saw it. This is fail-CLOSED (it blocks, never grants), so it is a Task 10
        // blocker, not a security gap.
        using var factory = new Factory(new CapturingMessagesRepository(null));
        using var client = factory.CreateClient();

        var ticket = Mint(TimeSpan.FromSeconds(60), hubScoped: true);
        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/hubs/messages/negotiate?negotiateVersion=1&access_token={Uri.EscapeDataString(ticket)}")
        {
            Content = new StringContent("", Encoding.UTF8, "text/plain"),
        };

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);

        // Control: the identical request with no Content-Type at all negotiates successfully, proving
        // the 415 is caused solely by the browser client's text/plain header.
        var control = new HttpRequestMessage(
            HttpMethod.Post,
            $"/hubs/messages/negotiate?negotiateVersion=1&access_token={Uri.EscapeDataString(ticket)}");
        var controlResponse = await client.SendAsync(control);
        Assert.Equal(HttpStatusCode.OK, controlResponse.StatusCode);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private static string Mint(TimeSpan lifetime, bool hubScoped, string? secret = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret ?? Secret));
        var now = DateTime.UtcNow;
        List<Claim> claims =
        [
            new(JwtRegisteredClaimNames.Sub, "caller-1"),
            new("role", "student"),
        ];
        if (hubScoped) claims.Add(new Claim(RealtimeTicketFactory.ScopeClaimType, RealtimeTicketFactory.HubScopeClaimValue));

        // Mirror RealtimeTicketFactory's shape (nbf = issue time, exp = issue time + TTL). `lifetime` is
        // measured from NOW to exp, so a negative value models a ticket that has already expired; nbf is
        // clamped to at most now so a long-lived token isn't accidentally minted not-yet-valid.
        var expires = now.Add(lifetime);
        var notBefore = expires - TimeSpan.FromSeconds(60);
        if (notBefore > now) notBefore = now;

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            notBefore: notBefore,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static HubConnection BuildConnection(Factory factory, Uri url) =>
        new HubConnectionBuilder()
            .WithUrl(url, options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

    private static async Task AssertHubConnectionRejectedAsync(Factory factory, HttpClient client, string token)
    {
        var url = new Uri(client.BaseAddress!, $"hubs/messages?access_token={Uri.EscapeDataString(token)}");
        await using var connection = BuildConnection(factory, url);

        var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.Closed += _ => { closed.TrySetResult(); return Task.CompletedTask; };

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
            // Context.Abort() during OnConnectedAsync does not fail the initial LongPolling handshake --
            // observe the teardown instead (same pattern as RealtimeTicketEndpointTests).
            var completed = await Task.WhenAny(closed.Task, Task.Delay(TimeSpan.FromSeconds(5)));
            Assert.Same(closed.Task, completed);
        }

        Assert.NotEqual(HubConnectionState.Connected, connection.State);
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string path, string json, bool authenticated = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
        if (authenticated) AddDevIdentity(request);
        return client.SendAsync(request);
    }

    private static void AddDevIdentity(HttpRequestMessage request)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "student-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "student");
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
    }

    private sealed class Factory(IMessagesRepository repository) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IMessagesRepository>();
                services.AddSingleton(repository);
            });
        }
    }

    /// <summary>
    /// Records exactly what MessagesEndpoints handed the repository, so a body field can be proven to
    /// reach (or not reach) the authorization inputs. Any method not explicitly stubbed throws, so an
    /// unauthenticated request that should never reach the repository fails loudly rather than silently.
    /// </summary>
    private sealed class CapturingMessagesRepository(CreateConversationResult? createResult) : IMessagesRepository
    {
        public string? LastUserId { get; private set; }
        public string? LastRole { get; private set; }
        public string? LastSchoolId { get; private set; }
        public string? LastTargetId { get; private set; }

        public Task<CreateConversationResult> CreateConversationAsync(
            RequestContext context, string userId, string role, string? schoolId, string targetId,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastRole, LastSchoolId, LastTargetId) = (userId, role, schoolId, targetId);
            return Task.FromResult(createResult ?? throw Unexpected());
        }

        // Stubbed (not throwing) so the Angle5 header control can assert a 200 -- it proves the request
        // reached the handler, which is the whole point of that control.
        public Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            LastUserId = userId;
            return Task.FromResult(0);
        }

        public Task<IReadOnlyList<ContactRow>> GetContactsAsync(
            RequestContext context, string userId, string role, string? schoolId, string? search,
            CancellationToken cancellationToken = default)
        {
            (LastUserId, LastRole, LastSchoolId) = (userId, role, schoolId);
            return Task.FromResult<IReadOnlyList<ContactRow>>([]);
        }

        private static Exception Unexpected() =>
            new InvalidOperationException("IMessagesRepository should not have been reached for this request.");

        public Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
            RequestContext context, string userId, CancellationToken cancellationToken = default) => throw Unexpected();

        public Task<ConversationMessagesResult> GetConversationMessagesAsync(
            RequestContext context, string userId, string conversationId, int page, int limit,
            CancellationToken cancellationToken = default) => throw Unexpected();

        public Task<SendMessageResult> SendMessageAsync(
            RequestContext context, string userId, string conversationId, string content,
            CancellationToken cancellationToken = default) => throw Unexpected();

        public Task<int> BroadcastAsync(
            RequestContext context, string userId, string role, string schoolId, string recipientGroup, string content,
            CancellationToken cancellationToken = default) => throw Unexpected();
    }
}
