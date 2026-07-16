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
/// Guard chain + response-shape parity for GET /api/v1/mil/results/{userId}. Access is canAccessUser
/// on the path :userId; the synthesis never 404s on missing data (only access denial 404s). The DB
/// reader is faked; real parity is proven by the staging canary.
/// </summary>
public class MilResultsEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string TargetUserId = "student-7";

    [Fact]
    public async Task Denies_anonymous_before_any_guard_or_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeMilResultReader();
        using var factory = new MilApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/mil/results/{TargetUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Returns_subscription_required_and_skips_access_and_read()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
            403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature"));
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeMilResultReader();
        using var factory = new MilApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/mil/results/{TargetUserId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, subscription.CallCount);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Returns_not_found_when_access_denied_and_skips_read()
    {
        var access = new FakeUserAccessGuard(allow: false);
        var reader = new FakeMilResultReader();
        using var factory = new MilApiFactory(new FakeSubscriptionGuard(allow: true), access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/mil/results/{TargetUserId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(TargetUserId, access.LastTargetUserId);
        Assert.Equal(0, reader.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Returns_synthesized_camelcase_shape_for_target()
    {
        var reader = new FakeMilResultReader();
        using var factory = new MilApiFactory(new FakeSubscriptionGuard(allow: true), new FakeUserAccessGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/v1/mil/results/{TargetUserId}", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, reader.LastUserId);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");

        Assert.Equal(TargetUserId, data.GetProperty("userId").GetString());
        Assert.Equal(JsonValueKind.Number, data.GetProperty("overallScore").ValueKind);
        Assert.Equal(5, data.GetProperty("examResults").GetArrayLength());
        Assert.Equal("PatternRecognition", data.GetProperty("examResults")[0].GetProperty("examType").GetString());
        Assert.Equal("feature-detection-001", data.GetProperty("examResults")[0].GetProperty("examId").GetString());
        // camelCase composite + per-domain in DOMAIN_WEIGHTS order.
        var composite = data.GetProperty("weightedComposite");
        Assert.Equal(5, composite.GetProperty("perDomain").GetArrayLength());
        Assert.Equal("VisualRotation", composite.GetProperty("perDomain")[1].GetProperty("type").GetString());
        Assert.True(composite.TryGetProperty("labelEn", out _));
        // camelCase cognitive profile with numericVelocity (not numerical_speed).
        var profile = data.GetProperty("cognitiveProfile");
        Assert.True(profile.TryGetProperty("numericVelocity", out _));
        Assert.False(profile.TryGetProperty("numerical_speed", out _));
        // snake_case must not leak.
        Assert.False(data.TryGetProperty("overall_score", out _));
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

    private sealed class MilApiFactory(
        FakeSubscriptionGuard subscription,
        FakeUserAccessGuard access,
        FakeMilResultReader reader) : WebApplicationFactory<Program>
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
                services.RemoveAll<IMilResultReader>();
                services.AddSingleton<IMilResultReader>(reader);
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

    private sealed class FakeMilResultReader : IMilResultReader
    {
        public int CallCount { get; private set; }

        public string? LastUserId { get; private set; }

        public Task<MilResults> ReadResultsAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastUserId = userId;
            using var percentiles = JsonDocument.Parse(
                """{"pattern_recognition":63,"verbal_reasoning":10,"numerical_speed":40,"working_memory":30,"visual_rotation":55}""");
            using var counts = JsonDocument.Parse("{}");
            var result = MilResultsSynthesizer.FromLiaSession(
                userId,
                percentiles.RootElement.Clone(),
                counts.RootElement.Clone(),
                globalPercentile: 39.35,
                completedAt: new DateTime(2026, 7, 16, 12, 20, 0, DateTimeKind.Utc));
            return Task.FromResult(result);
        }
    }
}
