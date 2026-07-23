using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.CourseImport;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.CourseImport;

/// <summary>
/// Guard chain + HTTP mapping for the two course-import endpoints (FM-DOTNET-059); reader/writer faked (DB behavior is
/// proven by the reader/writer tests). Pins: anon→401 + wrong-permission→403 + no-school→400 on both; POST empty/absent
/// rows→400 "rows array required (parsed CSV data)"; POST success→202 with { success, data:{ jobId, totalRows, validRows,
/// invalidRows, validationErrors } }; GET success→200 shape (validationErrors emitted COMPACT — no Postgres ::text
/// spacing); GET null→404 "Job not found".
/// </summary>
public class CourseImportEndpointsTests
{
    private const string School = "school-1";
    private const string ImportPath = "/api/v1/school-admin/courses/import";
    private const string JobPath = "/api/v1/school-admin/courses/import/job-1";

    // ---- auth ----

    [Theory]
    [InlineData("POST", ImportPath)]
    [InlineData("GET", JobPath)]
    public async Task Anonymous_is_401(string method, string path)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await Anon(client, new HttpMethod(method), path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("POST", ImportPath, """{"rows":[{"code":"A","name":"A"}]}""")]
    [InlineData("GET", JobPath, null)]
    public async Task Wrong_permission_is_403(string method, string path, string? body)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        // SchoolManage is accepted by neither route (both require courses:write).
        var response = await Send(client, new HttpMethod(method), path, body, FormMapsPermissions.SchoolManage);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("POST", ImportPath, """{"rows":[{"code":"A","name":"A"}]}""")]
    [InlineData("GET", JobPath, null)]
    public async Task No_school_is_400(string method, string path, string? body)
    {
        using var factory = Factory(scope: new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), path, body, FormMapsPermissions.CoursesWrite);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- POST rows validation ----

    [Theory]
    [InlineData("""{"rows":[]}""")]   // empty array
    [InlineData("""{"filename":"x.csv"}""")] // rows absent
    [InlineData("""{"rows":"nope"}""")]      // rows not an array
    [InlineData("{ not json")]               // malformed body
    [InlineData(null)]                        // absent body
    public async Task Post_missing_rows_is_400_rows_required(string? body)
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ImportPath, body, FormMapsPermissions.CoursesWrite);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("rows array required (parsed CSV data)", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_success_is_202_with_result_shape()
    {
        var writer = new FakeWriter
        {
            Result = new ImportResult("job-xyz", 2, 1, 1,
                [new ImportValidationError(2, ["code and name are required"])])
        };
        using var factory = Factory(writer: writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, ImportPath,
            """{"rows":[{"code":"A","name":"A"},{"code":"","name":"Bad"}],"filename":"courses.csv"}""",
            FormMapsPermissions.CoursesWrite);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("job-xyz", data.GetProperty("jobId").GetString());
        Assert.Equal(2, data.GetProperty("totalRows").GetInt32());
        Assert.Equal(1, data.GetProperty("validRows").GetInt32());
        Assert.Equal(1, data.GetProperty("invalidRows").GetInt32());
        var ve = data.GetProperty("validationErrors");
        Assert.Equal(2, ve[0].GetProperty("row").GetInt32());
        Assert.Equal("code and name are required", ve[0].GetProperty("errors")[0].GetString());

        // The writer received the parsed rows + filename.
        Assert.Equal(2, writer.LastRows!.Count);
        Assert.Equal("courses.csv", writer.LastFilename);
    }

    [Fact]
    public async Task Post_filename_defaults_to_import_csv_when_absent()
    {
        var writer = new FakeWriter { Result = new ImportResult("j", 1, 1, 0, []) };
        using var factory = Factory(writer: writer);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Post, ImportPath, """{"rows":[{"code":"A","name":"A"}]}""",
            FormMapsPermissions.CoursesWrite);

        Assert.Equal("import.csv", writer.LastFilename);
    }

    [Fact]
    public async Task Post_non_string_filename_defaults_to_import_csv_and_is_202()
    {
        // Documented divergence (gate, LOW): legacy passes a truthy non-string filename to Prisma → String type error
        // OUTSIDE the per-row try → 500. This port keeps the intentional hardening: a non-string filename falls back to
        // "import.csv" and the request succeeds (202). Unreachable via the CSV frontend (filename is a string).
        var writer = new FakeWriter { Result = new ImportResult("j", 1, 1, 0, []) };
        using var factory = Factory(writer: writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, ImportPath,
            """{"rows":[{"code":"A","name":"A"}],"filename":123}""", FormMapsPermissions.CoursesWrite);

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("import.csv", writer.LastFilename);
    }

    [Fact]
    public async Task Post_numeric_credits_flows_through_the_row_parser()
    {
        // Gate fold (both HIGH): a JSON NUMBER credits is JS-coerced (parseFloat) not dropped — the endpoint parses via
        // ImportRowParser, so the writer receives Credits="3.5" (carried), not null. Pins the end-to-end wiring.
        var writer = new FakeWriter { Result = new ImportResult("j", 1, 1, 0, []) };
        using var factory = Factory(writer: writer);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Post, ImportPath,
            """{"rows":[{"code":"A","name":"A","credits":3.5}]}""", FormMapsPermissions.CoursesWrite);

        Assert.Equal("3.5", writer.LastRows![0].Credits);
    }

    // ---- GET ----

    [Fact]
    public async Task Get_success_is_200_with_compact_validation_errors()
    {
        var reader = new FakeReader
        {
            Job = new ImportJobView("job-1", "completed", 3, 2, 1,
                [new ImportValidationError(1, ["code and name are required"])], "2026-07-22T15:30:45.123Z")
        };
        using var factory = Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, JobPath, null, FormMapsPermissions.CoursesWrite);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var raw = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(raw);
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("job-1", data.GetProperty("jobId").GetString());
        Assert.Equal("completed", data.GetProperty("status").GetString());
        Assert.Equal(3, data.GetProperty("totalRows").GetInt32());
        Assert.Equal(2, data.GetProperty("processedRows").GetInt32());
        Assert.Equal(1, data.GetProperty("failedRows").GetInt32());
        Assert.Equal("2026-07-22T15:30:45.123Z", data.GetProperty("completedAt").GetString());
        Assert.Equal(1, data.GetProperty("validationErrors")[0].GetProperty("row").GetInt32());

        // Compact wire (System.Text.Json) — NO Postgres ": "/", " spacing.
        Assert.Contains("\"validationErrors\":[{\"row\":1,\"errors\":[\"code and name are required\"]}]", raw);
    }

    [Fact]
    public async Task Get_null_is_404_job_not_found()
    {
        using var factory = Factory(new FakeReader { Job = null });
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, JobPath, null, FormMapsPermissions.CoursesWrite);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Job not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- helpers ----

    private static Factory_ Factory(FakeReader? reader = null, FakeWriter? writer = null, FakeScope? scope = null) =>
        new(reader ?? new FakeReader(), writer ?? new FakeWriter(), scope ?? new FakeScope(School));

    private static Task<HttpResponseMessage> Anon(HttpClient client, HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        if (method == HttpMethod.Post)
        {
            request.Content = new StringContent("""{"rows":[{"code":"A","name":"A"}]}""", Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? body, string permission)
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

        return client.SendAsync(request);
    }

    private sealed class Factory_(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICourseImportReader>();
                services.AddSingleton<ICourseImportReader>(reader);
                services.RemoveAll<ICourseImportWriter>();
                services.AddSingleton<ICourseImportWriter>(writer);
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

    private sealed class FakeReader : ICourseImportReader
    {
        public ImportJobView? Job { get; set; } = new("job-1", "completed", 0, 0, 0, [], null);

        public Task<ImportJobView?> GetImportJobAsync(
            RequestContext context, string schoolId, string jobId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Job);
    }

    private sealed class FakeWriter : ICourseImportWriter
    {
        public ImportResult Result { get; set; } = new("job-1", 0, 0, 0, []);
        public IReadOnlyList<ImportRow>? LastRows { get; private set; }
        public string? LastFilename { get; private set; }

        public Task<ImportResult> ImportCoursesAsync(
            RequestContext context, string schoolId, string userId, IReadOnlyList<ImportRow> rows, string filename,
            CancellationToken cancellationToken = default)
        {
            LastRows = rows;
            LastFilename = filename;
            return Task.FromResult(Result);
        }
    }
}
