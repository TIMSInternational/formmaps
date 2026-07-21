using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolAnalytics;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolAnalytics;

/// <summary>
/// Guard chain + HTTP mapping for the four school-analytics reads (reader + scope resolver faked; DB behavior is
/// proven by SchoolAnalyticsReaderTests). Pins: anon → 401; missing analytics:school → 403 (school:manage does NOT
/// substitute); NO-SCHOOL → 200 with the correct PER-ENDPOINT empty default (overview → { totalStudents:0 } ONLY,
/// NOT the 6-field object; trends/performance-trends → { labels:[], values:[] }; top-performers → { data:[] });
/// and the happy-path envelope shapes (incl. performance-trends routing to the same reader call as trends).
/// </summary>
public class SchoolAnalyticsEndpointsTests
{
    private const string OverviewPath = "/api/v1/school-admin/analytics/overview";
    private const string TrendsPath = "/api/v1/school-admin/analytics/trends";
    private const string PerformanceTrendsPath = "/api/v1/school-admin/analytics/performance-trends";
    private const string TopPerformersPath = "/api/v1/school-admin/analytics/top-performers";
    private const string School = "school-1";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(OverviewPath)).StatusCode);
    }

    [Fact]
    public async Task Missing_analytics_school_is_403_even_with_school_manage()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, OverviewPath, permission: FormMapsPermissions.SchoolManage);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Overview_no_school_returns_200_with_only_totalStudents_zero()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, OverviewPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        // ONLY totalStudents:0 — NOT the full 6-field object.
        Assert.Single(data.EnumerateObject());
        Assert.Equal(0, data.GetProperty("totalStudents").GetInt32());
    }

    [Theory]
    [InlineData(TrendsPath)]
    [InlineData(PerformanceTrendsPath)]
    public async Task Trends_no_school_returns_200_empty_labels_and_values(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Empty(data.GetProperty("labels").EnumerateArray());
        Assert.Empty(data.GetProperty("values").EnumerateArray());
    }

    [Fact]
    public async Task TopPerformers_no_school_returns_200_empty_data()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, TopPerformersPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Empty(doc.RootElement.GetProperty("data").GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Overview_happy_path_returns_full_six_field_object()
    {
        var reader = new FakeReader
        {
            Overview = new AnalyticsOverview(10, 8, 70, 82.5, 2, 60),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, OverviewPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var fieldCount = data.EnumerateObject().Count();
        Assert.Equal(6, fieldCount);
        Assert.Equal(10, data.GetProperty("totalStudents").GetInt32());
        Assert.Equal(8, data.GetProperty("activeStudents").GetInt32());
        Assert.Equal(70, data.GetProperty("assessmentCompletionRate").GetInt32());
        Assert.Equal(82.5, data.GetProperty("averageProgressScore").GetDouble());
        Assert.Equal(2, data.GetProperty("studentsAtRisk").GetInt32());
        Assert.Equal(60, data.GetProperty("counselorCoverage").GetInt32());
    }

    [Fact]
    public async Task Trends_happy_path_echoes_metric_range_labels_values()
    {
        var reader = new FakeReader
        {
            Trends = new AnalyticsTrends("grades", "90d", ["2026-01-01"], [3]),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, TrendsPath + "?metric=grades&range=90d");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("grades", data.GetProperty("metric").GetString());
        Assert.Equal("90d", data.GetProperty("range").GetString());
        Assert.Equal("2026-01-01", data.GetProperty("labels")[0].GetString());
        Assert.Equal(3, data.GetProperty("values")[0].GetInt32());
        // The endpoint forwarded the query metric/range to the reader (defaults not applied when present).
        Assert.Equal("grades", reader.LastMetric);
        Assert.Equal("90d", reader.LastRange);
    }

    [Fact]
    public async Task Trends_applies_defaults_when_query_absent()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, TrendsPath);

        Assert.Equal("completion_rate", reader.LastMetric);
        Assert.Equal("30d", reader.LastRange);
    }

    [Fact]
    public async Task PerformanceTrends_uses_the_same_reader_call_as_trends()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, PerformanceTrendsPath + "?metric=enrollments&range=1y");

        Assert.Equal("enrollments", reader.LastMetric);
        Assert.Equal("1y", reader.LastRange);
    }

    [Fact]
    public async Task TopPerformers_happy_path_returns_rows_without_gpa()
    {
        var reader = new FakeReader
        {
            TopPerformers = [new TopPerformer("s1", "Ada", 10, 95.0, "completed")],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, TopPerformersPath + "?limit=5&gradeLevel=10");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data").GetProperty("data")[0];
        Assert.Equal("s1", row.GetProperty("studentId").GetString());
        Assert.Equal("Ada", row.GetProperty("name").GetString());
        Assert.Equal(10, row.GetProperty("gradeLevel").GetInt32());
        Assert.Equal(95.0, row.GetProperty("progressScore").GetDouble());
        Assert.Equal("completed", row.GetProperty("assessmentStatus").GetString());
        Assert.False(row.TryGetProperty("gpa", out _)); // gpa dropped
        // limit clamp + gradeLevel truthiness resolved at the endpoint.
        Assert.Equal(5, reader.LastLimit);
        Assert.Equal(10, reader.LastGradeLevel);
    }

    [Theory]
    [InlineData("", 10, null)]        // absent -> default 10, no grade filter
    [InlineData("?limit=0", 10, null)] // 0 is JS-falsy -> default 10
    [InlineData("?limit=999", 50, null)] // clamped to 50
    [InlineData("?limit=-4", 1, null)]  // clamped up to 1
    [InlineData("?gradeLevel=0", 10, null)] // gradeLevel 0 is falsy -> no filter
    [InlineData("?gradeLevel=11", 10, 11)]
    public async Task TopPerformers_limit_and_grade_are_clamped(string query, int expectedLimit, int? expectedGrade)
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, TopPerformersPath + query);

        Assert.Equal(expectedLimit, reader.LastLimit);
        Assert.Equal(expectedGrade, reader.LastGradeLevel);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permission = FormMapsPermissions.AnalyticsSchool)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolAnalyticsReader>();
                services.AddSingleton<ISchoolAnalyticsReader>(reader);
                services.RemoveAll<ISchoolAdminScopeResolver>();
                services.AddSingleton<ISchoolAdminScopeResolver>(scope);
            });
        }
    }

    private sealed class FakeScope(string? schoolId) : ISchoolAdminScopeResolver
    {
        public Task<string?> ResolveSchoolIdAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(schoolId);
    }

    private sealed class FakeReader : ISchoolAnalyticsReader
    {
        public AnalyticsOverview Overview { get; init; } = new(0, 0, 0, 0, 0, 0);
        public AnalyticsTrends Trends { get; init; } = new("completion_rate", "30d", [], []);
        public IReadOnlyList<TopPerformer> TopPerformers { get; init; } = [];

        public string? LastMetric { get; private set; }
        public string? LastRange { get; private set; }
        public int LastLimit { get; private set; }
        public int? LastGradeLevel { get; private set; }

        public Task<AnalyticsOverview> GetOverviewAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Overview);

        public Task<AnalyticsTrends> GetTrendsAsync(
            RequestContext context, string schoolId, string metric, string range, CancellationToken cancellationToken = default)
        {
            LastMetric = metric;
            LastRange = range;
            return Task.FromResult(Trends);
        }

        public Task<IReadOnlyList<TopPerformer>> GetTopPerformersAsync(
            RequestContext context, string schoolId, int limit, int? gradeLevel, CancellationToken cancellationToken = default)
        {
            LastLimit = limit;
            LastGradeLevel = gradeLevel;
            return Task.FromResult(TopPerformers);
        }
    }
}
