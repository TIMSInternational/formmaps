using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.AcademicGaps;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.AcademicGaps;

/// <summary>
/// Guard chain + response shapes for the 3 non-AI academic-gaps GETs (FM-DOTNET-080; reader faked, real computer).
/// Pins: anonymous → 401; missing grades:read → 403; no school → 400 "No school linked"; bad role → 403 "Forbidden";
/// summary empty { data: [] } (no summary) vs happy { data, summary }; detail 404 vs the 3-field no-rules shape vs the
/// full shape; recommendations 404 / { recommendations: [] } / full shape.
/// </summary>
public class AcademicGapsEndpointsTests
{
    private const string Summary = "/api/v1/school-admin/academic-gaps/summary";
    private const string Detail = "/api/v1/school-admin/academic-gaps/students/s1";
    private const string Recs = "/api/v1/school-admin/academic-gaps/recommendations/s1";

    [Theory]
    [InlineData(Summary)]
    [InlineData(Detail)]
    [InlineData(Recs)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Missing_permission_is_403()
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();
        var response = await Send(client, Summary, permission: FormMapsPermissions.ReportsRead);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task No_school_is_400_no_school_linked()
    {
        using var factory = new Factory(new FakeReader { Scope = new AcademicGapsScope(null, "school_admin") });
        using var client = factory.CreateClient();
        var response = await Send(client, Summary);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school linked", await Message(response));
    }

    [Fact]
    public async Task Bad_role_is_403_forbidden()
    {
        using var factory = new Factory(new FakeReader { Scope = new AcademicGapsScope("school-1", "student") });
        using var client = factory.CreateClient();
        var response = await Send(client, Summary);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Forbidden", await Message(response));
    }

    [Fact]
    public async Task Counselor_role_is_allowed()
    {
        using var factory = new Factory(new FakeReader { Scope = new AcademicGapsScope("school-1", "counselor") });
        using var client = factory.CreateClient();
        var response = await Send(client, Summary, role: FormMapsRoles.Counselor);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Summary_empty_has_data_array_and_no_summary_key()
    {
        using var factory = new Factory(new FakeReader { SummaryLoad = new SummaryLoad(false, [], [], EmptyCourses, [], 0) });
        using var client = factory.CreateClient();
        var response = await Send(client, Summary);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(0, data.GetProperty("data").GetArrayLength());
        Assert.False(data.TryGetProperty("summary", out _));
    }

    [Fact]
    public async Task Summary_happy_shape()
    {
        var students = new[] { new GapStudent("s1", "Alice", 11) };
        var grades = new[] { new GapGrade("s1", "c1", 3) };
        var courses = new Dictionary<string, GapCourse> { ["c1"] = new("c1", "ENG-9", "Eng 9", "English", 3) };
        var cats = new[] { new GapCategory("English", 4, ["ENG-9"], true) };
        using var factory = new Factory(new FakeReader { SummaryLoad = new SummaryLoad(true, students, grades, courses, cats, 24) });
        using var client = factory.CreateClient();

        var response = await Send(client, Summary);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var row = data.GetProperty("data")[0];
        Assert.Equal("s1", row.GetProperty("studentId").GetString());
        Assert.Equal("off_track", row.GetProperty("overallStatus").GetString()); // deficit 21 > 30% of 24
        Assert.Equal(3, row.GetProperty("creditsEarned").GetDouble());
        Assert.Equal(13, row.GetProperty("progressPercent").GetDouble()); // round(3/24*100)=13
        Assert.Equal(string.Empty, row.GetProperty("topGap").GetString());
        var summary = data.GetProperty("summary");
        Assert.Equal(1, summary.GetProperty("totalStudents").GetInt32());
        Assert.Equal(1, summary.GetProperty("offTrack").GetInt32());
    }

    [Fact]
    public async Task Detail_null_load_is_404()
    {
        using var factory = new Factory(new FakeReader { DetailLoad = null });
        using var client = factory.CreateClient();
        var response = await Send(client, Detail);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Student not found", await Message(response));
    }

    [Fact]
    public async Task Detail_no_rules_is_three_field_empty_shape()
    {
        using var factory = new Factory(new FakeReader
        {
            DetailLoad = new StudentGapsLoad(false, "s1", "Alice", 11, [], EmptyCourses, [], 0)
        });
        using var client = factory.CreateClient();
        var response = await Send(client, Detail);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(0, data.GetProperty("gaps").GetArrayLength());
        Assert.Equal(0, data.GetProperty("creditsEarned").GetInt32());
        Assert.Equal(0, data.GetProperty("creditsRequired").GetInt32());
        Assert.False(data.TryGetProperty("studentId", out _)); // no student identity in the empty shape
    }

    [Fact]
    public async Task Detail_happy_shape_with_gaps()
    {
        var grades = new[] { new GapGrade("s1", "c1", 3) };
        var courses = new Dictionary<string, GapCourse> { ["c1"] = new("c1", "ENG-9", "Eng 9", "English", 3) };
        var cats = new[] { new GapCategory("English", 4, ["ENG-9"], true) };
        using var factory = new Factory(new FakeReader
        {
            DetailLoad = new StudentGapsLoad(true, "s1", "Alice", 11, grades, courses, cats, 24)
        });
        using var client = factory.CreateClient();

        var response = await Send(client, Detail);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("s1", data.GetProperty("studentId").GetString());
        Assert.Equal("Alice", data.GetProperty("studentName").GetString());
        Assert.Equal(3, data.GetProperty("creditsEarned").GetDouble());
        var gap = data.GetProperty("gaps")[0];
        Assert.Equal("English", gap.GetProperty("area").GetString());
        Assert.Equal(1, gap.GetProperty("shortfall").GetDouble());
    }

    [Fact]
    public async Task Recommendations_null_load_is_404()
    {
        using var factory = new Factory(new FakeReader { RecsLoad = null });
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, Recs)).StatusCode);
    }

    [Fact]
    public async Task Recommendations_no_rules_is_empty()
    {
        using var factory = new Factory(new FakeReader { RecsLoad = new RecommendationsLoad(false, [], [], []) });
        using var client = factory.CreateClient();
        var response = await Send(client, Recs);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("recommendations").GetArrayLength());
    }

    [Fact]
    public async Task Recommendations_happy_shape()
    {
        var courses = new[] { new GapCourse("c1", "ENG-9", "Eng 9", "English", 2) };
        var cats = new[] { new GapCategory("English", 4, [], true) };
        using var factory = new Factory(new FakeReader { RecsLoad = new RecommendationsLoad(true, [], courses, cats) });
        using var client = factory.CreateClient();

        var response = await Send(client, Recs);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var rec = doc.RootElement.GetProperty("data").GetProperty("recommendations")[0];
        Assert.Equal("c1", rec.GetProperty("courseId").GetString());
        Assert.Equal("ENG-9", rec.GetProperty("courseCode").GetString());
        Assert.Equal("Helps fill 4 credit shortfall in English", rec.GetProperty("reason").GetString());
    }

    // ---- helpers ----

    private static readonly IReadOnlyDictionary<string, GapCourse> EmptyCourses = new Dictionary<string, GapCourse>();

    private static async Task<string?> Message(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path,
        string permission = FormMapsPermissions.GradesRead, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "u@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAcademicGapsReader>();
                services.AddSingleton<IAcademicGapsReader>(reader);
            });
        }
    }

    private sealed class FakeReader : IAcademicGapsReader
    {
        public AcademicGapsScope Scope { get; init; } = new("school-1", "school_admin");
        public SummaryLoad SummaryLoad { get; init; } = new(false, [], [], new Dictionary<string, GapCourse>(), [], 0);
        public StudentGapsLoad? DetailLoad { get; init; } = new(true, "s1", "Alice", 11, [], new Dictionary<string, GapCourse>(), [], 24);
        public RecommendationsLoad? RecsLoad { get; init; } = new(true, [], [], []);

        public Task<AcademicGapsScope> ResolveScopeAsync(RequestContext context, string callerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Scope);

        public Task<SummaryLoad> GetSummaryLoadAsync(RequestContext context, string schoolId, bool counselorScoped, string callerId, CancellationToken cancellationToken = default) =>
            Task.FromResult(SummaryLoad);

        public Task<StudentGapsLoad?> GetStudentDetailLoadAsync(RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(DetailLoad);

        public Task<RecommendationsLoad?> GetRecommendationsLoadAsync(RequestContext context, string schoolId, bool counselorScoped, string callerId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(RecsLoad);
    }
}
