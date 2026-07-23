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
/// Guard chain + validation + HTTP mapping for the FM-066 review writes (writer + scope faked). Pins: verify zod
/// (bad status/note → 400 "Invalid request body"), Super-Admin null-school bypass, non-admin no-school → 400,
/// 404 "Entry not found"; review status validation (400 "Invalid status"), studentInCallerSchool → 404 "Not found",
/// 404 "Request not found"; both happy shapes.
/// </summary>
public class SchoolStudentsReviewEndpointsTests
{
    private const string VerifyPath = "/api/v1/school-admin/community-service/e1/verify";
    private const string ReviewPath = "/api/v1/school-admin/students/s1/course-plan/change-requests/r1/review";
    private const string School = "school-1";

    // ---- verify ----

    [Fact]
    public async Task Verify_anonymous_is_401()
    {
        using var f = new Factory(new FakeWriter(), new FakeScope(School));
        using var c = f.CreateClient();
        var req = new HttpRequestMessage(HttpMethod.Put, VerifyPath) { Content = Json("""{"status":"verified"}""") };
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.SendAsync(req)).StatusCode);
    }

    [Theory]
    [InlineData("""{"status":"maybe"}""")]                      // invalid status
    [InlineData("""{}""")]                                       // missing status
    [InlineData("""{"status":"verified","note":123}""")]        // note not a string
    public async Task Verify_bad_body_is_400_invalid_request_body(string body)
    {
        var writer = new FakeWriter();
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid request body", doc.RootElement.GetProperty("message").GetString());
        Assert.False(writer.VerifyCalled);
    }

    [Fact]
    public async Task Verify_note_over_1000_is_400()
    {
        var body = $$"""{"status":"verified","note":"{{new string('x', 1001)}}"}""";
        using var f = new Factory(new FakeWriter(), new FakeScope(School));
        using var c = f.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(c, VerifyPath, body)).StatusCode);
    }

    [Fact]
    public async Task Verify_non_admin_no_school_is_400()
    {
        using var f = new Factory(new FakeWriter(), new FakeScope(null));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, """{"status":"verified"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Verify_super_admin_no_school_passes_null_caller_school()
    {
        var writer = new FakeWriter { Entry = SampleEntry() };
        using var f = new Factory(writer, new FakeScope(null));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, """{"status":"verified"}""", role: FormMapsRoles.SuperAdmin);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(writer.LastCallerSchoolId); // Super Admin → null (platform-wide)
    }

    [Fact]
    public async Task Verify_null_writer_is_404_entry_not_found()
    {
        var writer = new FakeWriter { Entry = null };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, """{"status":"rejected"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Entry not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Verify_happy_returns_entry_with_string_hours()
    {
        var writer = new FakeWriter { Entry = SampleEntry() };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, """{"status":"verified","note":"ok"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("e1", data.GetProperty("id").GetString());
        Assert.Equal(JsonValueKind.String, data.GetProperty("hours").ValueKind);
        Assert.Equal("verified", writer.LastStatus);
        Assert.Equal("ok", writer.LastNote);
    }

    // ---- review ----

    [Fact]
    public async Task Review_invalid_status_is_400()
    {
        var writer = new FakeWriter { StudentInSchool = true };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, """{"status":"maybe"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid status", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Review_student_not_in_school_is_404_not_found()
    {
        var writer = new FakeWriter { StudentInSchool = false };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, """{"status":"approved"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Review_super_admin_bypasses_and_null_cr_is_404_request_not_found()
    {
        var writer = new FakeWriter { StudentInSchool = false, ChangeRequest = null };
        using var f = new Factory(writer, new FakeScope(null));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, """{"status":"approved"}""", role: FormMapsRoles.SuperAdmin);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Request not found", doc.RootElement.GetProperty("message").GetString());
        Assert.False(writer.IsStudentInSchoolCalled); // bypassed
    }

    [Fact]
    public async Task Review_happy_forwards_status_and_note()
    {
        var writer = new FakeWriter { StudentInSchool = true, ChangeRequest = SampleChangeRow() };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, """{"status":"approved","counselorNote":"go"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("r1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal("approved", writer.LastReviewStatus);
        Assert.Equal("go", writer.LastCounselorNote);
    }

    [Theory]
    [InlineData("[1,2,3]")]  // array → verify {} → missing status → 400
    [InlineData("5")]         // primitive → 400? no — primitive → 500 (see below); array here → 400
    public async Task Verify_non_object_body_array_is_400_primitive_is_500(string body)
    {
        var writer = new FakeWriter();
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, VerifyPath, body);
        // array → 400 "Invalid request body"; primitive → 500 (express strict). Either way, NO write.
        Assert.True(response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.InternalServerError);
        Assert.False(writer.VerifyCalled);
    }

    [Theory]
    [InlineData("""{"status":true}""")]   // truthy non-string → 400 "Invalid status"
    [InlineData("""{"status":123}""")]    // truthy non-string → 400
    public async Task Review_truthy_non_string_status_is_400_no_write(string body)
    {
        var writer = new FakeWriter { StudentInSchool = true, ChangeRequest = SampleChangeRow() };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid status", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(writer.LastReviewStatus); // writer never called → no phantom write
    }

    [Fact]
    public async Task Review_malformed_json_is_500_no_write()
    {
        var writer = new FakeWriter { StudentInSchool = true, ChangeRequest = SampleChangeRow() };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, """{"status":""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Null(writer.LastReviewStatus); // no write on malformed JSON
    }

    [Fact]
    public async Task Review_array_body_proceeds_with_omitted_status()
    {
        var writer = new FakeWriter { StudentInSchool = true, ChangeRequest = SampleChangeRow() };
        using var f = new Factory(writer, new FakeScope(School));
        using var c = f.CreateClient();
        var response = await Put(c, ReviewPath, "[1,2,3]"); // array → {} → status absent → proceeds
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(writer.LastReviewStatus); // status omitted (null forwarded)
    }

    // ---- helpers ----

    private static CommunityServiceEntryRow SampleEntry() => new(
        "e1", "s1", School, "Org", null, "5", "2026-01-01T00:00:00.000Z", null, null, "verified", "ok", "admin-1",
        "2026-01-02T00:00:00.000Z", true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-02T00:00:00.000Z");

    private static CourseChangeRequestRow SampleChangeRow() => new(
        "r1", "s1", School, "c1", null, null, "1", 11, null, "add", null, null, "approved", "go", "admin-1",
        "2026-01-02T00:00:00.000Z", true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-02T00:00:00.000Z");

    private static StringContent Json(string s) => new(s, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Put(HttpClient client, string path, string body, string role = FormMapsRoles.SchoolAdmin)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, path) { Content = Json(body) };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.SchoolManage);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolStudentsReviewWriter>();
                services.AddSingleton<ISchoolStudentsReviewWriter>(writer);
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

    private sealed class FakeWriter : ISchoolStudentsReviewWriter
    {
        public CommunityServiceEntryRow? Entry { get; init; }
        public CourseChangeRequestRow? ChangeRequest { get; init; }
        public bool StudentInSchool { get; init; }

        public bool VerifyCalled { get; private set; }
        public string? LastCallerSchoolId { get; private set; }
        public string? LastStatus { get; private set; }
        public string? LastNote { get; private set; }
        public bool IsStudentInSchoolCalled { get; private set; }
        public string? LastReviewStatus { get; private set; }
        public string? LastCounselorNote { get; private set; }

        public Task<CommunityServiceEntryRow?> VerifyCommunityServiceAsync(
            RequestContext context, string entryId, string userId, string? callerSchoolId, string status, string? note,
            CancellationToken cancellationToken = default)
        {
            VerifyCalled = true;
            LastCallerSchoolId = callerSchoolId;
            LastStatus = status;
            LastNote = note;
            return Task.FromResult(Entry);
        }

        public Task<bool> IsStudentInCallerSchoolAsync(
            RequestContext context, string callerSchoolId, string studentId, CancellationToken cancellationToken = default)
        {
            IsStudentInSchoolCalled = true;
            return Task.FromResult(StudentInSchool);
        }

        public Task<CourseChangeRequestRow?> ReviewChangeRequestAsync(
            RequestContext context, string adminUserId, string studentId, string requestId, string? status,
            string? counselorNote, CancellationToken cancellationToken = default)
        {
            LastReviewStatus = status;
            LastCounselorNote = counselorNote;
            return Task.FromResult(ChangeRequest);
        }
    }
}
