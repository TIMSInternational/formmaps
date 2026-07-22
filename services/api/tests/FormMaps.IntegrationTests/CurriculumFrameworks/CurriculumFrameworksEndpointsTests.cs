using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.CurriculumFrameworks;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.CurriculumFrameworks;

/// <summary>
/// Guard chain + HTTP mapping for the four curriculum:manage frameworks endpoints (FM-DOTNET-055); reader/writer faked
/// (DB behavior is proven by the reader/writer tests). Pins: anon→401 and missing curriculum:manage→403 on all four;
/// no-school→400 "No school" on the three school-scoped paths; the GET :type/courses catalog read is GLOBAL (works
/// even when the scope resolves NO school); the frameworks list is DOUBLE-nested {data:{data:[…]}} and OMITS
/// id+configuredAt for a type with no row; PUT frameworks returns {success:true}; and the customize PUT surfaces the
/// service's DYNAMIC 404/400 status + the merged {data} with the singular gradeLevel key.
/// </summary>
public class CurriculumFrameworksEndpointsTests
{
    private const string FrameworksPath = "/api/v1/school-admin/curriculum/frameworks";
    private const string CoursesPath = "/api/v1/school-admin/curriculum/frameworks/AP/courses";
    private const string CustomizePath = "/api/v1/school-admin/curriculum/frameworks/AP/courses/c1";
    private const string School = "school-1";

    // ---- auth ----

