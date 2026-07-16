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
/// Guard chain + shape parity for the two subscription-only pca-exam catalog reads:
///  - GET /api/pcaexam/exams/{examId}/instructions
///  - GET /api/pcaexam/exam-config/{examId}
/// Both are global catalog (no canAccessUser, no admin); missing -> 404 "Exam not found". The DB
/// reader is faked (real parity via staging canary).
/// </summary>
public class ExamConfigEndpointsTests
{
    private const string ExamId = "feature-detection-001";

    [Fact]
    public async Task Instructions_denies_anonymous()
    {
        var subscription = new FakeSubscriptionGuard(allow: true);
        var reader = new FakeExamConfigReader();
        using var factory = new ConfigApiFactory(subscription, reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/pcaexam/exams/{ExamId}/instructions");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, subscription.CallCount);
        Assert.Equal(0, reader.InstructionsCallCount);
    }

    [Fact]
    public async Task Instructions_returns_subscription_required_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied"));
        var reader = new FakeExamConfigReader();
        using var factory = new ConfigApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/exams/{ExamId}/instructions");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.InstructionsCallCount);
    }

    [Fact]
    public async Task Instructions_missing_returns_exam_not_found()
    {
        var reader = new FakeExamConfigReader { Missing = true };
        using var factory = new ConfigApiFactory(new FakeSubscriptionGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/exams/{ExamId}/instructions");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Exam not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Instructions_returns_shape_with_description_and_instructions()
    {
        var reader = new FakeExamConfigReader();
        using var factory = new ConfigApiFactory(new FakeSubscriptionGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/exams/{ExamId}/instructions");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(ExamId, data.GetProperty("id").GetString());
        Assert.Equal("Feature Detection", data.GetProperty("name").GetString());
        Assert.Equal("PatternRecognition", data.GetProperty("type").GetString());
        Assert.Equal(15, data.GetProperty("timeLimitMinutes").GetInt32());
        Assert.Equal(60, data.GetProperty("totalQuestions").GetInt32());
        // instructions endpoint carries BOTH description and instructions (== description).
        Assert.Equal("Read carefully.", data.GetProperty("description").GetString());
        Assert.Equal("Read carefully.", data.GetProperty("instructions").GetString());
    }

    [Fact]
    public async Task ExamConfig_missing_returns_exam_not_found()
    {
        var reader = new FakeExamConfigReader { Missing = true };
        using var factory = new ConfigApiFactory(new FakeSubscriptionGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/exam-config/{ExamId}");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Exam not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ExamConfig_returns_shape_without_description_key()
    {
        var reader = new FakeExamConfigReader();
        using var factory = new ConfigApiFactory(new FakeSubscriptionGuard(allow: true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest($"/api/pcaexam/exam-config/{ExamId}");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(ExamId, data.GetProperty("id").GetString());
        Assert.Equal("PatternRecognition", data.GetProperty("type").GetString());
        Assert.Equal(60, data.GetProperty("totalQuestions").GetInt32());
        Assert.Equal("Read carefully.", data.GetProperty("instructions").GetString());
        // exam-config OMITS the separate description key (only instructions).
        Assert.False(data.TryGetProperty("description", out _));
    }

    private static HttpRequestMessage BuildRequest(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return request;
    }

    private sealed class ConfigApiFactory(
        FakeSubscriptionGuard subscription,
        FakeExamConfigReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<IExamConfigReader>();
                services.AddSingleton<IExamConfigReader>(reader);
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

    private sealed class FakeExamConfigReader : IExamConfigReader
    {
        public bool Missing { get; init; }

        public int InstructionsCallCount { get; private set; }

        public int ConfigCallCount { get; private set; }

        public Task<ExamInstructions?> GetInstructionsAsync(RequestContext context, string examId, CancellationToken cancellationToken = default)
        {
            InstructionsCallCount++;
            return Task.FromResult(Missing
                ? null
                : new ExamInstructions(examId, "Feature Detection", "PatternRecognition", 15, "Read carefully.", 60, "Read carefully."));
        }

        public Task<ExamConfig?> GetConfigAsync(RequestContext context, string examId, CancellationToken cancellationToken = default)
        {
            ConfigCallCount++;
            return Task.FromResult(Missing
                ? null
                : new ExamConfig(examId, "Feature Detection", "PatternRecognition", 15, 60, "Read carefully."));
        }
    }
}
