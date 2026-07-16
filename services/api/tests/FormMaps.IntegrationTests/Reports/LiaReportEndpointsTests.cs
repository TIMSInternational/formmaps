using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Reports;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Reports;

public class LiaReportEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task LiaReport_denies_anonymous_requests()
    {
        var reader = new FakeLiaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new LiaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/lia/{CallerUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task LiaReport_returns_report_for_self_access()
    {
        var reader = new FakeLiaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new LiaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: CallerUserId,
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(CallerUserId, guard.LastTargetUserId);
        Assert.Equal(CallerUserId, guard.LastCaller?.Actor?.UserId);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal(CallerUserId, reader.LastTargetUserId);
        Assert.Equal(CallerUserId, reader.LastContext?.Actor?.UserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());

        var data = root.GetProperty("data");
        Assert.Equal("student-1", data.GetProperty("studentId").GetString());
        Assert.Equal("Ada Student", data.GetProperty("studentName").GetString());
        Assert.Equal(74.3, data.GetProperty("overallScore").GetDouble());
        Assert.Equal(4, data.GetProperty("completedExams").GetInt32());
        Assert.Equal(5, data.GetProperty("totalExams").GetInt32());

        // Parity-critical: cognitiveProfile has exactly the five PascalCase keys, in order.
        var profile = data.GetProperty("cognitiveProfile");
        Assert.Equal(JsonValueKind.Object, profile.ValueKind);
        var keys = profile.EnumerateObject().Select(p => p.Name).ToArray();
        Assert.Equal(
            new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory", "NumericVelocity", "VisualRotation" },
            keys);
        Assert.Equal(90, profile.GetProperty("PatternRecognition").GetInt32());
        Assert.Equal(65, profile.GetProperty("NumericVelocity").GetInt32());
        // A double-valued 0 must not linger as a camelCased key.
        Assert.False(profile.TryGetProperty("numericVelocity", out _));

        var strengths = data.GetProperty("strengths").EnumerateArray().Select(e => e.GetString()).ToArray();
        Assert.Equal(new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory" }, strengths);

        var areas = data.GetProperty("areasForGrowth").EnumerateArray().Select(e => e.GetString()).ToArray();
        Assert.Equal(new[] { "VisualRotation" }, areas);

        Assert.True(data.TryGetProperty("generatedAt", out _));
    }

    [Fact]
    public async Task LiaReport_returns_not_found_when_non_privileged_reads_other_user()
    {
        var reader = new FakeLiaReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new LiaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Student,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal("other-user", guard.LastTargetUserId);
        Assert.Equal(0, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task LiaReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakeLiaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new LiaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.Counselor,
            schoolId: "school-123");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal("other-user", guard.LastTargetUserId);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal("other-user", reader.LastTargetUserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task LiaReport_returns_not_found_when_target_user_missing()
    {
        var reader = new FakeLiaReportReader { ReturnNull = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new LiaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "ghost-user",
            role: FormMapsRoles.SuperAdmin,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    private static HttpRequestMessage BuildAuthenticatedRequest(
        string targetUserId,
        string role,
        string? schoolId)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/lia/{targetUserId}");
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

    private sealed class LiaReportApiFactory(
        FakeLiaReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ILiaReportReader>();
                services.AddSingleton<ILiaReportReader>(reader);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
            });
        }
    }

    private sealed class FakeUserAccessGuard(bool allow) : IUserAccessGuard
    {
        public int CallCount { get; private set; }

        public RequestContext? LastCaller { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(
            RequestContext caller,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastCaller = caller;
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeLiaReportReader : ILiaReportReader
    {
        public int CallCount { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public bool ReturnNull { get; init; }

        public Task<LiaReport?> ReadAsync(
            RequestContext requestContext,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastTargetUserId = targetUserId;

            if (ReturnNull)
            {
                return Task.FromResult<LiaReport?>(null);
            }

            var profile = new Dictionary<string, double>
            {
                ["PatternRecognition"] = 90,
                ["VerbalReasoning"] = 80,
                ["WorkingMemory"] = 72,
                ["NumericVelocity"] = 65,
                ["VisualRotation"] = 40,
            };

            var report = new LiaReport(
                StudentId: "student-1",
                StudentName: "Ada Student",
                CognitiveProfile: profile,
                OverallScore: 74.3,
                CompletedExams: 4,
                TotalExams: 5,
                Strengths: new[] { "PatternRecognition", "VerbalReasoning", "WorkingMemory" },
                AreasForGrowth: new[] { "VisualRotation" },
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult<LiaReport?>(report);
        }
    }
}
