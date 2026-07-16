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
/// Guard chain + response-shape parity for the two personality results endpoints:
///  - GET /api/v1/personality/session/{sessionId}/results — STRICT self-ownership (no canAccessUser).
///  - GET /api/v1/personality/user/{userId}/results        — canAccessUser on the path :userId.
/// The DB reader is faked (real parity is proven by the staging canary).
/// </summary>
public class PersonalityResultsEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string TargetUserId = "student-7";

    [Fact]
    public async Task Session_denies_anonymous_before_any_guard_or_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(subscription, new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/personality/session/{SessionId}/results");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, reader.SessionCallCount);
    }

    [Fact]
    public async Task Session_returns_subscription_required_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied"));
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(subscription, new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.SessionCallCount);
    }

    [Fact]
    public async Task Session_returns_not_found_when_reader_null()
    {
        var reader = new FakePersonalityResultReader { SessionMissing = true };
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Session_scopes_ownership_to_the_caller_not_the_path()
    {
        var reader = new FakePersonalityResultReader();
        var access = new FakeUserAccessGuard(allow: true);
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/session/{SessionId}/results", FormMapsRoles.SchoolAdmin, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, reader.LastOwnerUserId);
        Assert.Equal(0, access.CallCount); // ownership enforced in the reader, not canAccessUser
    }

    [Fact]
    public async Task Session_returns_results_shape()
    {
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/session/{SessionId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertShape(document.RootElement.GetProperty("data"));
    }

    [Fact]
    public async Task User_denies_anonymous()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/personality/user/{TargetUserId}/results");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(0, reader.UserCallCount);
    }

    [Fact]
    public async Task User_returns_not_found_when_access_denied_and_skips_read()
    {
        var access = new FakeUserAccessGuard(allow: false);
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/user/{TargetUserId}/results", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(TargetUserId, access.LastTargetUserId);
        Assert.Equal(0, reader.UserCallCount);
    }

    [Fact]
    public async Task User_returns_not_found_when_no_completed_session()
    {
        var reader = new FakePersonalityResultReader { UserMissing = true };
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/user/{TargetUserId}/results", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, reader.UserCallCount);
    }

    [Fact]
    public async Task User_returns_results_shape_for_target()
    {
        var reader = new FakePersonalityResultReader();
        using var factory = new PersonalityApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/personality/user/{TargetUserId}/results", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, reader.LastTargetUserId);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        AssertShape(document.RootElement.GetProperty("data"));
    }

    private static void AssertShape(JsonElement data)
    {
        // snake_case top level.
        Assert.Equal(SessionId, data.GetProperty("session_id").GetString());
        Assert.Equal("Ada Lovelace", data.GetProperty("user_name").GetString());
        Assert.Equal("ISTP", data.GetProperty("type").GetString());
        Assert.Equal("estudiantil", data.GetProperty("variant").GetString());
        Assert.False(data.TryGetProperty("sessionId", out _)); // camelCase must not leak

        // score.dimensions passthrough + dimension_scores array.
        Assert.Equal(JsonValueKind.Object, data.GetProperty("score").GetProperty("dimensions").ValueKind);
        Assert.Equal(4, data.GetProperty("dimension_scores").GetArrayLength());

        // profile localized + camelCase nested keys.
        var profile = data.GetProperty("profile");
        Assert.Equal("El Técnico Resolutivo", profile.GetProperty("alias").GetString());
        Assert.True(profile.TryGetProperty("improvementAreas", out _));
        Assert.True(profile.GetProperty("potential").TryGetProperty("social", out _));
        Assert.True(profile.GetProperty("coachingStrategy").TryGetProperty("practices", out _));
        Assert.False(profile.TryGetProperty("improvement_areas", out _)); // snake must not leak into profile
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

    private sealed class PersonalityApiFactory(
        FakeSubscriptionGuard subscription,
        FakeUserAccessGuard access,
        FakePersonalityResultReader reader) : WebApplicationFactory<Program>
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
                services.RemoveAll<IPersonalityResultReader>();
                services.AddSingleton<IPersonalityResultReader>(reader);
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

    private sealed class FakePersonalityResultReader : IPersonalityResultReader
    {
        public bool SessionMissing { get; init; }

        public bool UserMissing { get; init; }

        public int SessionCallCount { get; private set; }

        public int UserCallCount { get; private set; }

        public string? LastOwnerUserId { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<PersonalityResults?> ReadBySessionAsync(RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            SessionCallCount++;
            LastOwnerUserId = ownerUserId;
            return Task.FromResult(SessionMissing ? null : Sample(sessionId));
        }

        public Task<PersonalityResults?> ReadNewestForUserAsync(RequestContext context, string targetUserId, CancellationToken cancellationToken = default)
        {
            UserCallCount++;
            LastTargetUserId = targetUserId;
            return Task.FromResult(UserMissing ? null : Sample(SessionId));
        }

        private static string Dim(string d, string pole) =>
            $$"""{"dimension":"{{d}}","firstCount":6,"secondCount":4,"winningPole":"{{pole}}","intensity":6,"answered":10,"maxPerDimension":20,"normalizedIntensity":30,"balanced":false}""";

        private static PersonalityResults? Sample(string sessionId)
        {
            using var dims = JsonDocument.Parse(
                $"{{\"EI\":{Dim("EI", "I")},\"SN\":{Dim("SN", "S")},\"TF\":{Dim("TF", "T")},\"JP\":{Dim("JP", "P")}}}");
            using var violations = JsonDocument.Parse("[]");
            return PersonalityResultsAssembler.Build(
                sessionId: sessionId,
                userName: "Ada Lovelace",
                userEmail: "ada@example.test",
                variantRaw: "estudiantil",
                sessionLanguage: "es",
                resolvedType: "ISTP",
                dimensionScores: dims.RootElement.Clone(),
                violations: violations.RootElement.Clone(),
                flagForReview: false,
                startedAt: new DateTime(2026, 7, 16, 12, 0, 0, DateTimeKind.Utc),
                completedAt: new DateTime(2026, 7, 16, 12, 20, 0, DateTimeKind.Utc));
        }
    }
}
