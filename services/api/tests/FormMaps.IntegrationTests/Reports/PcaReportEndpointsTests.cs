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

public class PcaReportEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task PcaReport_denies_anonymous_requests()
    {
        var reader = new FakePcaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new PcaReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/pca/{CallerUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task PcaReport_returns_report_for_self_access()
    {
        var reader = new FakePcaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new PcaReportApiFactory(reader, guard);
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
        Assert.True(data.GetProperty("completed").GetBoolean());

        var evaluations = data.GetProperty("evaluations");
        Assert.Equal(JsonValueKind.Array, evaluations.ValueKind);
        Assert.Equal(1, evaluations.GetArrayLength());

        var evaluation = evaluations[0];
        Assert.Equal("pca-eval-1", evaluation.GetProperty("id").GetString());
        Assert.Equal("student-1", evaluation.GetProperty("userId").GetString());
        Assert.Equal("COD-9", evaluation.GetProperty("pcaCod").GetString());
        Assert.True(evaluation.GetProperty("isActive").GetBoolean());
        Assert.True(evaluation.TryGetProperty("createdDate", out _));
        Assert.True(evaluation.TryGetProperty("updatedAt", out _));

        // Parity-critical: coKey (TIMS company API key) must NEVER be exposed.
        Assert.False(evaluation.TryGetProperty("coKey", out _));

        var careerProfile = data.GetProperty("careerProfile");
        Assert.Equal(JsonValueKind.Object, careerProfile.ValueKind);
        Assert.Equal("student-1", careerProfile.GetProperty("userId").GetString());

        Assert.True(data.TryGetProperty("generatedAt", out _));
    }

    [Fact]
    public async Task PcaReport_returns_not_found_when_non_privileged_reads_other_user()
    {
        var reader = new FakePcaReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new PcaReportApiFactory(reader, guard);
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
    public async Task PcaReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakePcaReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new PcaReportApiFactory(reader, guard);
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
    public async Task PcaReport_returns_not_found_when_target_user_missing()
    {
        var reader = new FakePcaReportReader { ReturnNull = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new PcaReportApiFactory(reader, guard);
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
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/pca/{targetUserId}");
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

    private sealed class PcaReportApiFactory(
        FakePcaReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPcaReportReader>();
                services.AddSingleton<IPcaReportReader>(reader);
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

    private sealed class FakePcaReportReader : IPcaReportReader
    {
        public int CallCount { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public bool ReturnNull { get; init; }

        public Task<PcaReport?> ReadAsync(
            RequestContext requestContext,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastTargetUserId = targetUserId;

            if (ReturnNull)
            {
                return Task.FromResult<PcaReport?>(null);
            }

            using var careerProfileDocument = JsonDocument.Parse(
                """{"userId":"student-1","interestScores":{"Realistic":42}}""");

            var report = new PcaReport(
                StudentId: "student-1",
                StudentName: "Ada Student",
                Completed: true,
                Evaluations: new[]
                {
                    new PcaEvaluation(
                        Id: "pca-eval-1",
                        UserId: "student-1",
                        PcaCod: "COD-9",
                        IsActive: true,
                        CreatedDate: new DateTimeOffset(2026, 6, 1, 0, 0, 0, TimeSpan.Zero),
                        UpdatedAt: new DateTimeOffset(2026, 6, 2, 0, 0, 0, TimeSpan.Zero))
                },
                CareerProfile: careerProfileDocument.RootElement.Clone(),
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult<PcaReport?>(report);
        }
    }
}