    [Theory]
    [InlineData(FrameworksPath)]
    [InlineData(CoursesPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task Anonymous_put_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await client.PutAsync(FrameworksPath, new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(FrameworksPath)]
    [InlineData(CoursesPath)]
    public async Task Missing_curriculum_manage_is_403(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, path, permission: FormMapsPermissions.SchoolManage);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- no-school (three school-scoped paths only) ----

    [Fact]
    public async Task Frameworks_get_no_school_is_400()
    {
        await AssertNoSchool(HttpMethod.Get, FrameworksPath, body: null);
    }

    [Fact]
    public async Task Frameworks_put_no_school_is_400()
    {
        await AssertNoSchool(HttpMethod.Put, FrameworksPath, body: "{}");
    }

    [Fact]
    public async Task Customize_put_no_school_is_400()
    {
        await AssertNoSchool(HttpMethod.Put, CustomizePath, body: "{}");
    }

    private static async Task AssertNoSchool(HttpMethod method, string path, string? body)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, method, path, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- GET :type/courses is GLOBAL (no school needed) ----

    [Fact]
    public async Task Courses_get_works_without_school()
    {
        var reader = new FakeReader
        {
            Courses = new FrameworkCoursesPage(
                [new FrameworkCourseRow("c1", "AP", "AP101", "Calc", "Math", "4", [11, 12], "d", true, null, true, null,
                    "2024-01-01T00:00:00.000Z", null, "2024-01-01T00:00:00.000Z")],
                Total: 1, Page: 1, Limit: 50, TotalPages: 1),
        };
        // Scope resolves NO school, but the courses endpoint never calls it → still 200.
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await SendGet(client, CoursesPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("4", row.GetProperty("credits").GetString()); // string (raw Decimal → decimal.js)
        Assert.Equal("AP101", row.GetProperty("code").GetString());
        Assert.Equal("AP", reader.LastType); // raw type passed through
    }

    // ---- GET frameworks double-nested + omit id/configuredAt ----

    [Fact]
    public async Task Frameworks_get_is_double_nested_and_omits_id_configuredAt_for_missing_row()
    {
        var reader = new FakeReader
        {
            Frameworks =
            [
                new FrameworkSummary(HasRow: true, Id: "fw-ap", Type: "AP", Enabled: true, ConfiguredAt: "2024-01-01T00:00:00.000Z", CourseCount: 3),
                new FrameworkSummary(HasRow: false, Id: null, Type: "IB", Enabled: false, ConfiguredAt: null, CourseCount: 0),
            ],
        };
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, FrameworksPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var entries = doc.RootElement.GetProperty("data").GetProperty("data"); // DOUBLE-nested
        Assert.Equal(2, entries.GetArrayLength());

        var ap = entries[0];
        Assert.Equal("fw-ap", ap.GetProperty("id").GetString());
        Assert.True(ap.GetProperty("enabled").GetBoolean());
        Assert.Equal("2024-01-01T00:00:00.000Z", ap.GetProperty("configuredAt").GetString());
        Assert.Equal(3, ap.GetProperty("courseCount").GetInt32());
        Assert.Equal("AP", ap.GetProperty("label").GetString());

        var ib = entries[1];
        Assert.False(ib.TryGetProperty("id", out _));           // OMITTED — no row
        Assert.False(ib.TryGetProperty("configuredAt", out _)); // OMITTED — no row
        Assert.False(ib.GetProperty("enabled").GetBoolean());
        Assert.Equal(0, ib.GetProperty("courseCount").GetInt32());
    }

    // ---- PUT frameworks ----

    [Fact]
    public async Task Frameworks_put_returns_success_and_parses_array()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, FrameworksPath,
            body: """{"frameworks":[{"type":"AP","enabled":true},{"type":"IB","enabled":false},{"type":"NATIONAL"}]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        // AP/IB carry explicit booleans (HasEnabled=true); NATIONAL omits enabled → HasEnabled=false (writer SKIPs
        // enabled on UPDATE, keeps existing; the create-vs-update undefined-asymmetry — FM-055 gate fold).
        Assert.Equal([("AP", true, true), ("IB", false, true), ("NATIONAL", false, false)], writer.LastFrameworks!);
    }

    [Fact]
    public async Task Frameworks_put_empty_body_writes_empty_list()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, FrameworksPath, body: "");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(writer.LastFrameworks);
        Assert.Empty(writer.LastFrameworks!); // {} → frameworks || [] → []
    }

    // ---- PUT customize dynamic status ----

    [Theory]
    [InlineData(404, "Course not found")]
    [InlineData(400, "Course does not belong to this framework type")]
    public async Task Customize_put_surfaces_dynamic_status(int status, string message)
    {
        var writer = new FakeWriter { CustomizeResult = new CustomizeResult(status, message, null) };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, CustomizePath, body: "{}");

        Assert.Equal(status, (int)response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Customize_put_success_emits_merged_data_with_singular_gradeLevel()
    {
        var writer = new FakeWriter
        {
            CustomizeResult = CustomizeResult.Ok(new CustomizeOutcome(
                "c1", "AP101", "Local", "AP", "Math", "5", [11, 12], "Desc", IsCustomized: true)),
        };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, CustomizePath, body: """{"credits":5,"localName":"Local","gradeLevel":[11,12]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("Local", data.GetProperty("name").GetString());
        Assert.Equal("5", data.GetProperty("credits").GetString());
        Assert.Equal(2, data.GetProperty("gradeLevel").GetArrayLength()); // SINGULAR key holding an int[]
        Assert.False(data.TryGetProperty("gradeLevels", out _));           // NOT the plural key
        Assert.True(data.GetProperty("isCustomized").GetBoolean());
        // The parsed input reached the writer as present credits + localName + gradeLevel.
        Assert.True(writer.LastInput!.HasCredits);
        Assert.True(writer.LastInput!.HasLocalName);
        Assert.Equal([11, 12], writer.LastInput!.GradeLevels);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> SendGet(HttpClient client, string path, string permission = FormMapsPermissions.CurriculumManage) =>
        Send(client, HttpMethod.Get, path, body: null, permission: permission);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body,
        string permission = FormMapsPermissions.CurriculumManage)
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

    private sealed class Factory(FakeReader reader, FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICurriculumFrameworksReader>();
                services.AddSingleton<ICurriculumFrameworksReader>(reader);
                services.RemoveAll<ICurriculumFrameworksWriter>();
                services.AddSingleton<ICurriculumFrameworksWriter>(writer);
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

    private sealed class FakeReader : ICurriculumFrameworksReader
    {
        public IReadOnlyList<FrameworkSummary> Frameworks { get; init; } =
            [new FrameworkSummary(false, null, "AP", false, null, 0)];

        public FrameworkCoursesPage Courses { get; init; } =
            new([], Total: 0, Page: 1, Limit: 50, TotalPages: 0);

        public string? LastType { get; private set; }

        public Task<IReadOnlyList<FrameworkSummary>> ListFrameworksAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Frameworks);

        public Task<FrameworkCoursesPage> ListFrameworkCoursesAsync(
            RequestContext context, string frameworkType, int page, int limit, long skip, string? search,
            CancellationToken cancellationToken = default)
        {
            LastType = frameworkType;
            return Task.FromResult(Courses);
        }
    }

    private sealed class FakeWriter : ICurriculumFrameworksWriter
    {
        public CustomizeResult CustomizeResult { get; init; } =
            CustomizeResult.Ok(new CustomizeOutcome("c1", "AP101", "N", "AP", null, "0", [], null, true));

        public IReadOnlyList<(string Type, bool Enabled, bool HasEnabled)>? LastFrameworks { get; private set; }
        public FrameworkOverrideInput? LastInput { get; private set; }

        public Task UpdateFrameworksAsync(
            RequestContext context, string schoolId, IReadOnlyList<(string Type, bool Enabled, bool HasEnabled)> frameworks,
            CancellationToken cancellationToken = default)
        {
            LastFrameworks = frameworks;
            return Task.CompletedTask;
        }

        public Task<CustomizeResult> CustomizeFrameworkCourseAsync(
            RequestContext context, string schoolId, string userId, string frameworkType, string courseId,
            FrameworkOverrideInput input, CancellationToken cancellationToken = default)
        {
            LastInput = input;
            return Task.FromResult(CustomizeResult);
        }
    }
}
