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

public class UserReportEndpointsTests
{
    private const string CallerUserId = "user-123";

    [Fact]
    public async Task UserReport_denies_anonymous_requests()
    {
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new UserReportApiFactory(reader, guard);
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/reports/user-report/{CallerUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, guard.CallCount);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task UserReport_returns_report_for_self_access()
    {
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new UserReportApiFactory(reader, guard);
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
        var student = data.GetProperty("student");
        Assert.Equal("student-1", student.GetProperty("id").GetString());
        Assert.Equal("Ada Student", student.GetProperty("name").GetString());
        Assert.Equal("ada@example.test", student.GetProperty("email").GetString());
        Assert.Equal(11, student.GetProperty("gradeLevel").GetInt32());

        var academic = data.GetProperty("academic");
        Assert.Equal(3.42, academic.GetProperty("gpa").GetDouble());
        Assert.Equal(24, academic.GetProperty("creditsEarned").GetDouble());
        Assert.Equal(8, academic.GetProperty("totalGrades").GetInt32());

        var assessments = data.GetProperty("assessments");
        var pca = assessments.GetProperty("pca");
        Assert.True(pca.GetProperty("completed").GetBoolean());
        Assert.Equal(2, pca.GetProperty("count").GetInt32());

        var mil = assessments.GetProperty("mil");
        Assert.Equal(3, mil.GetProperty("completedExams").GetInt32());
        Assert.Equal(5, mil.GetProperty("totalExams").GetInt32());
        Assert.Equal(82.5, mil.GetProperty("averageScore").GetDouble());

        var evaluation360 = assessments.GetProperty("evaluation360");
        Assert.Equal(4, evaluation360.GetProperty("total").GetInt32());
        Assert.Equal(2, evaluation360.GetProperty("completed").GetInt32());

        var courses = data.GetProperty("courses");
        Assert.Equal(5, courses.GetProperty("enrolled").GetInt32());
        Assert.Equal(3, courses.GetProperty("completed").GetInt32());
    }

    [Fact]
    public async Task UserReport_allows_school_less_privileged_caller_reading_own_id()
    {
        // Legacy /user-report mounts only `authenticate` (no school-membership requirement),
        // so a school-scoped role (counselor) with a blank schoolId reading their OWN id
        // must still succeed — the identity-only guard must not 403 on missing school context.
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new UserReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: CallerUserId,
            role: FormMapsRoles.Counselor,
            schoolId: null);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(1, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(document.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task UserReport_returns_not_found_when_non_privileged_reads_other_user()
    {
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new UserReportApiFactory(reader, guard);
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
    public async Task UserReport_returns_report_for_privileged_caller_when_access_granted()
    {
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new UserReportApiFactory(reader, guard);
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
    public async Task UserReport_returns_not_found_when_privileged_access_denied()
    {
        var reader = new FakeUserReportReader();
        var guard = new FakeUserAccessGuard(allow: false);
        using var factory = new UserReportApiFactory(reader, guard);
        using var client = factory.CreateClient();
        using var request = BuildAuthenticatedRequest(
            targetUserId: "other-user",
            role: FormMapsRoles.SchoolAdmin,
            schoolId: "school-123");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(1, guard.CallCount);
        Assert.Equal(0, reader.CallCount);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(document.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", document.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task UserReport_returns_not_found_when_target_user_missing()
    {
        var reader = new FakeUserReportReader { ReturnNull = true };
        var guard = new FakeUserAccessGuard(allow: true);
        using var factory = new UserReportApiFactory(reader, guard);
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
        var request = new HttpRequestMessage(HttpMethod.Get, $"/api/v1/reports/user-report/{targetUserId}");
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

    private sealed class UserReportApiFactory(
        FakeUserReportReader reader,
        FakeUserAccessGuard guard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IUserReportReader>();
                services.AddSingleton<IUserReportReader>(reader);
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

    private sealed class FakeUserReportReader : IUserReportReader
    {
        public int CallCount { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastTargetUserId { get; private set; }

        public bool ReturnNull { get; init; }

        public Task<UserReport?> ReadAsync(
            RequestContext requestContext,
            string targetUserId,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastContext = requestContext;
            LastTargetUserId = targetUserId;

            if (ReturnNull)
            {
                return Task.FromResult<UserReport?>(null);
            }

            var report = new UserReport(
                Student: new UserReportStudent(
                    Id: "student-1",
                    Name: "Ada Student",
                    Email: "ada@example.test",
                    GradeLevel: 11,
                    JoinedAt: new DateTimeOffset(2025, 9, 1, 0, 0, 0, TimeSpan.Zero)),
                Academic: new UserReportAcademic(
                    Gpa: 3.42,
                    CreditsEarned: 24,
                    TotalGrades: 8),
                Assessments: new UserReportAssessments(
                    Pca: new UserReportPca(Completed: true, Count: 2),
                    Mil: new UserReportMil(CompletedExams: 3, TotalExams: 5, AverageScore: 82.5),
                    Evaluation360: new UserReportEvaluation360(Total: 4, Completed: 2)),
                Courses: new UserReportCourses(Enrolled: 5, Completed: 3),
                GeneratedAt: new DateTimeOffset(2026, 7, 15, 12, 0, 0, TimeSpan.Zero));

            return Task.FromResult<UserReport?>(report);
        }
    }
}
