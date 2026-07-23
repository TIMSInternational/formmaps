using System.Net;
using System.Net.Http.Json;
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
/// Guard chain + HTTP mapping for the FM-065 non-SES writes (writer + scope faked). Pins: anon → 401; missing
/// school:manage → 403; no-school → 400 "No school"; DELETE not-found → 404 "Student not found" + happy {studentId};
/// deadline PUT parse (null/absent → null; valid string forwarded as UTC; invalid string → 500) + happy envelope.
/// </summary>
public class SchoolStudentsWriteEndpointsTests
{
    private const string DeletePath = "/api/v1/school-admin/students/s1";
    private const string DeadlinePath = "/api/v1/school-admin/course-request-deadline";
    private const string School = "school-1";

    [Fact]
    public async Task Delete_anonymous_is_401()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.DeleteAsync(DeletePath)).StatusCode);
    }

    [Fact]
    public async Task Delete_missing_school_manage_is_403()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await SendDelete(client, DeletePath, permission: FormMapsPermissions.AnalyticsSchool);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Delete_no_school_is_400()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await SendDelete(client, DeletePath);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_not_found_is_404()
    {
        var writer = new FakeWriter { Deleted = false };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await SendDelete(client, DeletePath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Student not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_happy_returns_student_id()
    {
        var writer = new FakeWriter { Deleted = true };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await SendDelete(client, DeletePath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("s1", doc.RootElement.GetProperty("data").GetProperty("studentId").GetString());
    }

    [Theory]
    [InlineData("""{"deadline":"2026-05-01T00:00:00Z"}""", "2026-05-01T00:00:00.000Z")]
    [InlineData("""{"deadline":null}""", null)]
    [InlineData("""{}""", null)]
    [InlineData("""{"deadline":""}""", null)]
    [InlineData("""{"deadline":1717200000000}""", "2024-06-01T00:00:00.000Z")] // new Date(number) = epoch ms
    [InlineData("""{"deadline":0}""", null)]                                    // 0 is JS-falsy → null
    [InlineData("""{"deadline":true}""", "1970-01-01T00:00:00.001Z")]           // new Date(true) = new Date(1)
    public async Task Deadline_parses_body_and_forwards_utc(string bodyJson, string? expectedForwardedIso)
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, bodyJson);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // The endpoint forwards a UTC DateTime (or null) to the writer.
        if (expectedForwardedIso is null)
        {
            Assert.Null(writer.LastDeadline);
        }
        else
        {
            Assert.Equal(expectedForwardedIso, Iso(writer.LastDeadline!.Value));
        }
    }

    [Theory]
    [InlineData("""{"deadline":"not-a-date"}""")]  // unparseable string
    [InlineData("""{"deadline":{}}""")]             // object → new Date(obj) Invalid
    [InlineData("""{"deadline":[]}""")]             // array → new Date([]) Invalid
    public async Task Deadline_invalid_values_are_500(string bodyJson)
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, bodyJson);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Null(writer.LastDeadline); // no write attempted with a bad value
    }

    [Fact]
    public async Task Deadline_malformed_json_is_500_with_no_write()
    {
        // Legacy express.json() throws on malformed JSON → global handler → 500, NO write (must NOT be treated as an
        // empty body that clears the deadline).
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, """{"deadline":""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.False(writer.WriteCalled); // no upsert on malformed JSON
    }

    [Fact]
    public async Task Deadline_empty_body_clears_deadline_200()
    {
        // An EMPTY body is express.json → {} → deadline null → 200 clears (distinct from malformed).
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, "");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(writer.WriteCalled);
        Assert.Null(writer.LastDeadline);
    }

    [Fact]
    public async Task Deadline_invalid_date_string_is_500()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, """{"deadline":"not-a-date"}""");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Internal server error", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Deadline_happy_returns_stored_value()
    {
        var writer = new FakeWriter { Stored = "2026-05-01T00:00:00.000Z" };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendPut(client, DeadlinePath, """{"deadline":"2026-05-01T00:00:00Z"}""");

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("2026-05-01T00:00:00.000Z", doc.RootElement.GetProperty("data").GetProperty("deadline").GetString());
    }

    // ---- helpers ----

    private static string Iso(DateTime v) =>
        DateTime.SpecifyKind(v, DateTimeKind.Utc).ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'");

    private static Task<HttpResponseMessage> SendDelete(HttpClient client, string path, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        AddAuth(request, permission);
        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> SendPut(HttpClient client, string path, string bodyJson, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, path)
        {
            Content = new StringContent(bodyJson, System.Text.Encoding.UTF8, "application/json"),
        };
        AddAuth(request, permission);
        return client.SendAsync(request);
    }

    private static void AddAuth(HttpRequestMessage request, string permission)
    {
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
    }

    private sealed class Factory(FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ISchoolStudentsWriter>();
                services.AddSingleton<ISchoolStudentsWriter>(writer);
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

    private sealed class FakeWriter : ISchoolStudentsWriter
    {
        public bool Deleted { get; init; } = true;
        public string? Stored { get; init; }
        public DateTime? LastDeadline { get; private set; }
        public bool WriteCalled { get; private set; }

        public Task<bool> DeleteStudentAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Deleted);

        public Task<string?> UpdateCourseRequestDeadlineAsync(
            RequestContext context, string schoolId, DateTime? deadline, CancellationToken cancellationToken = default)
        {
            WriteCalled = true;
            LastDeadline = deadline;
            return Task.FromResult(Stored);
        }
    }
}
