using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Guard chain + shape parity for the personality take-flow reads:
///  - GET /api/v1/personality/access          — self-scoped access decision (snake_case, optional keys).
///  - GET /api/v1/personality/session/{id}     — self-owned session projection (7 keys, ISO-Z timestamps).
/// The DB reader is faked; real parity is proven by the staging canary.
/// </summary>
public class PersonalityTakeFlowEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";

    [Fact]
    public async Task Access_denies_anonymous_before_read()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        var r = await c.GetAsync("/api/v1/personality/access");
        Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode);
        Assert.Equal(0, reader.AccessCallCount);
    }

    [Fact]
    public async Task Access_open_when_no_sessions_omits_optional_keys()
    {
        var reader = new FakeReader { AccessSessions = [] };
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build("/api/v1/personality/access", FormMapsRoles.Student);
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(CallerUserId, reader.LastAccessUserId);
        var data = (await Json(r)).GetProperty("data");
        Assert.True(data.GetProperty("has_access").GetBoolean());
        Assert.False(data.GetProperty("has_completed").GetBoolean());
        Assert.False(data.TryGetProperty("existing_session_id", out _)); // omitted
        Assert.False(data.TryGetProperty("reason", out _));               // omitted
    }

    [Fact]
    public async Task Access_completed_blocks_with_reason()
    {
        var reader = new FakeReader { AccessSessions = [new PersonalitySessionStatus("c1", "completed")] };
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build("/api/v1/personality/access", FormMapsRoles.Student);
        var r = await c.SendAsync(req);

        var data = (await Json(r)).GetProperty("data");
        Assert.False(data.GetProperty("has_access").GetBoolean());
        Assert.True(data.GetProperty("has_completed").GetBoolean());
        Assert.Equal("c1", data.GetProperty("existing_session_id").GetString());
        Assert.Equal("already_completed", data.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Session_owned_returns_projection_with_z_timestamps()
    {
        var reader = new FakeReader();
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build($"/api/v1/personality/session/{SessionId}", FormMapsRoles.Student);
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        Assert.Equal(SessionId, reader.LastSessionId);
        Assert.Equal(CallerUserId, reader.LastSessionUserId); // self-scoped
        var data = (await Json(r)).GetProperty("data");
        Assert.Equal(SessionId, data.GetProperty("id").GetString());
        Assert.Equal("in_progress", data.GetProperty("status").GetString());
        Assert.Equal("laboral", data.GetProperty("variant").GetString());
        Assert.Equal("es", data.GetProperty("language").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("resolved_type").ValueKind); // present, null
        Assert.Equal("2026-06-01T00:00:00.000Z", data.GetProperty("started_at").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("completed_at").ValueKind);
    }

    [Fact]
    public async Task Session_foreign_or_missing_is_uniform_404()
    {
        var reader = new FakeReader { SessionMissing = true };
        using var f = new Factory(new FakeSub(true), reader);
        using var c = f.CreateClient();
        using var req = Build($"/api/v1/personality/session/{SessionId}", FormMapsRoles.Student);
        var r = await c.SendAsync(req);

        Assert.Equal(HttpStatusCode.NotFound, r.StatusCode);
        Assert.Equal("Not found", (await Json(r)).GetProperty("message").GetString());
    }

    private static async Task<JsonElement> Json(HttpResponseMessage r) =>
        JsonDocument.Parse(await r.Content.ReadAsStringAsync()).RootElement;

    private static HttpRequestMessage Build(string path, string role)
    {
        var req = new HttpRequestMessage(HttpMethod.Get, path);
        req.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        req.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        req.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        req.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        req.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return req;
    }

    private sealed class Factory(FakeSub sub, FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(sub);
                services.RemoveAll<IPersonalitySessionReader>();
                services.AddSingleton<IPersonalitySessionReader>(reader);
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext c, CancellationToken t = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "x"));
    }

    private sealed class FakeReader : IPersonalitySessionReader
    {
        public IReadOnlyList<PersonalitySessionStatus> AccessSessions { get; init; } = [];

        public bool SessionMissing { get; init; }

        public int AccessCallCount { get; private set; }

        public string? LastAccessUserId { get; private set; }

        public string? LastSessionId { get; private set; }

        public string? LastSessionUserId { get; private set; }

        public Task<IReadOnlyList<PersonalitySessionStatus>> ReadAccessSessionsAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            AccessCallCount++;
            LastAccessUserId = userId;
            return Task.FromResult(AccessSessions);
        }

        public Task<PersonalitySessionView?> GetOwnedSessionAsync(RequestContext context, string sessionId, string userId, CancellationToken cancellationToken = default)
        {
            LastSessionId = sessionId;
            LastSessionUserId = userId;
            if (SessionMissing)
            {
                return Task.FromResult<PersonalitySessionView?>(null);
            }

            return Task.FromResult<PersonalitySessionView?>(new PersonalitySessionView(
                Id: sessionId,
                Status: "in_progress",
                Variant: "laboral",
                Language: "es",
                ResolvedType: null,
                StartedAt: "2026-06-01T00:00:00.000Z",
                CompletedAt: null));
        }
    }
}
