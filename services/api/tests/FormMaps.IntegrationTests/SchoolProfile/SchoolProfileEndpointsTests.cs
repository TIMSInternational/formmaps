using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Application.SchoolProfile;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.SchoolProfile;

/// <summary>
/// Guard chain + HTTP mapping for the profile + settings surface (reader/writer faked; DB behavior is proven by the
/// reader/writer tests). Pins: anon→401; missing school:manage→403; NO-SCHOOL→404 with the EXACT per-path message
/// ("No school linked" on /school/profile GET+PUT vs "Not found" on /settings GET+PUT); getSettings null→404
/// "Not found"; malformed PUT body→400 "Invalid request body"; profile-null→data:null; the mass-assignment guard
/// runs at the endpoint (unlisted PUT keys never reach the writer); and updateSettings non-boolean / truthy-non-string
/// timezone→400.
/// </summary>
public class SchoolProfileEndpointsTests
{
    private const string ProfilePath = "/api/v1/school-admin/school/profile";
    private const string SettingsPath = "/api/v1/school-admin/settings";
    private const string School = "school-1";

    // ---- auth ----

    [Theory]
    [InlineData(ProfilePath)]
    [InlineData(SettingsPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(ProfilePath)]
    [InlineData(SettingsPath)]
    public async Task Missing_school_manage_is_403(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, path, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- the two DISTINCT no-school 404 messages (all four methods) ----

    [Fact]
    public async Task Profile_get_no_school_is_404_no_school_linked()
    {
        await AssertNoSchool(HttpMethod.Get, ProfilePath, "No school linked");
    }

    [Fact]
    public async Task Profile_put_no_school_is_404_no_school_linked()
    {
        await AssertNoSchool(HttpMethod.Put, ProfilePath, "No school linked");
    }

    [Fact]
    public async Task Settings_get_no_school_is_404_not_found()
    {
        await AssertNoSchool(HttpMethod.Get, SettingsPath, "Not found");
    }

    [Fact]
    public async Task Settings_put_no_school_is_404_not_found()
    {
        await AssertNoSchool(HttpMethod.Put, SettingsPath, "Not found");
    }

    private static async Task AssertNoSchool(HttpMethod method, string path, string expectedMessage)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, method, path, body: method == HttpMethod.Put ? "{}" : null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedMessage, doc.RootElement.GetProperty("message").GetString());
    }

    // ---- getSettings null (school row missing) → 404 "Not found" ----

    [Fact]
    public async Task Settings_get_reader_null_is_404_not_found()
    {
        using var factory = new Factory(new FakeReader { Settings = null }, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, SettingsPath);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- malformed PUT body → 400 ----

    [Theory]
    [InlineData(ProfilePath)]
    [InlineData(SettingsPath)]
    public async Task Put_malformed_body_is_400(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, path, body: "{ not json");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Invalid request body", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- happy paths ----

    [Fact]
    public async Task Profile_get_happy_path_emits_full_envelope_with_email()
    {
        var reader = new FakeReader { Profile = SampleProfile("contact@s.test") };
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, ProfilePath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(School, data.GetProperty("id").GetString());
        Assert.Equal("contact@s.test", data.GetProperty("email").GetString());
        Assert.Equal("contact@s.test", data.GetProperty("contactEmail").GetString());
    }

    [Fact]
    public async Task Profile_get_reader_null_emits_data_null()
    {
        using var factory = new Factory(new FakeReader { Profile = null }, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, ProfilePath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    [Fact]
    public async Task Settings_get_happy_path_emits_composed_envelope()
    {
        var reader = new FakeReader
        {
            Settings = new SchoolSettings("Test School", 12, 300, "Standard", "admin-1", "Admin", "admin@s.test",
                true, false, true, "America/New_York"),
        };
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, SettingsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("Test School", data.GetProperty("school").GetProperty("name").GetString());
        Assert.Equal(12, data.GetProperty("school").GetProperty("currentStudents").GetInt32());
        Assert.Equal("Standard", data.GetProperty("school").GetProperty("plan").GetString());
        Assert.Equal("admin@s.test", data.GetProperty("admin").GetProperty("email").GetString());
        Assert.False(data.GetProperty("notifyOnAssessmentComplete").GetBoolean());
        Assert.Equal(300, data.GetProperty("maxStudents").GetInt32()); // top-level maxStudents present too
    }

    // ---- mass-assignment guard runs at the endpoint ----

    [Fact]
    public async Task Profile_put_only_allowlisted_columns_reach_the_writer()
    {
        var writer = new FakeWriter { Profile = SampleProfile("x@s.test") };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, ProfilePath, body: """
            {"name":"N","adminEmail":"attacker@evil.test","maxStudents":99999,"plan":"Enterprise","id":"other"}
            """);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        // Only `name` survived the allow-list; adminEmail/maxStudents/plan/id NEVER reached the writer.
        Assert.NotNull(writer.LastColumns);
        Assert.Equal(["name"], writer.LastColumns!.Select(c => c.Column).ToArray());
    }

    [Fact]
    public async Task Profile_put_empty_body_reaches_writer_with_no_columns()
    {
        var writer = new FakeWriter { Profile = SampleProfile("x@s.test") };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, ProfilePath, body: "");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotNull(writer.LastColumns);
        Assert.Empty(writer.LastColumns!); // empty body → {} → no columns (the no-op write)
    }

    // ---- updateSettings up-front validation ----

    [Theory]
    [InlineData("""{"notifyOnStudentSignup":"yes"}""", "notifyOnStudentSignup must be a boolean")]
    [InlineData("""{"notifyOnAssessmentComplete":1}""", "notifyOnAssessmentComplete must be a boolean")]
    [InlineData("""{"allowStudentSelfRegistration":"true"}""", "allowStudentSelfRegistration must be a boolean")]
    [InlineData("""{"timezone":123}""", "timezone must be a string")]
    [InlineData("""{"timezone":true}""", "timezone must be a string")]
    public async Task Settings_put_wrong_typed_field_is_400(string body, string expectedMessage)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, SettingsPath, body: body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(expectedMessage, doc.RootElement.GetProperty("message").GetString());
    }

