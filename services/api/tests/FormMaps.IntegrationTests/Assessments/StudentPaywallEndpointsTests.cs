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
/// INDEPENDENT_STUDENT_PAYWALL results gate + completion redaction (TIMSInternational/formmaps#240), through the
/// real pipeline with the access reader, subscription guard, ownership guard and LIA reader/writer faked:
///  - flag OFF  -> a complete no-op: the access reader is never consulted and the results path is unchanged;
///  - flag ON   -> a student without paid results gets 402 PAID_RESULTS_REQUIRED on results and a redacted
///                 completion body; paid results (charged subscription, one-time) pass; non-students are untouched;
///                 a DB failure fails closed with 503.
/// </summary>
public class StudentPaywallEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string ResultsPath = $"/api/v1/lia/session/{SessionId}/results";
    private const string UserResultsPath = $"/api/v1/lia/user/{CallerUserId}/results";
    private const string CompletePath = $"/api/v1/lia/session/{SessionId}/complete";

    private static readonly StudentAccess Unpaid = StudentAccessRules.NoAccess;
    private static readonly StudentAccess Trialing = new(true, false, StudentAccessRules.FullPlatformScope, "subscription");
    private static readonly StudentAccess Charged = new(true, true, StudentAccessRules.FullPlatformScope, "subscription");
    private static readonly StudentAccess OneTime = new(false, true, StudentAccessRules.AssessmentsAndReportsScope, "one_time");

    // ---- flag OFF ----

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    [InlineData("yes")]
    public async Task Flag_off_leaves_results_unchanged_and_never_reads_access(string? flag)
    {
        var access = new FakeStudentAccessReader(Unpaid);
        using var factory = new PaywallApiFactory(flag, access);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(1, factory.Reader.SessionCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(SessionId, document.RootElement.GetProperty("data").GetProperty("session_id").GetString());
    }

    [Fact]
    public async Task Flag_off_leaves_the_scored_completion_body_unchanged()
    {
        var access = new FakeStudentAccessReader(Unpaid);
        using var factory = new PaywallApiFactory(null, access);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Post, CompletePath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, access.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(74.5, document.RootElement.GetProperty("data").GetProperty("global_percentile").GetDouble());
    }

    // ---- flag ON: results gate ----

    [Theory]
    [InlineData(ResultsPath)]
    [InlineData(UserResultsPath)]
    public async Task Unpaid_student_gets_402_paid_results_required_and_no_read(string path)
    {
        var access = new FakeStudentAccessReader(Unpaid);
        using var factory = new PaywallApiFactory("true", access);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, path, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Equal(1, access.CallCount);
        // Runs BEFORE the handler: neither the subscription guard nor the reader is reached.
        Assert.Equal(0, factory.Subscription.CallCount);
        Assert.Equal(0, factory.Reader.SessionCallCount + factory.Reader.UserCallCount);
        await AssertPaidResultsRequired(response);
    }

    [Fact]
    public async Task Trialing_student_gets_402()
    {
        using var factory = new PaywallApiFactory("ON", new FakeStudentAccessReader(Trialing));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        await AssertPaidResultsRequired(response);
    }

    [Fact]
    public async Task Charged_subscription_passes_to_the_results()
    {
        using var factory = new PaywallApiFactory("1", new FakeStudentAccessReader(Charged));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, factory.Reader.SessionCallCount);
    }

    [Fact]
    public async Task One_time_purchase_passes_to_the_results()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(OneTime));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, factory.Reader.SessionCallCount);
    }

    [Fact]
    public async Task Non_student_token_is_never_checked()
    {
        var access = new FakeStudentAccessReader(Unpaid);
        using var factory = new PaywallApiFactory("true", access);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.SchoolAdmin, "school-1"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(0, access.CallCount);
    }

    [Fact]
    public async Task Anonymous_passes_through_to_the_endpoints_own_401()
    {
        var access = new FakeStudentAccessReader(Unpaid);
        using var factory = new PaywallApiFactory("true", access);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(ResultsPath);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, access.CallCount);
    }

    [Fact]
    public async Task Unknown_user_passes_through_to_the_endpoint()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(null));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Db_error_fails_closed_with_503()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(Unpaid) { Throw = true });
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Get, ResultsPath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(0, factory.Reader.SessionCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Service temporarily unavailable", document.RootElement.GetProperty("message").GetString());
    }

    // ---- flag ON: completion redaction ----

    [Fact]
    public async Task Unpaid_student_completion_body_is_redacted_but_the_session_still_completes()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(Trialing));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Post, CompletePath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, factory.Writer.CompleteCalls);
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("global_percentile", json, StringComparison.Ordinal);
        using var document = JsonDocument.Parse(json);
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
        var data = document.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("completed").GetBoolean());
        Assert.True(data.GetProperty("resultsLocked").GetBoolean());
        // Legacy reads data.sessionId ?? data.id; LIA's completion body is snake_case, so it is null there too.
        Assert.Equal(JsonValueKind.Null, data.GetProperty("sessionId").ValueKind);
        Assert.Equal(3, data.EnumerateObject().Count());
    }

    [Fact]
    public async Task Paid_student_completion_body_is_unchanged()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(OneTime));
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Post, CompletePath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(74.5, document.RootElement.GetProperty("data").GetProperty("global_percentile").GetDouble());
    }

    [Fact]
    public async Task Unpaid_completion_error_body_is_not_redacted()
    {
        using var factory = new PaywallApiFactory("true", new FakeStudentAccessReader(Unpaid), LiaCompleteStatus.NotFound);
        using var client = factory.CreateClient();

        var response = await client.SendAsync(Build(HttpMethod.Post, CompletePath, FormMapsRoles.Student));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    // ---- helpers ----

    private static async Task AssertPaidResultsRequired(HttpResponseMessage response)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.False(root.GetProperty("success").GetBoolean());
        Assert.Equal("Your full results unlock after your first payment", root.GetProperty("message").GetString());
        Assert.Equal("PAID_RESULTS_REQUIRED", root.GetProperty("code").GetString());
        Assert.Equal(3, root.EnumerateObject().Count());
    }

    private static HttpRequestMessage Build(HttpMethod method, string path, string role, string? schoolId = null)
    {
        var request = new HttpRequestMessage(method, path);
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

    private static LiaCompletionResult SampleCompletion() => new(
        SessionId: SessionId,
        RawScores: new Dictionary<string, double> { ["pattern_recognition"] = 38 },
        FinalScores: new Dictionary<string, double> { ["pattern_recognition"] = 38 },
        Percentiles: new Dictionary<string, int> { ["pattern_recognition"] = 63 },
        GlobalPercentile: 74.5,
        PerformanceLevel: "high",
        ResponseCounts: new Dictionary<string, ResponseCount> { ["pattern_recognition"] = new(40, 10, 10) },
        CompletedAt: "2026-07-17T10:01:00.000Z");

    private sealed class PaywallApiFactory(
        string? flag,
        FakeStudentAccessReader access,
        LiaCompleteStatus completeStatus = LiaCompleteStatus.Completed) : WebApplicationFactory<Program>
    {
        public FakeSubscriptionGuard Subscription { get; } = new();

        public FakeLiaResultReader Reader { get; } = new();

        public FakeLiaSessionWriter Writer { get; } = new(completeStatus);

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.UseSetting(StudentAccessRules.FlagKey, flag ?? string.Empty);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IStudentAccessReader>();
                services.AddSingleton<IStudentAccessReader>(access);
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(Subscription);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(new AllowUserAccessGuard());
                services.RemoveAll<ILiaResultReader>();
                services.AddSingleton<ILiaResultReader>(Reader);
                services.RemoveAll<ILiaSessionWriter>();
                services.AddSingleton<ILiaSessionWriter>(Writer);
            });
        }
    }

    private sealed class FakeStudentAccessReader(StudentAccess? access) : IStudentAccessReader
    {
        public bool Throw { get; init; }

        public int CallCount { get; private set; }

        public Task<StudentAccess?> ReadAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            CallCount++;
            if (Throw)
            {
                throw new InvalidOperationException("simulated DB failure");
            }

            return Task.FromResult(access);
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        public int CallCount { get; private set; }

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(GuardDecision.Allow());
        }
    }

    private sealed class AllowUserAccessGuard : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult(true);
    }

    private sealed class FakeLiaResultReader : ILiaResultReader
    {
        public int SessionCallCount { get; private set; }

        public int UserCallCount { get; private set; }

        public Task<LiaResults?> ReadBySessionAsync(RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            SessionCallCount++;
            return Task.FromResult<LiaResults?>(Sample(sessionId));
        }

        public Task<LiaResults?> ReadNewestForUserAsync(RequestContext context, string targetUserId, CancellationToken cancellationToken = default)
        {
            UserCallCount++;
            return Task.FromResult<LiaResults?>(Sample(SessionId));
        }

        private static LiaResults Sample(string sessionId)
        {
            using var empty = JsonDocument.Parse("{}");
            using var emptyArray = JsonDocument.Parse("[]");
            return LiaResultsAssembler.Build(
                sessionId: sessionId,
                userName: "Ada Lovelace",
                userEmail: "ada@example.test",
                rawScores: empty.RootElement.Clone(),
                finalScores: empty.RootElement.Clone(),
                percentiles: empty.RootElement.Clone(),
                globalPercentile: 74.5,
                performanceLevel: "high",
                responseCounts: empty.RootElement.Clone(),
                subtestTimes: empty.RootElement.Clone(),
                lockdownViolations: emptyArray.RootElement.Clone(),
                startedAt: new DateTime(2026, 7, 16, 12, 0, 0, DateTimeKind.Utc),
                completedAt: new DateTime(2026, 7, 16, 12, 20, 0, DateTimeKind.Utc))!;
        }
    }

    private sealed class FakeLiaSessionWriter(LiaCompleteStatus status) : ILiaSessionWriter
    {
        public int CompleteCalls { get; private set; }

        public Task<LiaStartOutcome> StartAsync(
            RequestContext context, string userId, string language, LiaDeviceInfo? deviceInfo = null,
            CancellationToken cancellationToken = default) => throw new NotImplementedException();

        public Task<LiaSubtestStartOutcome> StartSubtestAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task<LiaSubmitAnswerOutcome> SubmitAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string? answer,
            int timeSpentMs, CancellationToken cancellationToken = default) => throw new NotImplementedException();

        public Task<LiaPracticeAnswerOutcome> SubmitPracticeAnswerAsync(
            RequestContext context, string sessionId, string ownerUserId, string questionId, string answer,
            CancellationToken cancellationToken = default) => throw new NotImplementedException();

        public Task<LiaSubmitAnswerOutcome> HandleTimeoutAsync(
            RequestContext context, string sessionId, string ownerUserId, string subtest,
            CancellationToken cancellationToken = default) => throw new NotImplementedException();

        public Task<LiaSaveViolationsOutcome> SaveViolationsAsync(
            RequestContext context, string sessionId, string ownerUserId, IReadOnlyList<ViolationEntry> violations,
            CancellationToken cancellationToken = default) => throw new NotImplementedException();

        public Task<SessionDetail?> ReadWithLazyExpiryAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default) =>
            throw new NotImplementedException();

        public Task<LiaCompleteOutcome> CompleteAsync(
            RequestContext context, string sessionId, string ownerUserId, CancellationToken cancellationToken = default)
        {
            CompleteCalls++;
            var payload = status == LiaCompleteStatus.Completed ? SampleCompletion() : null;
            return Task.FromResult(new LiaCompleteOutcome(status, payload));
        }
    }
}
