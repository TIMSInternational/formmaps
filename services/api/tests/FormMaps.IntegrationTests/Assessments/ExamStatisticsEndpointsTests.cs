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
/// Guard chain + shape for GET /api/pcaexam/statistics/{examId}: ADMIN_ROLES gate (403 "Admin access
/// required" for non-admins, AFTER subscription) + aggregate shape. Never 404s. Reader faked.
/// </summary>
public class ExamStatisticsEndpointsTests
{
    private const string ExamId = "feature-detection-001";

    [Fact]
    public async Task Denies_anonymous()
    {
        var reader = new FakeReader();
        using var factory = new StatsApiFactory(new FakeSubscriptionGuard(true), reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/pcaexam/statistics/{ExamId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Non_admin_is_forbidden_after_subscription_and_skips_read()
    {
        var subscription = new FakeSubscriptionGuard(true);
        var reader = new FakeReader();
        using var factory = new StatsApiFactory(subscription, reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest(FormMapsRoles.Student);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(1, subscription.CallCount); // subscription runs before the admin gate
        Assert.Equal(0, reader.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Admin access required", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Counselor_is_forbidden()
    {
        var reader = new FakeReader();
        using var factory = new StatsApiFactory(new FakeSubscriptionGuard(true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest(FormMapsRoles.Counselor);

        var response = await client.SendAsync(request);

        // counselor is PRIVILEGED but NOT admin.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task School_admin_gets_aggregate_shape()
    {
        var reader = new FakeReader();
        using var factory = new StatsApiFactory(new FakeSubscriptionGuard(true), reader);
        using var client = factory.CreateClient();
        using var request = BuildRequest(FormMapsRoles.SchoolAdmin);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.CallCount);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        Assert.Equal(ExamId, data.GetProperty("examId").GetString());
        Assert.Equal(2, data.GetProperty("totalAttempts").GetInt32());
        Assert.Equal(80, data.GetProperty("averageScore").GetDouble());
        Assert.Equal(90, data.GetProperty("highestScore").GetDouble());
        Assert.Equal(70, data.GetProperty("lowestScore").GetDouble());
        Assert.Equal(2, data.GetProperty("uniqueUsers").GetInt32());
    }

    private static HttpRequestMessage BuildRequest(string role)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/pcaexam/statistics/{ExamId}");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
        return request;
    }

    private sealed class StatsApiFactory(
        FakeSubscriptionGuard subscription,
        FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(subscription);
                services.RemoveAll<IExamStatisticsReader>();
                services.AddSingleton<IExamStatisticsReader>(reader);
            });
        }
    }

    private sealed class FakeSubscriptionGuard(bool allow) : ISubscriptionGuard
    {
        public int CallCount { get; private set; }

        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default)
        {
            CallCount++;
            return Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "denied"));
        }
    }

    private sealed class FakeReader : IExamStatisticsReader
    {
        public int CallCount { get; private set; }

        public Task<IReadOnlyList<ExamScoreRow>> ReadScoresAsync(RequestContext context, string examId, CancellationToken cancellationToken = default)
        {
            CallCount++;
            IReadOnlyList<ExamScoreRow> rows = [new(90, "u1"), new(70, "u2")];
            return Task.FromResult(rows);
        }
    }
}
