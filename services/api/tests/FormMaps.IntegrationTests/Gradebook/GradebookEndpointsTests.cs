using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Gradebook;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Gradebook;

/// <summary>
/// Guard chain + HTTP mapping for the gradebook transcript read (reader + scope resolver faked; the DB behavior
/// is proven by GradebookReaderTests). Pins: anon -> 401; missing school:manage -> 403; no school -> 400;
/// null -> 404 "Student not found"; the SINGLE-wrap envelope with byYear keyed verbatim + full-row camelCase.
/// </summary>
public class GradebookEndpointsTests
{
    private const string Path = "/api/v1/school-admin/gradebook/students/stu-1";
    private const string School = "school-1";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Missing_school_manage_permission_is_403()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, permission: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertMessage(response, "No school");
    }

    [Fact]
    public async Task Null_transcript_is_404_student_not_found()
    {
        using var factory = new Factory(new FakeReader { Transcript = null }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Student not found");
    }

    [Fact]
    public async Task Transcript_is_single_wrapped_with_byYear_and_gpa()
    {
        var row = new TranscriptGradeRow(
            "g-1", School, "stu-1", "course-1", "ENG101", "Fall", "A", 4d, "completed",
            null, "honors", "2025-2026", true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");
        var transcript = new StudentTranscript(
            new Dictionary<string, IReadOnlyList<TranscriptGradeRow>> { ["2025-2026"] = [row] },
            4.0, 4.5, 4d);
        using var factory = new Factory(new FakeReader { Transcript = transcript }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(School, ((FakeReader)factory.Reader).SeenSchool);
        Assert.Equal("stu-1", ((FakeReader)factory.Reader).SeenStudent);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.TryGetProperty("data", out _)); // SINGLE-wrap (not data.data)
        Assert.Equal(4.0, data.GetProperty("gpaUnweighted").GetDouble());
        Assert.Equal(4.5, data.GetProperty("gpaWeighted").GetDouble());
        Assert.Equal(4d, data.GetProperty("totalCredits").GetDouble());
        // byYear key verbatim (dictionary keys are not camelCased); grade fields camelCase; credits a number.
        var yearRow = data.GetProperty("byYear").GetProperty("2025-2026")[0];
        Assert.Equal("ENG101", yearRow.GetProperty("courseCode").GetString());
        Assert.Equal(JsonValueKind.Number, yearRow.GetProperty("credits").ValueKind);
        Assert.Equal("honors", yearRow.GetProperty("courseLevel").GetString());
    }

    [Fact]
    public async Task Null_gpas_serialize_as_json_null_with_zero_credits()
    {
        var transcript = new StudentTranscript(
            new Dictionary<string, IReadOnlyList<TranscriptGradeRow>>(), null, null, 0d);
        using var factory = new Factory(new FakeReader { Transcript = transcript }, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gpaUnweighted").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("gpaWeighted").ValueKind);
        Assert.Equal(0d, data.GetProperty("totalCredits").GetDouble());
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private sealed class Factory(FakeReader reader, FakeScope scope) : WebApplicationFactory<Program>
    {
        public IGradebookReader Reader { get; } = reader;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IGradebookReader>();
                services.AddSingleton(Reader);
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

    private sealed class FakeReader : IGradebookReader
    {
        public StudentTranscript? Transcript { get; init; }

        public string? SeenSchool { get; private set; }

        public string? SeenStudent { get; private set; }

        public Task<StudentTranscript?> GetStudentTranscriptAsync(
            RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default)
        {
            SeenSchool = schoolId;
            SeenStudent = studentId;
            return Task.FromResult(Transcript);
        }
    }
}
