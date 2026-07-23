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
/// Guard chain + HTTP mapping for the three course-planning reads (reader + scope resolver faked). Pins: the ROLE
/// gate on the two /course-plan reads (non-admin → 403 "Forbidden"; Super-Admin bypasses studentInCallerSchool;
/// no-school non-admin / student-not-in-school → 404 "Not found"); the course-plan happy shape incl. the graded-
/// with-grade-key vs plan-without-grade-key asymmetry + the no-school minimal { plan:{enrollments:[]} } early return;
/// the change-requests { data:{data,total} } envelope; and the deadline read (school:manage; no-school → 400).
/// </summary>
public class SchoolStudentsCoursePlanEndpointsTests
{
    private const string PlanPath = "/api/v1/school-admin/students/s1/course-plan";
    private const string ChangePath = "/api/v1/school-admin/students/s1/course-plan/change-requests";
    private const string DeadlinePath = "/api/v1/school-admin/course-request-deadline";
    private const string School = "school-1";

    [Theory]
    [InlineData(PlanPath)]
    [InlineData(ChangePath)]
    [InlineData(DeadlinePath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    // ---- role gate (course-plan pair) ----

    [Theory]
    [InlineData(PlanPath)]
    [InlineData(ChangePath)]
    public async Task CoursePlan_non_admin_role_is_403_forbidden(string path)
    {
        var reader = new FakeReader { StudentInSchool = true };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        // counselor holds school:manage but is NOT school_admin/Super Admin → 403 (role gate, not permission).
        var response = await Send(client, path, role: "counselor");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Forbidden", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CoursePlan_super_admin_bypasses_student_school_check()
    {
        var reader = new FakeReader { StudentInSchool = false, Plan = SamplePlan() };
        using var factory = new Factory(reader, new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, PlanPath, role: FormMapsRoles.SuperAdmin);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(reader.IsStudentInSchoolCalled); // bypassed
    }

    [Fact]
    public async Task CoursePlan_school_admin_without_school_is_404()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, PlanPath); // school_admin, no school
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CoursePlan_student_not_in_school_is_404()
    {
        var reader = new FakeReader { StudentInSchool = false };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, PlanPath)).StatusCode);
    }

    // ---- course-plan shapes ----

    [Fact]
    public async Task CoursePlan_null_result_returns_minimal_empty_shape()
    {
        var reader = new FakeReader { StudentInSchool = true, Plan = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, PlanPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        var plan = data.GetProperty("plan");
        // minimal: plan has ONLY enrollments (no studentId/gradeLevel/graduationProgress).
        Assert.Single(plan.EnumerateObject());
        Assert.Empty(plan.GetProperty("enrollments").EnumerateArray());
        Assert.Empty(data.GetProperty("recommendations").EnumerateArray());
    }

    [Fact]
    public async Task CoursePlan_happy_shape_grade_key_only_on_graded_enrollments()
    {
        var reader = new FakeReader { StudentInSchool = true, Plan = SamplePlan() };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, PlanPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var plan = doc.RootElement.GetProperty("data").GetProperty("plan");
        Assert.Equal("s1", plan.GetProperty("studentId").GetString());
        Assert.Equal(12, plan.GetProperty("gradeLevel").GetInt32());
        var gp = plan.GetProperty("graduationProgress");
        Assert.Equal(4.0, gp.GetProperty("totalCreditsEarned").GetDouble());
        Assert.Equal(20.0, gp.GetProperty("totalCreditsRequired").GetDouble());
        Assert.False(gp.GetProperty("isOnTrack").GetBoolean());
        var enrolls = plan.GetProperty("enrollments").EnumerateArray().ToArray();
        // graded first (HAS grade key), plan second (NO grade key).
        Assert.True(enrolls[0].TryGetProperty("grade", out var g) && g.GetString() == "A");
        Assert.False(enrolls[1].TryGetProperty("grade", out _));
    }

    // ---- change-requests ----

    [Fact]
    public async Task ChangeRequests_envelope_is_data_data_total()
    {
        var reader = new FakeReader
        {
            StudentInSchool = true,
            ChangeRequests = new ChangeRequestsResult([SampleChangeRow()], 1),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, ChangePath + "?status=pending");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("r1", row.GetProperty("id").GetString());
        Assert.Equal("3.5", row.GetProperty("credits").GetString()); // STRING
        Assert.Equal("pending", reader.LastStatus);
    }

    // ---- deadline ----

    [Fact]
    public async Task Deadline_missing_school_manage_is_403()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, DeadlinePath, permission: FormMapsPermissions.AnalyticsSchool);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Deadline_no_school_is_400()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await Send(client, DeadlinePath);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Deadline_happy_returns_deadline_value()
    {
        var reader = new FakeReader { Deadline = "2026-05-01T00:00:00.000Z" };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, DeadlinePath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("2026-05-01T00:00:00.000Z", doc.RootElement.GetProperty("data").GetProperty("deadline").GetString());
    }

    // ---- helpers ----

    private static StudentCoursePlanResult SamplePlan() => new(
        StudentId: "s1", GradeLevel: 12,
        Enrollments:
        [
            new CoursePlanEnrollment("g1", "c1", "M1", "Algebra", 4, "Math", 10, "Spring", "completed", IsGraded: true, Grade: "A"),
            new CoursePlanEnrollment("p1", "c1", "M1", "Algebra", 3, "Math", 12, "Fall", "planned", IsGraded: false, Grade: null),
        ],
        TotalCreditsEarned: 4, TotalCreditsRequired: 20, IsOnTrack: false);

    private static CourseChangeRequestRow SampleChangeRow() => new(
        "r1", "s1", School, "c1", "M1", "Algebra", "3.5", 11, "Fall", "add", null, null, "pending", null, null, null,
        true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(
        HttpClient client, string path,
        string permission = FormMapsPermissions.SchoolManage, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
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
                services.RemoveAll<ISchoolStudentsCoursePlanReader>();
                services.AddSingleton<ISchoolStudentsCoursePlanReader>(reader);
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

    private sealed class FakeReader : ISchoolStudentsCoursePlanReader
    {
        public bool StudentInSchool { get; init; }
        public StudentCoursePlanResult? Plan { get; init; }
        public ChangeRequestsResult ChangeRequests { get; init; } = new([], 0);
        public string? Deadline { get; init; }

        public bool IsStudentInSchoolCalled { get; private set; }
        public string? LastStatus { get; private set; }

        public Task<bool> IsStudentInCallerSchoolAsync(
            RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
        {
            IsStudentInSchoolCalled = true;
            return Task.FromResult(StudentInSchool);
        }

        public Task<StudentCoursePlanResult?> GetStudentCoursePlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Plan);

        public Task<ChangeRequestsResult> GetStudentChangeRequestsAsync(
            RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default)
        {
            LastStatus = status;
            return Task.FromResult(ChangeRequests);
        }

        public Task<string?> GetCourseRequestDeadlineAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Deadline);
    }
}
