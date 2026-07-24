using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentCoursePlan;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentCoursePlan;

/// <summary>
/// Guard + result mapping for the student course-planning CRUD (FM-DOTNET-084; repo faked). Pins: anonymous → 401;
/// GET happy { plan:{studentId,gradeLevel,enrollments,totalCreditsEarned}, recommendations:[] } vs the school-less
/// { plan:{enrollments:[]}, recommendations:[] } (no identity/credit keys); POST 201 / 400 NoSchool / 400
/// NoCurrentYear / 500 InvalidBody / 500 malformed-or-primitive; DELETE 400 NoSchool / 200.
/// </summary>
public class StudentCoursePlanEndpointsTests
{
    private const string PlanPath = "/api/v1/student/course-plan";
    private const string CoursesPath = "/api/v1/student/course-plan/courses";
    private const string CourseItemPath = "/api/v1/student/course-plan/courses/c1";

    [Theory]
    [InlineData(PlanPath, "GET")]
    [InlineData(CoursesPath, "POST")]
    [InlineData(CourseItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Get_happy_shape()
    {
        var repo = new FakeRepo
        {
            View = new CoursePlanView(true, 11, [SampleRow("p1")], 4.5)
        };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, PlanPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var plan = doc.RootElement.GetProperty("data").GetProperty("plan");
        Assert.Equal("student-1", plan.GetProperty("studentId").GetString());
        Assert.Equal(11, plan.GetProperty("gradeLevel").GetInt32());
        Assert.Equal(4.5, plan.GetProperty("totalCreditsEarned").GetDouble());
        Assert.Equal("p1", plan.GetProperty("enrollments")[0].GetProperty("id").GetString());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("recommendations").GetArrayLength());
    }

    [Fact]
    public async Task Get_no_school_minimal_shape()
    {
        var repo = new FakeRepo { View = new CoursePlanView(false, null, [], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, PlanPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var plan = doc.RootElement.GetProperty("data").GetProperty("plan");
        Assert.Equal(0, plan.GetProperty("enrollments").GetArrayLength());
        Assert.False(plan.TryGetProperty("studentId", out _));
        Assert.False(plan.TryGetProperty("gradeLevel", out _));
        Assert.False(plan.TryGetProperty("totalCreditsEarned", out _));
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("recommendations").GetArrayLength());
    }

    [Fact]
    public async Task Get_null_grade_level_is_emitted_null()
    {
        var repo = new FakeRepo { View = new CoursePlanView(true, null, [], 0) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, PlanPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var plan = doc.RootElement.GetProperty("data").GetProperty("plan");
        Assert.Equal(JsonValueKind.Null, plan.GetProperty("gradeLevel").ValueKind);
    }

    [Fact]
    public async Task Post_created_is_201_success_only()
    {
        var repo = new FakeRepo { Create = new CreateCoursePlanOutcome(CreateCoursePlanStatus.Created) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, CoursesPath, body: """{"courseId":"c1","semester":"Fall"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _));
    }

    [Fact]
    public async Task Post_no_school_is_400_message()
    {
        var repo = new FakeRepo { Create = new CreateCoursePlanOutcome(CreateCoursePlanStatus.NoSchool) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, CoursesPath, body: """{"courseId":"c1"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You are not affiliated with a school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_no_current_year_is_400_message()
    {
        var repo = new FakeRepo { Create = new CreateCoursePlanOutcome(CreateCoursePlanStatus.NoCurrentYear) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, CoursesPath, body: """{"courseId":"c1"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No current academic year", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_invalid_body_is_500()
    {
        var repo = new FakeRepo { Create = new CreateCoursePlanOutcome(CreateCoursePlanStatus.InvalidBody) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, CoursesPath, body: """{"courseId":123}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("{\"a\":")] // malformed
    [InlineData("5")]        // primitive
    public async Task Post_malformed_or_primitive_is_500(string body)
    {
        // FakeRepo would return Created, but the endpoint rejects the body before the repo call.
        using var factory = new Factory(new FakeRepo { Create = new CreateCoursePlanOutcome(CreateCoursePlanStatus.Created) });
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.InternalServerError, (await Send(client, HttpMethod.Post, CoursesPath, body: body)).StatusCode);
    }

    [Fact]
    public async Task Delete_no_school_is_400()
    {
        var repo = new FakeRepo { Delete = DeleteCoursePlanStatus.NoSchool };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, CourseItemPath);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("You are not affiliated with a school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_ok_is_200_success()
    {
        var repo = new FakeRepo { Delete = DeleteCoursePlanStatus.Deleted };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, CourseItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
    }

    // ---- helpers ----

    private static CoursePlanRow SampleRow(string id) => new(
        id, "student-1", "school-1", "ay-1", "Fall", "course-a", "planned", 0, null, true,
        null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "student-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IStudentCoursePlanRepository>();
                services.AddSingleton<IStudentCoursePlanRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IStudentCoursePlanRepository
    {
        public CoursePlanView View { get; init; } = new(true, null, [], 0);
        public CreateCoursePlanOutcome Create { get; init; } = new(CreateCoursePlanStatus.Created);
        public DeleteCoursePlanStatus Delete { get; init; } = DeleteCoursePlanStatus.Deleted;

        public Task<CoursePlanView> GetCoursePlanAsync(RequestContext context, string studentId, string? academicYearId, CancellationToken ct = default) =>
            Task.FromResult(View);

        public Task<CreateCoursePlanOutcome> CreateCourseAsync(RequestContext context, string studentId, JsonElement body, CancellationToken ct = default) =>
            Task.FromResult(Create);

        public Task<DeleteCoursePlanStatus> DeleteCourseAsync(RequestContext context, string studentId, string courseId, CancellationToken ct = default) =>
            Task.FromResult(Delete);
    }
}
