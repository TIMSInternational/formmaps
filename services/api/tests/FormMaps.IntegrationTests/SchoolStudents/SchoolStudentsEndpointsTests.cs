using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolStudents;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolStudents;

/// <summary>
/// Guard chain + HTTP mapping for the three school:manage roster reads (reader + scope resolver faked; DB behavior
/// is proven by SchoolStudentsReaderTests). Pins: anon → 401; missing school:manage → 403 (analytics:school does
/// NOT substitute); the ASYMMETRIC no-school shapes (list → 200 { success, data:{data:[],total:0} } WITHOUT
/// page/limit; detail + community → 400 "No school"); the uniform 404 "Student not found"; the list HAPPY-path bare
/// envelope ({ data,total,page,limit,totalPages } with NO success key); the detail nested assessmentStatus /
/// creditProgress; the community-service hours STRING passthrough; and the list pagination clamp (cap 100, default
/// 20, falsy collapse, empty-search → null).
/// </summary>
public class SchoolStudentsEndpointsTests
{
    private const string StudentsPath = "/api/v1/school-admin/students";
    private const string DetailPath = "/api/v1/school-admin/students/s1";
    private const string CommunityPath = "/api/v1/school-admin/students/s1/community-service";
    private const string School = "school-1";

    [Theory]
    [InlineData(StudentsPath)]
    [InlineData(DetailPath)]
    [InlineData(CommunityPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(StudentsPath)]
    [InlineData(DetailPath)]
    [InlineData(CommunityPath)]
    public async Task Missing_school_manage_is_403_even_with_analytics_school(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, path, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- list ----

    [Fact]
    public async Task List_no_school_returns_success_wrapper_with_empty_inner_data_and_total_only()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        var data = root.GetProperty("data");
        // { data:[], total:0 } — NO page/limit/totalPages (distinct from the happy-path bare object).
        Assert.Equal(2, data.EnumerateObject().Count());
        Assert.Empty(data.GetProperty("data").EnumerateArray());
        Assert.Equal(0, data.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task List_happy_path_emits_service_object_verbatim_with_no_success_wrapper()
    {
        var reader = new FakeReader
        {
            List = new StudentListPage(
                [new StudentListItem("s1", "Ada", "ada@e.st", "Student", 11, true, "2026-01-02T00:00:00.000Z", "active")],
                Total: 1, Page: 2, Limit: 25, TotalPages: 1),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StudentsPath + "?page=2&limit=25");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        // Bare service object — NO success key.
        Assert.False(root.TryGetProperty("success", out _));
        Assert.Equal(5, root.EnumerateObject().Count());
        Assert.Equal(1, root.GetProperty("total").GetInt32());
        Assert.Equal(2, root.GetProperty("page").GetInt32());
        Assert.Equal(25, root.GetProperty("limit").GetInt32());
        Assert.Equal(1, root.GetProperty("totalPages").GetInt32());
        var row = root.GetProperty("data")[0];
        Assert.Equal("s1", row.GetProperty("id").GetString());
        Assert.Equal("Student", row.GetProperty("roleName").GetString());
        Assert.Equal(11, row.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("active", row.GetProperty("status").GetString());
        // The endpoint forwarded the clamped page/limit to the reader.
        Assert.Equal(2, reader.LastQuery!.Page);
        Assert.Equal(25, reader.LastQuery.Limit);
    }

    [Theory]
    [InlineData("", 1, 20, null)]                    // defaults
    [InlineData("?limit=0", 1, 20, null)]            // 0 is JS-falsy -> default 20
    [InlineData("?limit=999", 1, 100, null)]         // clamped to 100
    [InlineData("?limit=-3", 1, 1, null)]            // clamped up to 1
    [InlineData("?page=0", 1, 20, null)]             // page 0 -> 1
    [InlineData("?search=", 1, 20, null)]            // empty string -> null filter
    [InlineData("?page=3&search=ab", 3, 20, "ab")]
    public async Task List_query_is_clamped_and_falsy_collapsed(
        string query, int expPage, int expLimit, string? expSearch)
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        await Send(client, StudentsPath + query);

        Assert.Equal(expPage, reader.LastQuery!.Page);
        Assert.Equal(expLimit, reader.LastQuery.Limit);
        Assert.Equal(expSearch, reader.LastQuery.Search);
    }

    // ---- detail ----

    [Fact]
    public async Task Detail_no_school_is_400_no_school()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, DetailPath);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Detail_null_reader_is_404_student_not_found()
    {
        var reader = new FakeReader { Detail = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DetailPath);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Detail_happy_path_nests_assessment_status_and_credit_progress()
    {
        var reader = new FakeReader
        {
            Detail = new StudentDetail(
                Id: "s1", Name: "Ada", Email: "ada@e.st", GradeLevel: 12, Status: "active",
                Gpa: 3.85, AlertCount: 2, LastActive: "2026-01-03T04:05:06.000Z",
                AssessmentStatus: new StudentAssessmentStatus("completed", "in_progress", "not_started"),
                CreditProgress: new StudentCreditProgress(30.5, 120, 25)),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DetailPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("s1", data.GetProperty("id").GetString());
        Assert.Equal(12, data.GetProperty("gradeLevel").GetInt32());
        Assert.Equal(3.85, data.GetProperty("gpa").GetDouble());
        Assert.Equal(2, data.GetProperty("alertCount").GetInt32());
        Assert.Equal("2026-01-03T04:05:06.000Z", data.GetProperty("lastActive").GetString());
        var assess = data.GetProperty("assessmentStatus");
        Assert.Equal("completed", assess.GetProperty("PCA").GetString());
        Assert.Equal("in_progress", assess.GetProperty("MIL").GetString());
        Assert.Equal("not_started", assess.GetProperty("Eval360").GetString());
        var credit = data.GetProperty("creditProgress");
        Assert.Equal(30.5, credit.GetProperty("earned").GetDouble());
        Assert.Equal(120, credit.GetProperty("required").GetDouble());
        Assert.Equal(25, credit.GetProperty("percentage").GetInt32());
    }

    [Fact]
    public async Task Detail_null_gpa_serializes_as_json_null()
    {
        var reader = new FakeReader
        {
            Detail = new StudentDetail(
                "s1", "Ada", "ada@e.st", null, "active", Gpa: null, AlertCount: 0, LastActive: "2026-01-01T00:00:00.000Z",
                new StudentAssessmentStatus("not_started", "not_started", "not_started"),
                new StudentCreditProgress(0, 120, 0)),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DetailPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gpa").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gradeLevel").ValueKind);
    }

    // ---- community-service ----

    [Fact]
    public async Task Community_no_school_is_400_no_school()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, CommunityPath);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Community_null_reader_is_404_student_not_found()
    {
        var reader = new FakeReader { Community = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, CommunityPath);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Community_happy_path_emits_entries_with_string_hours_and_total_hours()
    {
        var entry = new CommunityServiceEntryRow(
            Id: "e1", StudentId: "s1", SchoolId: School, Organization: "Food Bank", Description: null,
            Hours: "5.5", Date: "2026-01-02T00:00:00.000Z", SupervisorName: "Sup", SupervisorEmail: null,
            Status: "verified", Note: null, VerifiedBy: "admin-1", VerifiedAt: "2026-01-03T00:00:00.000Z",
            IsActive: true, CreatedBy: null, CreatedDate: "2026-01-01T00:00:00.000Z", UpdatedBy: null,
            UpdatedAt: "2026-01-01T00:00:00.000Z");
        var reader = new FakeReader { Community = new StudentCommunityService([entry], 40) };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, CommunityPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(40, data.GetProperty("totalHoursRequired").GetInt32());
        var row = data.GetProperty("entries")[0];
        Assert.Equal("e1", row.GetProperty("id").GetString());
        // hours is a STRING (raw Decimal passthrough), NOT a number.
        Assert.Equal(JsonValueKind.String, row.GetProperty("hours").ValueKind);
        Assert.Equal("5.5", row.GetProperty("hours").GetString());
        Assert.Equal("verified", row.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("description").ValueKind);
        Assert.Equal("2026-01-03T00:00:00.000Z", row.GetProperty("verifiedAt").GetString());
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
                services.RemoveAll<ISchoolStudentsReader>();
                services.AddSingleton<ISchoolStudentsReader>(reader);
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

    private sealed class FakeReader : ISchoolStudentsReader
    {
        public StudentListPage List { get; init; } = new([], 0, 1, 20, 0);
        public StudentDetail? Detail { get; init; } = new(
            "s1", "Ada", "ada@e.st", 11, "active", 3.0, 0, "2026-01-01T00:00:00.000Z",
            new StudentAssessmentStatus("not_started", "not_started", "not_started"),
            new StudentCreditProgress(0, 120, 0));
        public StudentCommunityService? Community { get; init; } = new([], 0);

        public StudentListQuery? LastQuery { get; private set; }

        public Task<StudentListPage> ListStudentsAsync(
            RequestContext context, string schoolId, StudentListQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(List);
        }

        public Task<StudentDetail?> GetStudentDetailAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Detail);

        public Task<StudentCommunityService?> GetStudentCommunityServiceAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Community);
    }
}
