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

public class ExamCatalogEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task Exams_denies_anonymous()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeExamCatalogReader();
        using var factory = new CatalogApiFactory(subscription, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/pcaexam/exams");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, reader.ListCallCount);
    }

    [Fact]
    public async Task Exams_returns_subscription_required()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(
            403, "SUBSCRIPTION_REQUIRED", "Active subscription required to access this feature"));
        var reader = new FakeExamCatalogReader();
        using var factory = new CatalogApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest("/api/pcaexam/exams", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.ListCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("SUBSCRIPTION_REQUIRED", document.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Exams_returns_active_list()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeExamCatalogReader();
        using var factory = new CatalogApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest("/api/pcaexam/exams", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.ListCallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetArrayLength());
        Assert.Equal("exam-1", data[0].GetProperty("id").GetString());
        Assert.Equal("PatternRecognition", data[0].GetProperty("type").GetString());
    }

    [Fact]
    public async Task Exam_detail_returns_not_found_when_absent()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeExamCatalogReader { ExamMissing = true };
        using var factory = new CatalogApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest("/api/pcaexam/exams/ghost", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Exam not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Exam_detail_never_leaks_the_answer_key()
    {
        // Corpus invariant (SECURITY: never expose the answer key): a question fetch must NOT
        // contain correctAnswer or explanation — scoring is server-side only.
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeExamCatalogReader();
        using var factory = new CatalogApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest("/api/pcaexam/exams/exam-1", FormMapsRoles.Student, schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal("exam-1", data.GetProperty("id").GetString());

        var questions = data.GetProperty("questions");
        Assert.Equal(2, questions.GetArrayLength());
        foreach (var question in questions.EnumerateArray())
        {
            Assert.False(question.TryGetProperty("correctAnswer", out _));
            Assert.False(question.TryGetProperty("explanation", out _));
            // The safe fields ARE present, incl. the QuestionData jsonb passthrough.
            Assert.True(question.TryGetProperty("questionText", out _));
            Assert.Equal(JsonValueKind.Object, question.GetProperty("data").ValueKind);
        }

        // Questions are ordered by questionNumber ascending.
        Assert.Equal(1, questions[0].GetProperty("questionNumber").GetInt32());
        Assert.Equal(2, questions[1].GetProperty("questionNumber").GetInt32());
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

    private sealed class CatalogApiFactory(
        FakeSubscriptionGuard subscription,
        FakeExamCatalogReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<IExamCatalogReader>();
                services.AddSingleton<IExamCatalogReader>(reader);
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

    private sealed class FakeExamCatalogReader : IExamCatalogReader
    {
        public bool ExamMissing { get; init; }

        public int ListCallCount { get; private set; }

        public int DetailCallCount { get; private set; }

        public Task<IReadOnlyList<ExamSummary>> ListExamsAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            ListCallCount++;
            IReadOnlyList<ExamSummary> exams = new List<ExamSummary>
            {
                new("exam-1", "Pattern Recognition", "desc", "PatternRecognition", 20, 30, true,
                    null, new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero), null,
                    new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero)),
            };
            return Task.FromResult(exams);
        }

        public Task<ExamWithQuestions?> GetExamWithQuestionsAsync(RequestContext context, string examId, CancellationToken cancellationToken = default)
        {
            DetailCallCount++;
            if (ExamMissing)
            {
                return Task.FromResult<ExamWithQuestions?>(null);
            }

            var when = new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero);
            using var d1 = JsonDocument.Parse("""{"options":["A","B"]}""");
            using var d2 = JsonDocument.Parse("""{"options":["C","D"]}""");
            var questions = new List<ExamQuestion>
            {
                new("q1", examId, 1, "First?", "PatternRecognition", d1.RootElement.Clone(), true, null, when, null, when),
                new("q2", examId, 2, "Second?", "PatternRecognition", d2.RootElement.Clone(), true, null, when, null, when),
            };
            var exam = new ExamWithQuestions("exam-1", "Pattern Recognition", "desc", "PatternRecognition",
                20, 30, true, null, when, null, when, questions);
            return Task.FromResult<ExamWithQuestions?>(exam);
        }
    }
}
