using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolCourses;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolCourses;

/// <summary>
/// Guard chain + HTTP status/body mapping for the two school-courses routes (reader/writer + scope faked; DB behavior
/// is proven by the reader/writer tests). Pins: anon → 401 both; GET needs courses:read / POST needs courses:write
/// (neither substitutes → 403); no-school → 400 "No school" (NOT 200-empty); the 500-cap + NaN/0-default pagination;
/// gradeLevel truthy-only (0 skipped); includeFramework default-on / only "false" disables; the concatenated
/// data.data (schoolCourse rows + framework rows with prerequisites:[] + isFrameworkCourse:true); POST 201 {id,code}
/// and the duplicate → 409 "Course code already exists".
/// </summary>
public class SchoolCoursesEndpointsTests
{
    private const string CoursesPath = "/api/v1/school-admin/courses";
    private const string School = "school-1";

    // ---- guard chain ----

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    public async Task Anonymous_is_401(string method)
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Anon(new HttpMethod(method), CoursesPath, "{}"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Get_requires_courses_read_not_courses_write()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Get, CoursesPath, permission: FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("missing_permission", await CodeAsync(response));
    }

    [Fact]
    public async Task Post_requires_courses_write_not_courses_read()
    {
        var writer = new FakeWriter();
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Post, CoursesPath, """{"code":"C1","name":"One"}""", FormMapsPermissions.CoursesRead));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(writer.Called);
    }

    // ---- GET no-school + pagination + filters ----

    [Fact]
    public async Task Get_no_school_is_400_no_school()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Get, CoursesPath, permission: FormMapsPermissions.CoursesRead));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Theory]
    [InlineData("", 1, 20)]
    [InlineData("?limit=1000", 1, 500)]   // 500 CAP (not 50/100)
    [InlineData("?limit=0", 1, 20)]       // 0 falsy → default 20
    [InlineData("?limit=-3", 1, 1)]       // clamped up to 1
    [InlineData("?limit=abc", 1, 20)]     // NaN → default 20
    [InlineData("?page=0", 1, 20)]        // page 0 → 1
    [InlineData("?page=3&limit=50", 3, 50)]
    public async Task Get_pagination_is_clamped_with_500_cap(string query, int expPage, int expLimit)
    {
        var reader = new FakeReader();
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        await client.SendAsync(Auth(HttpMethod.Get, CoursesPath + query, permission: FormMapsPermissions.CoursesRead));
        Assert.Equal(expPage, reader.LastQuery!.Page);
        Assert.Equal(expLimit, reader.LastQuery.Limit);
    }

    [Theory]
    [InlineData("?gradeLevel=11", 11)]
    [InlineData("?gradeLevel=0", null)]     // 0 is falsy → skipped (JS `if (gradeLevel)`)
    [InlineData("?gradeLevel=abc", null)]   // NaN → skipped
    [InlineData("", null)]                  // absent → null
    public async Task Get_gradeLevel_is_truthy_only(string query, int? expGrade)
    {
        var reader = new FakeReader();
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        await client.SendAsync(Auth(HttpMethod.Get, CoursesPath + query, permission: FormMapsPermissions.CoursesRead));
        Assert.Equal(expGrade, reader.LastQuery!.GradeLevel);
    }

    [Theory]
    [InlineData("", true)]
    [InlineData("?includeFramework=true", true)]
    [InlineData("?includeFramework=anything", true)]  // only the literal "false" disables
    [InlineData("?includeFramework=false", false)]
    public async Task Get_includeFramework_only_false_disables(string query, bool expected)
    {
        var reader = new FakeReader();
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        await client.SendAsync(Auth(HttpMethod.Get, CoursesPath + query, permission: FormMapsPermissions.CoursesRead));
        Assert.Equal(expected, reader.LastQuery!.IncludeFramework);
    }

    [Theory]
    [InlineData("?search=&department=", null, null)]
    [InlineData("?search=bio&department=science", "bio", "science")]
    public async Task Get_empty_string_filters_collapse_to_null(string query, string? expSearch, string? expDept)
    {
        var reader = new FakeReader();
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));
        await client.SendAsync(Auth(HttpMethod.Get, CoursesPath + query, permission: FormMapsPermissions.CoursesRead));
        Assert.Equal(expSearch, reader.LastQuery!.Search);
        Assert.Equal(expDept, reader.LastQuery.Department);
    }

    // ---- GET happy path: concatenated data + shapes ----

    [Fact]
    public async Task Get_returns_school_rows_then_framework_rows_with_correct_shapes()
    {
        var reader = new FakeReader
        {
            Result = new CoursesListResult(
                SchoolCourses:
                [
                    new SchoolCourseRow("c1", School, "MATH101", "Algebra", "Mathematics", "3.5",
                        [9, 10], ["PRE1"], ["CO1"], "AP", "fw-x", "desc", 30, true, "active", true,
                        null, "2026-01-02T03:04:05.006Z", null, "2026-01-02T03:04:05.006Z", 7),
                ],
                FrameworkCourses:
                [
                    new FrameworkCourseRow("fc1", "AP-CALC", "AP Calculus", "Math", "1", [11, 12], "AP"),
                ],
                Total: 2, Page: 1, Limit: 20, TotalPages: 1),
        };
        using var client = Client(reader, new FakeWriter(), new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Get, CoursesPath, permission: FormMapsPermissions.CoursesRead));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(2, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("page").GetInt32());
        Assert.Equal(20, data.GetProperty("limit").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32());

        var array = data.GetProperty("data");
        Assert.Equal(2, array.GetArrayLength());

        // [0] = full school course row + enrollmentCount, NO isFrameworkCourse.
        var school = array[0];
        Assert.Equal("MATH101", school.GetProperty("code").GetString());
        Assert.Equal("3.5", school.GetProperty("credits").GetString());   // credits is a JSON string (raw Decimal)
        Assert.Equal(7, school.GetProperty("enrollmentCount").GetInt32());
        Assert.Equal(new[] { 9, 10 }, school.GetProperty("gradeLevels").EnumerateArray().Select(e => e.GetInt32()));
        Assert.Equal("2026-01-02T03:04:05.006Z", school.GetProperty("createdDate").GetString());
        Assert.False(school.TryGetProperty("isFrameworkCourse", out _));

        // [1] = framework subset: prerequisites ALWAYS [], isFrameworkCourse:true, NO enrollmentCount.
        var fw = array[1];
        Assert.Equal("AP-CALC", fw.GetProperty("code").GetString());
        Assert.True(fw.GetProperty("isFrameworkCourse").GetBoolean());
        Assert.Empty(fw.GetProperty("prerequisites").EnumerateArray());
        Assert.Equal("AP", fw.GetProperty("frameworkType").GetString());
        Assert.False(fw.TryGetProperty("enrollmentCount", out _));
    }

    // ---- POST ----

    [Fact]
    public async Task Post_no_school_is_400_no_school()
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(HttpMethod.Post, CoursesPath, """{"code":"C1","name":"One"}""", FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Fact]
    public async Task Post_success_is_201_with_id_and_code()
    {
        var writer = new FakeWriter { Result = new CreateCourseResult("new-id", "MATH301", false) };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Post, CoursesPath, """{"code":"MATH301","name":"Calc"}""", FormMapsPermissions.CoursesWrite));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("new-id", data.GetProperty("id").GetString());
        Assert.Equal("MATH301", data.GetProperty("code").GetString());
        Assert.Equal(2, data.EnumerateObject().Count()); // ONLY id + code
        Assert.True(writer.Called);
    }

    [Fact]
    public async Task Post_duplicate_is_409_with_exact_message()
    {
        var writer = new FakeWriter { Result = new CreateCourseResult(null, null, true) };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));

        var response = await client.SendAsync(Auth(HttpMethod.Post, CoursesPath, """{"code":"DUP","name":"X"}""", FormMapsPermissions.CoursesWrite));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Course code already exists", await MessageAsync(response));
    }

    // ---- PUT/DELETE /courses/{courseId} (FM-DOTNET-061) ----

    private const string CoursePath = CoursesPath + "/course-1";

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Course_write_anonymous_is_401(string method)
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(School));
        var response = await client.SendAsync(Anon(new HttpMethod(method), CoursePath, method == "PUT" ? "{}" : null));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Course_write_requires_courses_write_not_courses_read(string method)
    {
        var writer = new FakeWriter();
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(new HttpMethod(method), CoursePath, method == "PUT" ? "{}" : null, FormMapsPermissions.CoursesRead));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("missing_permission", await CodeAsync(response));
        Assert.False(writer.UpdateCalled);
        Assert.False(writer.DeleteCalled);
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Course_write_no_school_is_400_no_school(string method)
    {
        using var client = Client(new FakeReader(), new FakeWriter(), new FakeScope(null));
        var response = await client.SendAsync(Auth(new HttpMethod(method), CoursePath, method == "PUT" ? "{}" : null, FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("No school", await MessageAsync(response));
    }

    [Fact]
    public async Task Put_course_not_owned_is_403_course_not_in_your_school()
    {
        // The writer's null outcome (missing OR wrong-school) → uniform 403 (NOT 404 — the course-vs-mapping asymmetry).
        var writer = new FakeWriter { UpdateResult = null };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Put, CoursePath, """{"name":"X"}""", FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Course not in your school", await MessageAsync(response));
        Assert.Equal("course-1", writer.LastCourseId);
    }

    [Fact]
    public async Task Delete_course_not_owned_is_403_course_not_in_your_school()
    {
        var writer = new FakeWriter { DeleteResult = false };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Delete, CoursePath, permission: FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Course not in your school", await MessageAsync(response));
    }

    [Fact]
    public async Task Put_course_success_is_200_with_id()
    {
        var writer = new FakeWriter { UpdateResult = "course-1" };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Put, CoursePath, """{"name":"X"}""", FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("course-1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.True(writer.UpdateCalled);
    }

    [Fact]
    public async Task Delete_course_success_is_200_success_true()
    {
        var writer = new FakeWriter { DeleteResult = true };
        using var client = Client(new FakeReader(), writer, new FakeScope(School));
        var response = await client.SendAsync(Auth(HttpMethod.Delete, CoursePath, permission: FormMapsPermissions.CoursesWrite));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _)); // delete → { success:true } only
        Assert.True(writer.DeleteCalled);
    }

    // ---- helpers ----

    private static HttpClient Client(FakeReader reader, FakeWriter writer, FakeScope scope) =>
        new Factory(reader, writer, scope).CreateClient();

    private static HttpRequestMessage Auth(HttpMethod method, string path, string? body = null, string permission = FormMapsPermissions.CoursesRead)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return request;
    }

    private static HttpRequestMessage Anon(HttpMethod method, string path, string? body)
    {
        var request = new HttpRequestMessage(method, path);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return request;
    }

    private static async Task<string?> MessageAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private static async Task<string?> CodeAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("code").GetString();
    }

    private sealed class Factory(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolCoursesReader>();
                services.AddSingleton<ISchoolCoursesReader>(reader);
                services.RemoveAll<ISchoolCoursesWriter>();
                services.AddSingleton<ISchoolCoursesWriter>(writer);
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

    private sealed class FakeReader : ISchoolCoursesReader
    {
        public CoursesListResult Result { get; init; } = new([], [], 0, 1, 20, 0);
        public SchoolCoursesQuery? LastQuery { get; private set; }

        public Task<CoursesListResult> ListCoursesAsync(
            RequestContext context, string schoolId, SchoolCoursesQuery query, CancellationToken cancellationToken = default)
        {
            LastQuery = query;
            return Task.FromResult(Result);
        }
    }

    private sealed class FakeWriter : ISchoolCoursesWriter
    {
        public CreateCourseResult Result { get; init; } = new("id-x", "C1", false);
        public bool Called { get; private set; }

        // updateCourse / deleteCourse outcomes: null / false = the not-owned outcome (endpoint → 403).
        public string? UpdateResult { get; init; } = "course-1";
        public bool DeleteResult { get; init; } = true;
        public string? LastCourseId { get; private set; }
        public bool UpdateCalled { get; private set; }
        public bool DeleteCalled { get; private set; }

        public Task<CreateCourseResult> CreateCourseAsync(
            RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default)
        {
            Called = true;
            return Task.FromResult(Result);
        }

        public Task<string?> UpdateCourseAsync(
            RequestContext context, string schoolId, string courseId, JsonElement body,
            CancellationToken cancellationToken = default)
        {
            UpdateCalled = true;
            LastCourseId = courseId;
            return Task.FromResult(UpdateResult);
        }

        public Task<bool> DeleteCourseAsync(
            RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default)
        {
            DeleteCalled = true;
            LastCourseId = courseId;
            return Task.FromResult(DeleteResult);
        }
    }
}
