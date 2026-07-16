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

public class ExamEndpointsTests
{
    private const string CallerUserId = "user-123";
    private const string SessionId = "session-1";
    private const string OwnerUserId = "student-7";

    [Fact]
    public async Task Session_denies_anonymous_before_any_guard_or_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/pcaexam/session/{SessionId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, access.CallCount);
        Assert.Equal(0, reader.SessionCallCount);
    }

    [Fact]
    public async Task Session_returns_subscription_required_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
            403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature"));
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/session/{SessionId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, subscription.CallCount);
        Assert.Equal(0, reader.SessionCallCount);
        Assert.Equal(0, access.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.False(root.GetProperty("success").GetBoolean());
        Assert.Equal("SUBSCRIPTION_REQUIRED", root.GetProperty("code").GetString());
        Assert.Equal("Active subscription required to access this feature", root.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Session_returns_not_found_when_absent_and_skips_access_check()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeExamSessionReader { SessionMissing = true };
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/session/{SessionId}", FormMapsRoles.SuperAdmin, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, reader.SessionCallCount);
        Assert.Equal(0, access.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Session_returns_not_found_when_access_denied()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: false);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/session/{SessionId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        // Access is gated on the session's owner (OwnerUserId), not the sessionId.
        Assert.Equal(OwnerUserId, access.LastTargetUserId);
    }

    [Fact]
    public async Task Session_returns_full_row_shape()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/session/{SessionId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");

        Assert.Equal(SessionId, data.GetProperty("id").GetString());
        Assert.Equal(OwnerUserId, data.GetProperty("userId").GetString());
        Assert.Equal("PatternRecognition", data.GetProperty("examType").GetString());
        Assert.Equal("Completed", data.GetProperty("status").GetString());
        Assert.Equal(66.7, data.GetProperty("scorePercentage").GetDouble(), 3);
        // @map'd columns must surface under the Prisma FIELD names, camelCase.
        Assert.Equal(2, data.GetProperty("violationCount").GetInt32());
        Assert.True(data.TryGetProperty("flagForReview", out _));
        // violations jsonb passthrough (array here).
        Assert.Equal(JsonValueKind.Array, data.GetProperty("violations").ValueKind);
    }

    [Fact]
    public async Task CompletedExams_returns_not_found_when_access_denied_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: false);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/completed-exams/{OwnerUserId}", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(OwnerUserId, access.LastTargetUserId);
        Assert.Equal(0, reader.CompletedCallCount);
    }

    [Fact]
    public async Task CompletedExams_returns_deduped_shape()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var access = new FakeUserAccessGuard(allow: true);
        var reader = new FakeExamSessionReader();
        using var factory = new ExamApiFactory(subscription, access, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/completed-exams/{OwnerUserId}", FormMapsRoles.Counselor, schoolId: "school-1");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.CompletedCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("sessions").GetArrayLength());
        Assert.Equal(2, data.GetProperty("uniqueCompleted").GetArrayLength());
        Assert.Equal(2, data.GetProperty("count").GetInt32());
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

    private sealed class ExamApiFactory(
        FakeSubscriptionGuard subscription,
        FakeUserAccessGuard access,
        FakeExamSessionReader reader) : WebApplicationFactory<Program>
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
                services.RemoveAll<IExamSessionReader>();
                services.AddSingleton<IExamSessionReader>(reader);
            });
        }
    }

    private sealed class FakeSubscriptionGuard : ISubscriptionGuard
    {
        private readonly GuardDecision _decision;

        public FakeSubscriptionGuard(bool allow)
            : this(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied"))
        {
        }

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

    private sealed class FakeExamSessionReader : IExamSessionReader
    {
        public bool SessionMissing { get; init; }

        public int SessionCallCount { get; private set; }

        public int CompletedCallCount { get; private set; }

        public Task<ExamSession?> GetSessionAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default)
        {
            SessionCallCount++;
            if (SessionMissing)
            {
                return Task.FromResult<ExamSession?>(null);
            }

            using var violations = JsonDocument.Parse("""[{"type":"tab_switch"}]""");
            var session = new ExamSession(
                Id: sessionId,
                ExamId: "exam-1",
                UserId: OwnerUserId,
                ExamName: "Pattern Recognition",
                ExamType: "PatternRecognition",
                StartTime: new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                EndTime: new DateTimeOffset(2026, 6, 1, 0, 20, 0, TimeSpan.Zero),
                TotalTimeSpent: 1200,
                TotalQuestions: 30,
                QuestionsAnswered: 30,
                CorrectAnswers: 20,
                IncorrectAnswers: 10,
                UnansweredQuestions: 0,
                ScorePercentage: 66.7,
                AccuracyPercentage: 66.7,
                IsTimeExpired: false,
                IsCompleted: true,
                Status: "Completed",
                Violations: violations.RootElement.Clone(),
                ViolationCount: 2,
                FlagForReview: false,
                IsActive: true,
                CreatedBy: null,
                CreatedDate: new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                UpdatedBy: null,
                UpdatedAt: new DateTimeOffset(2026, 6, 1, 0, 20, 0, TimeSpan.Zero));

            return Task.FromResult<ExamSession?>(session);
        }

        public Task<CompletedExams> GetCompletedExamsAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            CompletedCallCount++;
            var start = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero);
            var sessions = new List<CompletedExamRow>
            {
                new("s1", "examA", "A", "PatternRecognition", 90, start, null),
                new("s2", "examB", "B", "VerbalReasoning", 80, start, null),
                new("s3", "examA", "A", "PatternRecognition", 70, start, null),
            };
            return Task.FromResult(CompletedExams.FromSessions(sessions));
        }
    }
}
