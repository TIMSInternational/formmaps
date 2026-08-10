using System.Net;
using System.Text;
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
/// Guard chain + validation + HTTP mapping for the formmaps#107 course-plan writes (reader/writer/scope faked).
/// THE pin is <c>Post_cross_school_empty_body_is_404_not_400</c>: legacy runs studentInCallerSchool BEFORE the
/// courseId body check, so a cross-school caller POSTing <c>{}</c> must get 404 "Not found" — a 400 would leak that
/// the caller's body was even looked at. Also pins 401/403 with the writer never called, the two 400 writer
/// outcomes, term precedence (semester → term → null), the raw 201 row, and the studentId-bound delete mapping.
/// </summary>
public class SchoolStudentsCoursePlanWriteEndpointsTests
{
    private const string CoursesPath = "/api/v1/school-admin/students/s1/course-plan/courses";
    private const string CoursePath = "/api/v1/school-admin/students/s1/course-plan/courses/p1";
    private const string School = "school-1";

    // ---- POST guards ----

    [Fact]
    public async Task Post_anonymous_is_401_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var request = new HttpRequestMessage(HttpMethod.Post, CoursesPath) { Content = Json("""{"courseId":"c1"}""") };
        var response = await c.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(writer.CreateCalled);
    }

    [Fact]
    public async Task Post_missing_school_manage_is_403_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1"}""", permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(writer.CreateCalled);
    }

    /// <summary>THE ordering pin: the 404 gate runs BEFORE the body check.</summary>
    [Fact]
    public async Task Post_cross_school_empty_body_is_404_not_400()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = false }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, "{}"); // NO courseId — the 400 must NOT win

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
        Assert.False(writer.CreateCalled);
    }

    [Fact]
    public async Task Post_caller_without_a_school_is_404()
    {
        var writer = new FakeWriter();
        var reader = new FakeReader { StudentInSchool = true };
        using var f = new Factory(reader, writer, new FakeScope(null)); // non-Super-Admin, no school → false
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1"}""");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(reader.IsStudentInSchoolCalled); // short-circuits before the DB half
        Assert.False(writer.CreateCalled);
    }

    [Fact]
    public async Task Post_super_admin_bypasses_the_student_gate()
    {
        var reader = new FakeReader { StudentInSchool = false };
        var writer = new FakeWriter { Result = Created() };
        using var f = new Factory(reader, writer, new FakeScope(null));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1"}""", role: FormMapsRoles.SuperAdmin);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.False(reader.IsStudentInSchoolCalled); // bypassed
    }

    // ---- POST body validation ----

    [Theory]
    [InlineData("{}")]                          // absent
    [InlineData("""{"courseId":null}""")]       // JS-falsy
    [InlineData("""{"courseId":""}""")]         // JS-falsy
    [InlineData("""{"courseId":0}""")]          // JS-falsy
    [InlineData("""{"courseId":false}""")]      // JS-falsy
    [InlineData("")]                            // empty body → express {} → absent
    public async Task Post_falsy_courseId_is_400_and_writer_not_called(string body)
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("courseId required", doc.RootElement.GetProperty("message").GetString());
        Assert.False(writer.CreateCalled);
    }

    [Fact]
    public async Task Post_malformed_json_is_500_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.False(writer.CreateCalled);
    }

    // ---- POST term precedence ----

    [Theory]
    [InlineData("""{"courseId":"c1","semester":"Spring","term":"Fall"}""", "Spring")] // semester wins
    [InlineData("""{"courseId":"c1","semester":"","term":"Fall"}""", "Fall")]          // falsy semester → term
    [InlineData("""{"courseId":"c1","term":"Fall"}""", "Fall")]                        // no semester → term
    [InlineData("""{"courseId":"c1"}""", null)]                                        // neither → null
    public async Task Post_term_is_semester_then_term(string body, string? expected)
    {
        var writer = new FakeWriter { Result = Created() };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(expected, writer.LastTerm);
    }

    // ---- POST gradeLevel (#122) ----
    //
    // The planned grade was DROPPED by both backends, so a course added to "Grade 9 Fall" rendered
    // under the student's own grade. These mirror Node's lib/coursePlanGrade.ts rules exactly — the
    // two implementations disagreeing is the same class of bug, just deferred to the flag flip.

    [Theory]
    [InlineData("""{"courseId":"c1","gradeLevel":9}""", 9)]        // number
    [InlineData("""{"courseId":"c1","gradeLevel":"9"}""", 9)]      // numeric string — a <select> may send either
    [InlineData("""{"courseId":"c1","gradeLevel":1}""", 1)]        // range is 1-12, not 9-12: K-8 schools exist
    [InlineData("""{"courseId":"c1","gradeLevel":12}""", 12)]
    [InlineData("""{"courseId":"c1"}""", null)]                    // ABSENT is legal and means "unknown"
    [InlineData("""{"courseId":"c1","gradeLevel":null}""", null)]
    [InlineData("""{"courseId":"c1","gradeLevel":""}""", null)]    // empty input, not invalid input
    public async Task Post_forwards_the_planned_gradeLevel(string body, int? expected)
    {
        var writer = new FakeWriter { Result = Created() };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        // Asserts the endpoint FORWARDED it. Without this the writer could drop the column again and
        // every other assertion here would still pass — which is how the original bug survived.
        Assert.Equal(expected, writer.LastGradeLevel);
    }

    [Theory]
    [InlineData("""{"courseId":"c1","gradeLevel":0}""")]           // below range
    [InlineData("""{"courseId":"c1","gradeLevel":13}""")]          // above range
    [InlineData("""{"courseId":"c1","gradeLevel":-1}""")]
    [InlineData("""{"courseId":"c1","gradeLevel":9.5}""")]         // not a whole number
    [InlineData("""{"courseId":"c1","gradeLevel":"nine"}""")]      // not numeric
    [InlineData("""{"courseId":"c1","gradeLevel":true}""")]
    [InlineData("""{"courseId":"c1","gradeLevel":{}}""")]
    public async Task Post_rejects_a_sent_but_nonsense_gradeLevel(string body)
    {
        var writer = new FakeWriter { Result = Created() };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, body);

        // Refused LOUDLY rather than coerced into a plausible grade — silent coercion is what kept
        // this invisible. And nothing is written.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(writer.CreateCalled);
    }

    // ---- POST writer outcomes ----

    [Fact]
    public async Task Post_no_student_school_is_400()
    {
        var writer = new FakeWriter { Result = new CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus.NoStudentSchool, null) };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student has no school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_no_current_academic_year_is_400()
    {
        var writer = new FakeWriter { Result = new CoursePlanCourseCreateResult(CoursePlanCourseCreateStatus.NoCurrentAcademicYear, null) };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1"}""");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No current academic year", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_happy_is_201_with_the_raw_row_and_no_course_join()
    {
        var writer = new FakeWriter { Result = Created() };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Post(c, CoursesPath, """{"courseId":"c1","semester":"Fall"}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("p1", data.GetProperty("id").GetString());
        Assert.Equal("s1", data.GetProperty("studentId").GetString());
        Assert.Equal(School, data.GetProperty("schoolId").GetString());
        Assert.Equal("ay1", data.GetProperty("academicYearId").GetString());
        Assert.Equal("Fall", data.GetProperty("term").GetString());
        // #122 — the planned grade, null here because this fixture row carries none. Its POSITION is
        // part of the contract: Prisma emits schema-declaration order, so legacy returns it between
        // `term` and `courseId`, and a parity consumer reading positionally would break otherwise.
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gradeLevel").ValueKind);
        Assert.Equal(
            new[] { "term", "gradeLevel", "courseId" },
            data.EnumerateObject().Select(x => x.Name).SkipWhile(n => n != "term").Take(3).ToArray());
        Assert.Equal("c1", data.GetProperty("courseId").GetString());
        Assert.Equal("planned", data.GetProperty("status").GetString());
        Assert.Equal(0, data.GetProperty("sortOrder").GetInt32());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("notes").ValueKind);
        Assert.True(data.GetProperty("isActive").GetBoolean());
        Assert.Equal("admin-1", data.GetProperty("createdBy").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("updatedBy").ValueKind);
        // exactly the 14 model columns — no courseCode/courseName/credits enrichment
        Assert.Equal(15, data.EnumerateObject().Count()); // 14 + gradeLevel (#122)
        Assert.Equal("admin-1", writer.LastCreatedBy);
        Assert.Equal("c1", writer.LastCourseId);
    }

    // ---- DELETE ----

    [Fact]
    public async Task Delete_anonymous_is_401_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await c.SendAsync(new HttpRequestMessage(HttpMethod.Delete, CoursePath));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(writer.DeleteCalled);
    }

    [Fact]
    public async Task Delete_missing_school_manage_is_403_and_writer_not_called()
    {
        var writer = new FakeWriter();
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Delete(c, CoursePath, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(writer.DeleteCalled);
    }

    [Fact]
    public async Task Delete_cross_school_is_404_and_writer_not_called()
    {
        var writer = new FakeWriter { Deleted = true };
        using var f = new Factory(new FakeReader { StudentInSchool = false }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Delete(c, CoursePath);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
        Assert.False(writer.DeleteCalled); // the gate wins — no delete attempted at all
    }

    [Fact]
    public async Task Delete_zero_rows_is_404()
    {
        var writer = new FakeWriter { Deleted = false };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Delete(c, CoursePath);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_happy_is_200_success_only_and_forwards_both_ids()
    {
        var writer = new FakeWriter { Deleted = true };
        using var f = new Factory(new FakeReader { StudentInSchool = true }, writer, new FakeScope(School));
        using var c = f.CreateClient();

        var response = await Delete(c, CoursePath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Single(doc.RootElement.EnumerateObject()); // { success: true } and nothing else
        Assert.Equal("s1", writer.LastDeleteStudentId);   // the studentId lever guard is forwarded
        Assert.Equal("p1", writer.LastEnrollmentId);
    }

    // ---- helpers ----

    private static CoursePlanCourseCreateResult Created() => new(
        CoursePlanCourseCreateStatus.Created,
        new StudentCoursePlanRow(
            "p1", "s1", School, "ay1", "Fall", null, "c1", "planned", 0, null, true, "admin-1",
            "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z"));

    private static StringContent Json(string s) => new(s, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Post(
        HttpClient client, string path, string body,
        string permission = FormMapsPermissions.SchoolManage, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = Json(body) };
        AddHeaders(request, permission, role);
        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Delete(
        HttpClient client, string path,
        string permission = FormMapsPermissions.SchoolManage, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        AddHeaders(request, permission, role);
        return client.SendAsync(request);
    }

    private static void AddHeaders(HttpRequestMessage request, string permission, string role)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
    }

    private sealed class Factory(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolStudentsCoursePlanReader>();
                services.AddSingleton<ISchoolStudentsCoursePlanReader>(reader);
                services.RemoveAll<ISchoolStudentsCoursePlanWriter>();
                services.AddSingleton<ISchoolStudentsCoursePlanWriter>(writer);
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

        public bool IsStudentInSchoolCalled { get; private set; }

        public Task<bool> IsStudentInCallerSchoolAsync(
            RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
        {
            IsStudentInSchoolCalled = true;
            return Task.FromResult(StudentInSchool);
        }

        public Task<StudentCoursePlanResult?> GetStudentCoursePlanAsync(
            RequestContext context, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult<StudentCoursePlanResult?>(null);

        public Task<ChangeRequestsResult> GetStudentChangeRequestsAsync(
            RequestContext context, string studentId, string? status, CancellationToken cancellationToken = default) =>
            Task.FromResult(new ChangeRequestsResult([], 0));

        public Task<string?> GetCourseRequestDeadlineAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);
    }

    private sealed class FakeWriter : ISchoolStudentsCoursePlanWriter
    {
        public CoursePlanCourseCreateResult Result { get; init; } =
            new(CoursePlanCourseCreateStatus.NoStudentSchool, null);

        public bool Deleted { get; init; }

        public bool CreateCalled { get; private set; }
        public bool DeleteCalled { get; private set; }
        public string? LastCourseId { get; private set; }
        public string? LastTerm { get; private set; }
        public string? LastCreatedBy { get; private set; }
        public string? LastDeleteStudentId { get; private set; }
        public string? LastEnrollmentId { get; private set; }

        // #122 — captured so a test can assert the endpoint actually FORWARDED the parsed grade.
        // Without this the writer could silently drop it again and every existing assertion would
        // still pass, which is how the original bug survived.
        public int? LastGradeLevel { get; private set; }

        public Task<CoursePlanCourseCreateResult> CreateCoursePlanCourseAsync(
            RequestContext context, string studentId, string courseId, string? term, int? gradeLevel,
            string? createdBy, CancellationToken cancellationToken = default)
        {
            CreateCalled = true;
            LastCourseId = courseId;
            LastTerm = term;
            LastGradeLevel = gradeLevel;
            LastCreatedBy = createdBy;
            return Task.FromResult(Result);
        }

        public Task<bool> DeleteCoursePlanCourseAsync(
            RequestContext context, string studentId, string enrollmentId, CancellationToken cancellationToken = default)
        {
            DeleteCalled = true;
            LastDeleteStudentId = studentId;
            LastEnrollmentId = enrollmentId;
            return Task.FromResult(Deleted);
        }
    }
}
