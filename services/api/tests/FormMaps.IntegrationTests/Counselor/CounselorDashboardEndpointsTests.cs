using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Counselor;

/// <summary>
/// Guard chain + HTTP mapping for the four counselor:dashboard reads (reader faked). Pins: anonymous → 401; the
/// permission gate (non-counselor:dashboard → 403 "Insufficient permissions"); the /dashboard payload shape incl. the
/// noteView fields; the change-requests envelope with the nested student{name} object AND studentName (name ||
/// "Student") AND credits-as-string AND total = page length; and the student-detail assignment-miss ("Not found")
/// vs user-miss ("Student not found") 404 split across BOTH /me/students/{id} and /students/{id}.
/// </summary>
public class CounselorDashboardEndpointsTests
{
    private const string DashboardPath = "/api/v1/counselor/dashboard";
    private const string ChangePath = "/api/v1/counselor/dashboard/change-requests";
    private const string MeStudentPath = "/api/v1/counselor/me/students/s1";
    private const string StudentPath = "/api/v1/counselor/students/s1";

    [Theory]
    [InlineData(DashboardPath)]
    [InlineData(ChangePath)]
    [InlineData(MeStudentPath)]
    [InlineData(StudentPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(DashboardPath)]
    [InlineData(ChangePath)]
    [InlineData(MeStudentPath)]
    [InlineData(StudentPath)]
    public async Task Missing_counselor_dashboard_permission_is_403(string path)
    {
        using var factory = new Factory(new FakeReader { AssignmentExists = true, Student = SampleStudent() });
        using var client = factory.CreateClient();

        // Authenticated counselor role but WITHOUT the counselor:dashboard permission claim.
        var response = await Send(client, path, permission: FormMapsPermissions.ReportsRead);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Insufficient permissions", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- /dashboard ----

    [Fact]
    public async Task Dashboard_happy_shape()
    {
        var reader = new FakeReader
        {
            Dashboard = new CounselorDashboardResult(
                TotalStudents: 3, PendingRequests: 2, UpcomingSessions: 1, FollowUps: 4, OverdueFollowUps: 1,
                PendingFollowUpsList:
                [
                    new CounselorDashboardNote("n1", "s1", "Alice", "meeting", "follow up soon", "2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
                ],
                RecentNotes:
                [
                    new CounselorDashboardNote("n2", "s2", "Student", "general", "recent note", null, "2026-01-05T00:00:00.000Z"),
                ]),
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, DashboardPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.GetProperty("totalStudents").GetInt32());
        Assert.Equal(2, data.GetProperty("pendingRequests").GetInt32());
        Assert.Equal(1, data.GetProperty("upcomingSessions").GetInt32());
        Assert.Equal(4, data.GetProperty("followUps").GetInt32());
        Assert.Equal(1, data.GetProperty("overdueFollowUps").GetInt32());

        var pending = data.GetProperty("pendingFollowUpsList")[0];
        Assert.Equal("n1", pending.GetProperty("id").GetString());
        Assert.Equal("Alice", pending.GetProperty("studentName").GetString());
        Assert.Equal("meeting", pending.GetProperty("type").GetString());
        Assert.Equal("follow up soon", pending.GetProperty("content").GetString());
        Assert.Equal("2026-02-01T00:00:00.000Z", pending.GetProperty("followUpDate").GetString());
        Assert.Equal("2026-01-01T00:00:00.000Z", pending.GetProperty("createdAt").GetString());

        var recent = data.GetProperty("recentNotes")[0];
        Assert.Equal("Student", recent.GetProperty("studentName").GetString());
        Assert.Equal(JsonValueKind.Null, recent.GetProperty("followUpDate").ValueKind);
    }

    // ---- /dashboard/change-requests ----

    [Fact]
    public async Task ChangeRequests_shape_has_nested_student_and_studentName_and_string_credits()
    {
        var reader = new FakeReader
        {
            ChangeRequests = new CounselorChangeRequestsResult(
                [SampleChangeRow(studentName: "Bob")], 1),
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, ChangePath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("r1", row.GetProperty("id").GetString());
        Assert.Equal("3.5", row.GetProperty("credits").GetString());          // Decimal → STRING
        Assert.Equal("Bob", row.GetProperty("student").GetProperty("name").GetString()); // nested include
        Assert.Equal("Bob", row.GetProperty("studentName").GetString());
    }

    [Fact]
    public async Task ChangeRequests_null_student_name_becomes_Student_but_nested_stays_null()
    {
        var reader = new FakeReader
        {
            ChangeRequests = new CounselorChangeRequestsResult(
                [SampleChangeRow(studentName: null)], 1),
        };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, ChangePath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data").GetProperty("data")[0];
        Assert.Equal("Student", row.GetProperty("studentName").GetString());              // name || "Student"
        Assert.Equal(JsonValueKind.Null, row.GetProperty("student").GetProperty("name").ValueKind); // raw stays null
    }

    [Fact]
    public async Task ChangeRequests_limit_query_is_clamped_and_forwarded()
    {
        var reader = new FakeReader { ChangeRequests = new CounselorChangeRequestsResult([], 0) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        await Send(client, ChangePath + "?limit=999");
        Assert.Equal(100, reader.LastLimit);   // Math.min(100, ...)

        await Send(client, ChangePath + "?limit=abc");
        Assert.Equal(30, reader.LastLimit);     // parseInt NaN || 30

        await Send(client, ChangePath + "?limit=0");
        Assert.Equal(30, reader.LastLimit);     // 0 is falsy → 30

        await Send(client, ChangePath);
        Assert.Equal(30, reader.LastLimit);     // absent → 30
    }

    // ---- student detail (both paths) ----

    [Theory]
    [InlineData(MeStudentPath)]
    [InlineData(StudentPath)]
    public async Task StudentDetail_no_assignment_is_404_not_found(string path)
    {
        var reader = new FakeReader { AssignmentExists = false };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData(MeStudentPath)]
    [InlineData(StudentPath)]
    public async Task StudentDetail_assigned_but_missing_user_is_404_student_not_found(string path)
    {
        var reader = new FakeReader { AssignmentExists = true, Student = null };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData(MeStudentPath)]
    [InlineData(StudentPath)]
    public async Task StudentDetail_happy_returns_the_six_fields(string path)
    {
        var reader = new FakeReader { AssignmentExists = true, Student = SampleStudent() };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("s1", data.GetProperty("id").GetString());
        Assert.Equal("Alice", data.GetProperty("name").GetString());
        Assert.Equal("alice@example.test", data.GetProperty("email").GetString());
        Assert.Equal(11, data.GetProperty("gradeLevel").GetInt32());
        Assert.Equal("school-1", data.GetProperty("schoolId").GetString());
        Assert.Equal("2026-01-01T00:00:00.000Z", data.GetProperty("createdDate").GetString());
    }

    // ---- helpers ----

    private static CounselorStudentDetail SampleStudent() =>
        new("s1", "Alice", "alice@example.test", 11, "school-1", "2026-01-01T00:00:00.000Z");

    private static CounselorChangeRequestRow SampleChangeRow(string? studentName) => new(
        "r1", "s1", "school-1", "c1", "M1", "Algebra", "3.5", 11, "Fall", "add", null, null, "pending", null, null,
        null, true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z", studentName);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path,
        string permission = FormMapsPermissions.CounselorDashboard, string role = FormMapsRoles.Counselor)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "counselor-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "counselor@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Counselor");
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
                services.RemoveAll<ICounselorDashboardReader>();
                services.AddSingleton<ICounselorDashboardReader>(reader);
            });
        }
    }

    private sealed class FakeReader : ICounselorDashboardReader
    {
        public CounselorDashboardResult Dashboard { get; init; } =
            new(0, 0, 0, 0, 0, [], []);
        public CounselorChangeRequestsResult ChangeRequests { get; init; } = new([], 0);
        public bool AssignmentExists { get; init; }
        public CounselorStudentDetail? Student { get; init; }

        public int? LastLimit { get; private set; }

        public Task<CounselorDashboardResult> GetDashboardAsync(
            RequestContext context, string counselorId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Dashboard);

        public Task<CounselorChangeRequestsResult> GetDashboardChangeRequestsAsync(
            RequestContext context, string counselorId, int limit, CancellationToken cancellationToken = default)
        {
            LastLimit = limit;
            return Task.FromResult(ChangeRequests);
        }

        public Task<bool> HasActiveAssignmentAsync(
            RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(AssignmentExists);

        public Task<CounselorStudentDetail?> GetStudentDetailAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Student);
    }
}
