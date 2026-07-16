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
/// Guard chain + response-shape parity for the two LIA results endpoints:
///  - GET /api/v1/lia/session/{sessionId}/results — STRICT self-ownership (no canAccessUser).
///  - GET /api/v1/lia/user/{userId}/results        — canAccessUser on the path :userId.
/// The DB reader is faked (real parity is proven by the staging canary on real data).
/// </summary>
public class LiaResultsEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string TargetUserId = "student-7";

    // ---- session endpoint ----

    [Fact]
    public async Task Session_denies_anonymous_before_any_guard_or_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(subscription, new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/lia/session/{SessionId}/results");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, reader.SessionCallCount);
    }

    [Fact]
    public async Task Session_returns_subscription_required_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
            403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature"));
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(subscription, new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, subscription.CallCount);
        Assert.Equal(0, reader.SessionCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("SUBSCRIPTION_REQUIRED", document.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Session_returns_not_found_when_reader_null()
    {
        var reader = new FakeLiaResultReader { SessionMissing = true };
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Session_scopes_ownership_to_the_caller_not_the_path()
    {
        // Strict self-only: the reader is asked for THIS caller's ownership, never a privileged
        // cross-user access. A school_admin cannot reach a foreign session via this route.
        var reader = new FakeLiaResultReader();
        var access = new FakeUserAccessGuard(allow: true);
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/session/{SessionId}/results", FormMapsRoles.SchoolAdmin, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, reader.LastOwnerUserId);
        // Ownership is enforced inside the reader, NOT via canAccessUser.
        Assert.Equal(0, access.CallCount);
    }

    [Fact]
    public async Task Session_returns_snake_case_results_shape()
    {
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertResultsShape(document.RootElement.GetProperty("data"));
    }

    // ---- user endpoint ----

    [Fact]
    public async Task User_denies_anonymous_before_any_guard_or_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/lia/user/{TargetUserId}/results");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(0, reader.UserCallCount);
    }

    [Fact]
    public async Task User_returns_not_found_when_access_denied_and_skips_read()
    {
        var access = new FakeUserAccessGuard(allow: false);
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/user/{TargetUserId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(TargetUserId, access.LastTargetUserId);
        Assert.Equal(0, reader.UserCallCount);
    }

    [Fact]
    public async Task User_returns_not_found_when_no_completed_session()
    {
        var reader = new FakeLiaResultReader { UserMissing = true };
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/user/{TargetUserId}/results", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, reader.UserCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task User_returns_snake_case_results_shape_for_target()
    {
        var reader = new FakeLiaResultReader();
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/lia/user/{TargetUserId}/results", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, reader.LastTargetUserId);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertResultsShape(document.RootElement.GetProperty("data"));
    }

    private static void AssertResultsShape(JsonElement data)
    {
        Assert.Equal(SessionId, data.GetProperty("session_id").GetString());
        Assert.Equal("Ada Lovelace", data.GetProperty("user_name").GetString());
        // global_percentile is a JSON number (NOT a Decimal string).
        Assert.Equal(JsonValueKind.Number, data.GetProperty("global_percentile").ValueKind);
        Assert.Equal(74.5, data.GetProperty("global_percentile").GetDouble());
        Assert.Equal("high", data.GetProperty("performance_level").GetString());
        Assert.Equal("Exceeds", data.GetProperty("performance_level_display").GetProperty("en").GetString());
        Assert.Equal("Excede", data.GetProperty("performance_level_display").GetProperty("es").GetString());

        // Percentiles keep the RAW snake_case storage keys — NO reports/lia PascalCase remap.
        var percentiles = data.GetProperty("percentiles");
        Assert.True(percentiles.TryGetProperty("numerical_speed", out _));
        Assert.False(percentiles.TryGetProperty("NumericVelocity", out _));

        // subtest_performance_levels computed, snake_case keys.
        var levels = data.GetProperty("subtest_performance_levels");
        Assert.Equal("high", levels.GetProperty("pattern_recognition").GetString());
        Assert.True(levels.TryGetProperty("numerical_speed", out _));

        Assert.Equal(0, data.GetProperty("violation_count").GetInt32());
        // camelCase policy must NOT have rewritten the snake_case keys.
        Assert.False(data.TryGetProperty("sessionId", out _));
    }

    private static HttpRequestMessage BuildRequest(string path, string role, string? schoolId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return request;
    }

    private sealed class LiaApiFactory(
        FakeSubscriptionGuard subscription,
        FakeUserAccessGuard access,
        FakeLiaResultReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(access);
                services.RemoveAll<ILiaResultReader>();
                services.AddSingleton<ILiaResultReader>(reader);
            });
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        private readonly GuardDecision _decision;

        public FakeSubscriptionGuard(bool allow)
            : this(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied")) { }

        public FakeSubscriptionGuard(GuardDecision decision) => _decision = decision;

        public int CallCount { get; private set; }

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(_decision);
        }
    }

    private sealed class FakeUserAccessGuard(bool allow) : IUserAccessGuard
    {
        public int CallCount { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeLiaResultReader : ILiaResultReader
    {
        public bool SessionMissing { get; init; }

        public bool UserMissing { get; init; }

        public int SessionCallCount { get; private set; }

        public int UserCallCount { get; private set; }

        public string? LastOwnerUserId { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<LiaResults?> ReadBySessionAsync(RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            SessionCallCount++;
            LastOwnerUserId = ownerUserId;
            return Task.FromResult(SessionMissing ? null : Sample(sessionId));
        }

        public Task<LiaResults?> ReadNewestForUserAsync(RequestContext context, string targetUserId, CancellationToken cancellationToken = default)
        {
            UserCallCount++;
            LastTargetUserId = targetUserId;
            return Task.FromResult(UserMissing ? null : Sample(SessionId));
        }

        private static LiaResults? Sample(string sessionId)
        {
            using var empty = JsonDocument.Parse("{}");
            using var emptyArray = JsonDocument.Parse("[]");
            using var percentiles = JsonDocument.Parse(
                """{"pattern_recognition":63,"verbal_reasoning":10,"numerical_speed":40,"working_memory":30,"visual_rotation":55}""");

            return LiaResultsAssembler.Build(
                sessionId: sessionId,
                userName: "Ada Lovelace",
                userEmail: "ada@example.test",
                rawScores: empty.RootElement.Clone(),
                finalScores: empty.RootElement.Clone(),
                percentiles: percentiles.RootElement.Clone(),
                globalPercentile: 74.5,
                performanceLevel: "high",
                responseCounts: empty.RootElement.Clone(),
                subtestTimes: empty.RootElement.Clone(),
                lockdownViolations: emptyArray.RootElement.Clone(),
                startedAt: new DateTime(2026, 7, 16, 12, 0, 0, DateTimeKind.Utc),
                completedAt: new DateTime(2026, 7, 16, 12, 20, 0, DateTimeKind.Utc));
        }
    }
}