    // JSON null is PRESENT-with-null for the nullable Boolean? flags: accepted (200), written as NULL, and the raw
    // response field is null (NOT the getSettings ?? default). One case per flag.
    [Theory]
    [InlineData("notifyOnStudentSignup")]
    [InlineData("notifyOnAssessmentComplete")]
    [InlineData("allowStudentSelfRegistration")]
    public async Task Settings_put_null_flag_is_accepted_200_and_response_field_null(string flag)
    {
        var writer = new FakeWriter { Settings = new SchoolSettingsUpdateResult(null, null, null, null, 300) };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, SettingsPath, body: $$"""{"{{flag}}":null}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        // Raw column value flows straight through (no ?? default on the PUT response).
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").GetProperty(flag).ValueKind);
        Assert.NotNull(writer.LastPatch); // the null flag reached the writer as present-with-null
    }

    [Theory]
    [InlineData("""{"notifyOnStudentSignup":false,"timezone":""}""")] // false OK; "" timezone falsy-skip
    [InlineData("""{"timezone":"Europe/London"}""")]
    [InlineData("{}")]
    public async Task Settings_put_valid_body_is_200(string body)
    {
        var writer = new FakeWriter
        {
            Settings = new SchoolSettingsUpdateResult(false, true, true, "Europe/London", 300),
        };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, SettingsPath, body: body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // ---- helpers ----

    private static SchoolProfileDto SampleProfile(string? contactEmail) => new(
        Id: School, Name: "Test School", AdminEmail: "admin@s.test", ContactEmail: contactEmail,
        MaxStudents: 300, ServiceHoursRequired: null, Details: null, ContractStartDate: null, ContractEndDate: null,
        Status: "active", InvitedAt: null, InvitationToken: null, InvitationTokenExpiresAt: null,
        NotifyOnStudentSignup: null, NotifyOnAssessmentComplete: null, AllowStudentSelfRegistration: null,
        LogoUrl: null, Address: JsonDocument.Parse("null").RootElement.Clone(), Phone: null, Website: null,
        Timezone: null, IsActive: true, CreatedBy: null, CreatedDate: "2020-01-01T00:00:00.000Z",
        UpdatedBy: null, UpdatedAt: "2020-01-01T00:00:00.000Z", VideoCallsEnabled: false,
        Email: contactEmail ?? string.Empty);

    private static Task<HttpResponseMessage> SendGet(HttpClient client, string path, string permission = FormMapsPermissions.SchoolManage) =>
        Send(client, HttpMethod.Get, path, body: null, permission: permission);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body,
        string permission = FormMapsPermissions.SchoolManage)
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
                services.RemoveAll<ISchoolProfileReader>();
                services.AddSingleton<ISchoolProfileReader>(reader);
                services.RemoveAll<ISchoolProfileWriter>();
                services.AddSingleton<ISchoolProfileWriter>(writer);
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

    private sealed class FakeReader : ISchoolProfileReader
    {
        public SchoolProfileDto? Profile { get; init; } = SampleProfile("contact@s.test");
        public SchoolSettings? Settings { get; init; } =
            new("Test School", 0, 300, "Standard", "admin-1", "Admin", "admin@s.test", true, true, false, "America/New_York");

        public Task<SchoolProfileDto?> GetSchoolProfileAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Profile);

        public Task<SchoolSettings?> GetSettingsAsync(
            RequestContext context, string userId, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Settings);
    }

    private sealed class FakeWriter : ISchoolProfileWriter
    {
        public SchoolProfileDto Profile { get; init; } = SampleProfile("contact@s.test");
        public SchoolSettingsUpdateResult Settings { get; init; } =
            new(true, true, false, "America/New_York", 300);

        public IReadOnlyList<SchoolProfileColumn>? LastColumns { get; private set; }
        public SchoolSettingsPatch? LastPatch { get; private set; }

        public Task<SchoolProfileDto> UpdateSchoolProfileAsync(
            RequestContext context, string schoolId, IReadOnlyList<SchoolProfileColumn> columns, CancellationToken cancellationToken = default)
        {
            LastColumns = columns;
            return Task.FromResult(Profile);
        }

        public Task<SchoolSettingsUpdateResult> UpdateSettingsAsync(
            RequestContext context, string schoolId, SchoolSettingsPatch patch, CancellationToken cancellationToken = default)
        {
            LastPatch = patch;
            return Task.FromResult(Settings);
        }
    }
}
