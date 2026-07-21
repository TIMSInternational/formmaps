using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolReads;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolReads;

/// <summary>
/// Guard chain + HTTP mapping for the four school:manage reads (reader + scope resolver faked; DB behavior is
/// proven by SchoolReadsReaderTests). Pins: anon → 401; missing school:manage → 403 (analytics:school does NOT
/// substitute); NO-SCHOOL → 200 with the correct PER-ENDPOINT empty default (dashboard → the SERVICE's 6-field
/// zeros object, NOT the 10-field one; counselor-assignments → { data: [] }; notes → { data: { data:[], total:0 } }
/// with NO page/limit; counselor-workload → { data: [] }); and the happy-path envelope shapes (dashboard 10-field
/// expansion, notes page/limit present, workload nested assignedStudents).
/// </summary>
public class SchoolReadsEndpointsTests
{
    private const string DashboardPath = "/api/v1/school-admin/dashboard/stats";
    private const string AssignmentsPath = "/api/v1/school-admin/counselor-assignments/all";
    private const string NotesPath = "/api/v1/school-admin/notes";
    private const string WorkloadPath = "/api/v1/school-admin/counselor-workload";
    private const string School = "school-1";

    [Theory]
    [InlineData(DashboardPath)]
    [InlineData(AssignmentsPath)]
    [InlineData(NotesPath)]
    [InlineData(WorkloadPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Missing_school_manage_is_403_even_with_analytics_school()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DashboardPath, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Dashboard_no_school_returns_service_six_field_zeros_object()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, DashboardPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        // EXACTLY the 6-field zeros object — NOT the 10-field one (no activeStudents/pendingInvites/etc.).
        Assert.Equal(6, data.EnumerateObject().Count());
        Assert.Equal(0, data.GetProperty("totalStudents").GetInt32());
        Assert.Equal(0, data.GetProperty("totalCounselors").GetInt32());
        Assert.Equal(0, data.GetProperty("totalCourses").GetInt32());
        Assert.Equal(0, data.GetProperty("assessmentCompletionRate").GetInt32());
        Assert.Equal(0, data.GetProperty("pendingRequests").GetInt32());
        Assert.Equal(0, data.GetProperty("upcomingSessions").GetInt32());
        Assert.False(data.TryGetProperty("activeStudents", out _));
        Assert.False(data.TryGetProperty("averageScore", out _));
    }

    [Fact]
    public async Task Assignments_no_school_returns_empty_data_array()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, AssignmentsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Empty(doc.RootElement.GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Notes_no_school_returns_data_and_total_only_no_page_limit()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, NotesPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        // The HANDLER's no-school shape: { data: [], total: 0 } — no page/limit (distinct from empty-students).
        Assert.Equal(2, data.EnumerateObject().Count());
        Assert.Empty(data.GetProperty("data").EnumerateArray());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
        Assert.False(data.TryGetProperty("page", out _));
        Assert.False(data.TryGetProperty("limit", out _));
    }

    [Fact]
    public async Task Workload_no_school_returns_empty_data_array()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, WorkloadPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Empty(doc.RootElement.GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Dashboard_happy_path_expands_to_full_ten_field_object()
    {
        var reader = new FakeReader
        {
            Dashboard = new DashboardStats(
                TotalStudents: 20, TotalCounselors: 3, TotalCourses: 12,
                PendingRequests: 5, CompletedAssessments: 8,
                AssessmentCompletionRate: 40.0, AverageScore: 81.3),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DashboardPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(10, data.EnumerateObject().Count());
        Assert.Equal(20, data.GetProperty("totalStudents").GetInt32());
        Assert.Equal(20, data.GetProperty("activeStudents").GetInt32());    // = totalStudents
        Assert.Equal(3, data.GetProperty("totalCounselors").GetInt32());
        Assert.Equal(12, data.GetProperty("totalCourses").GetInt32());
        Assert.Equal(5, data.GetProperty("pendingInvites").GetInt32());     // = pendingRequests
        Assert.Equal(5, data.GetProperty("pendingRequests").GetInt32());
        Assert.Equal(8, data.GetProperty("completedAssessments").GetInt32());
        Assert.Equal(40.0, data.GetProperty("assessmentCompletionRate").GetDouble());
        Assert.Equal(81.3, data.GetProperty("averageScore").GetDouble());
        Assert.Equal(0, data.GetProperty("upcomingSessions").GetInt32());
    }

    [Fact]
    public async Task Assignments_happy_path_returns_pairs()
    {
        var reader = new FakeReader
        {
            Assignments = [new CounselorAssignment("s1", "c1"), new CounselorAssignment("s2", "c1")],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, AssignmentsPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var arr = doc.RootElement.GetProperty("data").EnumerateArray().ToArray();
        Assert.Equal(2, arr.Length);
        Assert.Equal("s1", arr[0].GetProperty("studentId").GetString());
        Assert.Equal("c1", arr[0].GetProperty("counselorId").GetString());
    }

    [Fact]
    public async Task Notes_happy_path_returns_page_with_limit_and_nested_note()
    {
        var note = new SchoolNote(
            Id: "n1", StudentId: "s1", AuthorId: "c1", Type: "academic", Content: "hi",
            IsPrivate: false, FollowUpDate: null, FollowUpCompleted: false, FollowUpCompletedAt: null,
            Tags: ["t1"], IsActive: true, CreatedBy: null, CreatedDate: "2026-01-01T00:00:00.000Z",
            UpdatedBy: null, UpdatedAt: "2026-01-01T00:00:00.000Z",
            Student: new SchoolNoteUser("s1", "Ada", "ada@e.st"),
            Author: new SchoolNoteUser("c1", "Grace", "grace@e.st"));
        var reader = new FakeReader { Notes = new SchoolNotesPage([note], 1, 3, 25) };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, NotesPath + "?page=3&limit=25");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(3, data.GetProperty("page").GetInt32());
        Assert.Equal(25, data.GetProperty("limit").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("n1", row.GetProperty("id").GetString());
        Assert.Equal("Ada", row.GetProperty("student").GetProperty("name").GetString());
        Assert.Equal("Grace", row.GetProperty("author").GetProperty("name").GetString());
        Assert.Equal("t1", row.GetProperty("tags")[0].GetString());
        // The endpoint clamped + forwarded page/limit to the reader.
        Assert.Equal(3, reader.LastQuery!.Page);
        Assert.Equal(25, reader.LastQuery.Limit);
    }

    [Theory]
    [InlineData("", 1, 20, null, null)]                 // defaults
    [InlineData("?limit=0", 1, 20, null, null)]         // 0 is JS-falsy -> default 20
    [InlineData("?limit=999", 1, 50, null, null)]       // clamped to 50 (NOT 100)
    [InlineData("?limit=-3", 1, 1, null, null)]         // clamped up to 1
    [InlineData("?page=0", 1, 20, null, null)]          // page 0 -> 1
    [InlineData("?search=&type=", 1, 20, null, null)]   // empty strings -> null filters
    [InlineData("?search=ab&type=academic", 1, 20, "ab", "academic")]
    public async Task Notes_query_is_clamped_and_falsy_collapsed(
        string query, int expPage, int expLimit, string? expSearch, string? expType)
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, NotesPath + query);

        Assert.Equal(expPage, reader.LastQuery!.Page);
        Assert.Equal(expLimit, reader.LastQuery.Limit);
        Assert.Equal(expSearch, reader.LastQuery.Search);
        Assert.Equal(expType, reader.LastQuery.Type);
    }

    [Fact]
    public async Task Workload_happy_path_returns_nested_assigned_students()
    {
        var reader = new FakeReader
        {
            Workload =
            [
                new CounselorWorkloadRow("c1", "Grace", "grace@e.st", 1, 2, 3,
                    [new CounselorWorkloadStudent("s1", "Ada", "ada@e.st", 10, true)]),
            ],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, WorkloadPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal("c1", row.GetProperty("id").GetString());
        Assert.Equal(1, row.GetProperty("studentCount").GetInt32());
        Assert.Equal(2, row.GetProperty("sessionCount").GetInt32());
        Assert.Equal(3, row.GetProperty("noteCount").GetInt32());
        var student = row.GetProperty("assignedStudents")[0];
        Assert.Equal("s1", student.GetProperty("id").GetString());
        Assert.Equal(10, student.GetProperty("gradeLevel").GetInt32());
        Assert.True(student.GetProperty("isActive").GetBoolean());
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permission = FormMapsPermissions.SchoolManage)
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
                services.RemoveAll<ISchoolReadsReader>();
                services.AddSingleton<ISchoolReadsReader>(reader);
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

    private sealed class FakeReader : ISchoolReadsReader
    {
        public DashboardStats Dashboard { get; init; } = new(0, 0, 0, 0, 0, 0, 0);
        public IReadOnlyList<CounselorAssignment> Assignments { get; init; } = [];
        public SchoolNotesPage Notes { get; init; } = new([], 0, 1, 20);
        public IReadOnlyList<CounselorWorkloadRow> Workload { get; init; } = [];

        public SchoolNotesQuery? LastQuery { get; private set; }

        public Task<DashboardStats> GetDashboardStatsAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Dashboard);

        public Task<IReadOnlyList<CounselorAssignment>> GetAllCounselorAssignmentsAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Assignments);

        public Task<SchoolNotesPage> GetSchoolNotesAsync(
            RequestContext context, string schoolId, SchoolNotesQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(Notes);
        }

        public Task<IReadOnlyList<CounselorWorkloadRow>> GetCounselorWorkloadAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Workload);
    }
}
