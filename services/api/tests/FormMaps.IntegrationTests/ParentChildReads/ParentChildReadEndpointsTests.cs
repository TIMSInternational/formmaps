using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.ParentChildReads;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.ParentChildReads;

/// <summary>
/// Guard + outcome→status mapping + JSON shape for the parent child-link reads (FM-DOTNET-079; reader faked). Pins:
/// anonymous → 401; progress NotLinked → 403 "Not linked to this student", StudentNotFound → 404 "Student not found",
/// Ok → nested {student, gpa, isOnTrack, creditProgress, assessments} shape; course-plan !Linked → 404 "Student not
/// found", Ok → {target, approvedPlan, currentCourses} (target/plan null-collapse).
/// </summary>
public class ParentChildReadEndpointsTests
{
    private const string Progress = "/api/v1/parent/children/s1/progress";
    private const string CoursePlan = "/api/v1/parent/children/s1/course-plan";

    [Theory]
    [InlineData(Progress)]
    [InlineData(CoursePlan)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(HttpMethod.Get, path))).StatusCode);
    }

    [Fact]
    public async Task Progress_not_linked_is_403()
    {
        var reader = new FakeReader { Progress = new ChildProgressResult(ChildProgressOutcome.NotLinked, null) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Get(client, Progress);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not linked to this student", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Progress_student_missing_is_404()
    {
        var reader = new FakeReader { Progress = new ChildProgressResult(ChildProgressOutcome.StudentNotFound, null) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Get(client, Progress);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Progress_ok_shape()
    {
        var data = new ChildProgress(
            new ChildStudentInfo("s1", "Kid", 10), 3.42, true,
            new ChildCreditProgress(18.5, 24, 77),
            new ChildAssessments(true, 3, 5, 82, 2, 1));
        var reader = new FakeReader { Progress = new ChildProgressResult(ChildProgressOutcome.Ok, data) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Get(client, Progress);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var d = doc.RootElement.GetProperty("data");
        Assert.Equal("Kid", d.GetProperty("student").GetProperty("name").GetString());
        Assert.Equal(10, d.GetProperty("student").GetProperty("gradeLevel").GetInt32());
        Assert.Equal(3.42, d.GetProperty("gpa").GetDouble());
        Assert.True(d.GetProperty("isOnTrack").GetBoolean());
        Assert.Equal(77, d.GetProperty("creditProgress").GetProperty("percentage").GetInt32());
        Assert.Equal(24, d.GetProperty("creditProgress").GetProperty("required").GetDouble());
        var a = d.GetProperty("assessments");
        Assert.True(a.GetProperty("pca").GetProperty("completed").GetBoolean());
        Assert.Equal(3, a.GetProperty("mil").GetProperty("completed").GetInt32());
        Assert.Equal(5, a.GetProperty("mil").GetProperty("total").GetInt32());
        Assert.Equal(82, a.GetProperty("mil").GetProperty("averageScore").GetInt32());
        Assert.Equal(2, a.GetProperty("evaluation360").GetProperty("total").GetInt32());
        Assert.Equal(1, a.GetProperty("evaluation360").GetProperty("completed").GetInt32());
    }

    [Fact]
    public async Task Progress_null_gpa_serializes_null()
    {
        var data = new ChildProgress(
            new ChildStudentInfo("s1", "Kid", null), null, true,
            new ChildCreditProgress(0, 120, 0), new ChildAssessments(false, 0, 5, 0, 0, 0));
        var reader = new FakeReader { Progress = new ChildProgressResult(ChildProgressOutcome.Ok, data) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        using var doc = JsonDocument.Parse(await (await Get(client, Progress)).Content.ReadAsStringAsync());
        var d = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, d.GetProperty("gpa").ValueKind);
        Assert.Equal(JsonValueKind.Null, d.GetProperty("student").GetProperty("gradeLevel").ValueKind);
    }

    [Fact]
    public async Task CoursePlan_not_linked_is_404()
    {
        var reader = new FakeReader { CoursePlan = new ChildCoursePlanResult(false, null) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        var response = await Get(client, CoursePlan);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task CoursePlan_ok_shape_with_null_collapse()
    {
        var data = new ChildCoursePlan(
            Target: null,
            ApprovedPlan: new ChildApprovedPlan("2026-05-01T00:00:00.000Z",
                [new ChildPlanItem("MATH101", "Calculus", 1.0, 11, "Fall")]),
            CurrentCourses: [new ChildCurrentCourse("c1", "Spring", "planned")]);
        var reader = new FakeReader { CoursePlan = new ChildCoursePlanResult(true, data) };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();
        using var doc = JsonDocument.Parse(await (await Get(client, CoursePlan)).Content.ReadAsStringAsync());
        var d = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, d.GetProperty("target").ValueKind);
        var plan = d.GetProperty("approvedPlan");
        Assert.Equal("2026-05-01T00:00:00.000Z", plan.GetProperty("approvedAt").GetString());
        var item = plan.GetProperty("items")[0];
        Assert.Equal("MATH101", item.GetProperty("courseCode").GetString());
        Assert.Equal(1.0, item.GetProperty("credits").GetDouble());
        Assert.Equal(11, item.GetProperty("gradeLevel").GetInt32());
        var course = d.GetProperty("currentCourses")[0];
        Assert.Equal("c1", course.GetProperty("courseId").GetString());
        Assert.Equal("planned", course.GetProperty("status").GetString());
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Get(HttpClient client, string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "parent-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "parent");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "p@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Parent");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IParentChildReader>();
                services.AddSingleton<IParentChildReader>(reader);
            });
        }
    }

    private sealed class FakeReader : IParentChildReader
    {
        public ChildProgressResult Progress { get; init; } =
            new(ChildProgressOutcome.Ok, new ChildProgress(
                new ChildStudentInfo("s1", "Kid", 10), null, true,
                new ChildCreditProgress(0, 120, 0), new ChildAssessments(false, 0, 5, 0, 0, 0)));

        public ChildCoursePlanResult CoursePlan { get; init; } = new(true, new ChildCoursePlan(null, null, []));

        public Task<ChildProgressResult> GetProgressAsync(RequestContext context, string parentUserId, string studentId, CancellationToken ct = default) =>
            Task.FromResult(Progress);

        public Task<ChildCoursePlanResult> GetCoursePlanAsync(RequestContext context, string parentUserId, string studentId, CancellationToken ct = default) =>
            Task.FromResult(CoursePlan);
    }
}
