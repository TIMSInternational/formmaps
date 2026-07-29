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
/// Guard chain + HTTP status/body mapping for POST /api/v1/lia/session/{sessionId}/complete — the first
/// authored WRITE endpoint. The writer is faked (its DB behavior is proven by LiaSessionWriterTests); this
/// pins the thin endpoint layer: anon -> 401 before any work; subscription-required -> 403 skips the write;
/// Completed -> 200 {success,data}; and each rejection status maps to the exact legacy handleError body
/// (IncompleteCoverage -> 409 "Assessment not complete"; NotInProgress -> 400 "not_in_progress";
/// NotFound -> 404 "Not found"). The writer is always called with the caller's own id (self-ownership).
/// </summary>
public class LiaCompleteEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string Path = "/api/v1/lia/session/session-1/complete";

    [Fact]
    public async Task Denies_anonymous_before_subscription_or_write()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var writer = new FakeLiaSessionWriter(LiaCompleteStatus.Completed);
        using var factory = new LiaApiFactory(subscription, writer);
        using var client = factory.CreateClient();

        var response = await client.PostAsync(Path, content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, writer.CallCount);
    }

    [Fact]
    public async Task Subscription_required_skips_the_write()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
            403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature"));
        var writer = new FakeLiaSessionWriter(LiaCompleteStatus.Completed);
        using var factory = new LiaApiFactory(subscription, writer);
        using var client = factory.CreateClient();

        var response = await Send(client);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, writer.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("SUBSCRIPTION_REQUIRED", document.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Completed_returns_200_with_the_scored_snake_case_body_and_self_ownership()
    {
        var writer = new FakeLiaSessionWriter(LiaCompleteStatus.Completed, SampleResult());
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();

        // A privileged role still completes only its OWN session — the writer is handed the caller's id.
        var response = await Send(client, FormMapsRoles.SchoolAdmin, schoolId: "school-1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(CallerUserId, writer.LastOwnerUserId);
        Assert.Equal(SessionId, writer.LastSessionId);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(SessionId, data.GetProperty("session_id").GetString());
        Assert.Equal(JsonValueKind.Number, data.GetProperty("global_percentile").ValueKind);
        Assert.Equal(74.5, data.GetProperty("global_percentile").GetDouble());
        Assert.Equal("high", data.GetProperty("performance_level").GetString());
        Assert.Equal(40, data.GetProperty("response_counts").GetProperty("pattern_recognition").GetProperty("correct").GetInt32());
        // snake_case must not have been rewritten to camelCase.
        Assert.False(data.TryGetProperty("sessionId", out _));
    }

    [Fact]
    public async Task IncompleteCoverage_maps_to_409_assessment_not_complete()
    {
        var response = await SendOutcome(LiaCompleteStatus.IncompleteCoverage);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Assessment not complete", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task NotInProgress_maps_to_400_with_the_exact_legacy_body()
    {
        var response = await SendOutcome(LiaCompleteStatus.NotInProgress);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // Legacy handleError returns the raw error string for this branch (lia.ts).
        Assert.Equal("not_in_progress", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task NotFound_maps_to_the_uniform_404()
    {
        var response = await SendOutcome(LiaCompleteStatus.NotFound);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    private async Task<HttpResponseMessage> SendOutcome(LiaCompleteStatus status)
    {
        var writer = new FakeLiaSessionWriter(status);
        using var factory = new LiaApiFactory(new FakeSubscriptionGuard(allow: true), writer);
        using var client = factory.CreateClient();
        return await Send(client);
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string role = "student", string? schoolId = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return client.SendAsync(request);
    }

    private static LiaCompletionResult SampleResult() => new(
        SessionId: SessionId,
        RawScores: new Dictionary<string, double> { ["pattern_recognition"] = 38 },
        FinalScores: new Dictionary<string, double> { ["pattern_recognition"] = 38 },
        Percentiles: new Dictionary<string, int> { ["pattern_recognition"] = 63 },
        GlobalPercentile: 74.5,
        PerformanceLevel: "high",
        ResponseCounts: new Dictionary<string, ResponseCount> { ["pattern_recognition"] = new(40, 10, 10) },
        CompletedAt: "2026-07-17T10:01:00.000Z");

    private sealed class LiaApiFactory(FakeSubscriptionGuard subscription, FakeLiaSessionWriter writer)
        : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<ILiaSessionWriter>();
                services.AddSingleton<ILiaSessionWriter>(writer);
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

    private sealed class FakeLiaSessionWriter(LiaCompleteStatus status, LiaCompletionResult? result = null)
        : ILiaSessionWriter
    {
        public int CallCount { get; private set; }

        public string? LastOwnerUserId { get; private set; }

        public string? LastSessionId { get; private set; }

        public Task<LiaStartOutcome> StartAsync(
            RequestContext context, string userId, string language, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("StartAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaSubtestStartOutcome> StartSubtestAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("StartSubtestAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaSubmitAnswerOutcome> SubmitAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string? answer,
            int timeSpentMs, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("SubmitAnswerAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaPracticeAnswerOutcome> SubmitPracticeAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string answer,
            CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("SubmitPracticeAnswerAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest,
            CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("HandleTimeoutAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaSaveViolationsOutcome> SaveViolationsAsync(
            RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations,
            CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("SaveViolationsAsync is not exercised by LiaCompleteEndpointTests");

        public Task<SessionDetail?> ReadWithLazyExpiryAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException("ReadWithLazyExpiryAsync is not exercised by LiaCompleteEndpointTests");

        public Task<LiaCompleteOutcome> CompleteAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastOwnerUserId = ownerUserId;
            LastSessionId = sessionId;
            var payload = status == LiaCompleteStatus.Completed ? result ?? SampleResult() : null;
            return Task.FromResult(new LiaCompleteOutcome(status, payload));
        }
    }
}
