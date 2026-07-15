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

public class ReportEndpointsTests
{
    [Fact]
    public async Task Benchmark_denies_anonymous_requests()
    {
        var reader = new FakeSchoolBenchmarkReportReader();
        using var factory = new ReportApiFactory(reader);
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/reports/benchmark");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Benchmark_denies_users_without_school_analytics_permission()
    {
        var reader = new FakeSchoolBenchmarkReportReader();
        using var factory = new ReportApiFactory(reader);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            role: FormMapsRoles.Student,
            schoolId: "school-123",
            permissions: [FormMapsPermissions.ReportsRead]);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Benchmark_requires_school_context_even_for_privileged_users()
    {
        var reader = new FakeSchoolBenchmarkReportReader();
        using var factory = new ReportApiFactory(reader);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            role: FormMapsRoles.SuperAdmin,
            schoolId: null,
            permissions: [FormMapsPermissions.AnalyticsSchool]);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Benchmark_returns_school_report_for_authorized_school_user()
    {
        var reader = new FakeSchoolBenchmarkReportReader();
        using var factory = new ReportApiFactory(reader);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            role: FormMapsRoles.SchoolAdmin,
            schoolId: "school-123",
            permissions: [FormMapsPermissions.AnalyticsSchool]);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, reader.CallCount);
        Assert.Equal("school-123", reader.LastSchoolId);
        Assert.Equal("user-123", reader.LastContext?.Actor?.UserId);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = document.RootElement.GetProperty("data");
        var distribution = data.GetProperty("gpaDistribution");

        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(42, data.GetProperty("totalStudents").GetInt32());
        Assert.Equal(3.41, data.GetProperty("averageGpa").GetDouble());
        Assert.Equal(76, data.GetProperty("pcaCompletionRate").GetInt32());
        Assert.Equal(68.7, data.GetProperty("milAverageScore").GetDouble());
        Assert.Equal(10, distribution.GetProperty("above35").GetInt32());
        Assert.Equal(12, distribution.GetProperty("above30").GetInt32());
        Assert.Equal(8, distribution.GetProperty("above25").GetInt32());
        Assert.Equal(3, distribution.GetProperty("below25").GetInt32());
    }

    private static HttpRequestMessage BuildAuthenticatedRequest(
        string role,
        string? schoolId,
        IReadOnlyCollection<string> permissions)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/reports/benchmark");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, string.Join(",", permissions));

        if (!string.IsNullOrWhiteSpace(schoolId))
        {
            request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        }

        return request;
    }

    private sealed class ReportApiFactory(
        FakeSchoolBenchmarkReportReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolBenchmarkReportReader>();
                services.AddSingleton<ISchoolBenchmarkReportReader>(reader);
            });
        }
    }

    private sealed class FakeSchoolBenchmarkReportReader : ISchoolBenchmarkReportReader
    {
        public int CallCount { get; private set; }

        public string? LastSchoolId { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public Task<SchoolBenchmarkReport> ReadAsync(
            RequestContext requestContext,
            string schoolId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastSchoolId = schoolId;

            return Task.FromResult(new SchoolBenchmarkReport(
                TotalStudents: 42,
                AverageGpa: 3.41,
                PcaCompletionRate: 76,
                MilAverageScore: 68.7,
                GpaDistribution: new GpaDistribution(10, 12, 8, 3),
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero)));
        }
    }
}
