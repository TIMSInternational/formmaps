using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.IsamsReads;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.IsamsReads;

/// <summary>
/// Guard chain + HTTP mapping for the two iSAMS reads (reader + scope resolver faked; DB behavior is proven by
/// IsamsReadsReaderTests). Pins: anon → 401; missing school:manage → 403 (analytics:school does NOT substitute);
/// the THREE distinct status 200 shapes (no-school 1-key { configured:false }; school+no-config 3-key
/// { configured:false, enabled:false, connected:false } with NO lastSyncAt key; config-row 4-key
/// { configured:true, enabled, connected, lastSyncAt } with lastSyncAt PRESENT even when null); the JS-truthy
/// enabled derivation (endpoint null/""→false, non-empty→true); the JS-truthy connected derivation
/// (formmaps#145 — legacy !!(isActive &amp;&amp; endpoint &amp;&amp; credentialsEncrypted), "" falsy exactly like
/// null); and jobs (no-school → []; full-row camelCase passthrough).
/// </summary>
public class IsamsReadsEndpointsTests
{
    private const string StatusPath = "/api/v1/school-admin/integrations/isams/status";
    private const string JobsPath = "/api/v1/school-admin/integrations/isams/jobs";
    private const string School = "school-1";

    [Theory]
    [InlineData(StatusPath)]
    [InlineData(JobsPath)]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(StatusPath)]
    [InlineData(JobsPath)]
    public async Task Missing_school_manage_is_403_even_with_analytics_school(string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, path, permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- status: three shapes ----

    [Fact]
    public async Task Status_no_school_returns_only_configured_false()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Single(data.EnumerateObject());
        Assert.False(data.GetProperty("configured").GetBoolean());
        Assert.False(data.TryGetProperty("enabled", out _));
        Assert.False(data.TryGetProperty("lastSyncAt", out _));
    }

    [Fact]
    public async Task Status_school_no_config_returns_configured_enabled_connected_false_no_lastSyncAt()
    {
        // Reader returns null → shape 2: { configured:false, enabled:false, connected:false } WITHOUT a
        // lastSyncAt key. connected IS present (formmaps#145): legacy !!(config?.isActive && …) → false when
        // config is null, and false survives JSON.stringify while lastSyncAt:undefined is dropped.
        var reader = new FakeReader { Status = null };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.EnumerateObject().Count());
        Assert.False(data.GetProperty("configured").GetBoolean());
        Assert.False(data.GetProperty("enabled").GetBoolean());
        Assert.False(data.GetProperty("connected").GetBoolean());
        Assert.False(data.TryGetProperty("lastSyncAt", out _));   // key ABSENT in shape 2
    }

    [Fact]
    public async Task Status_config_with_endpoint_and_lastSyncAt_returns_shape_3()
    {
        var reader = new FakeReader
        {
            Status = new IsamsConfigStatus(
                "https://x", "2026-01-02T03:04:05.000Z", IsActive: true, CredentialsEncrypted: "enc:v1:abc"),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(4, data.EnumerateObject().Count());
        Assert.True(data.GetProperty("configured").GetBoolean());
        Assert.True(data.GetProperty("enabled").GetBoolean());              // non-empty endpoint → true
        Assert.True(data.GetProperty("connected").GetBoolean());            // active + endpoint + credentials
        Assert.Equal("2026-01-02T03:04:05.000Z", data.GetProperty("lastSyncAt").GetString());
    }

    [Fact]
    public async Task Status_config_endpoint_null_disables_and_lastSyncAt_null_key_present()
    {
        var reader = new FakeReader
        {
            Status = new IsamsConfigStatus(
                Endpoint: null, LastSyncAt: null, IsActive: true, CredentialsEncrypted: "enc:v1:abc"),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(4, data.EnumerateObject().Count());
        Assert.True(data.GetProperty("configured").GetBoolean());
        Assert.False(data.GetProperty("enabled").GetBoolean());            // null endpoint → false
        Assert.False(data.GetProperty("connected").GetBoolean());          // null endpoint kills connected too
        // lastSyncAt key PRESENT (shape 3) even though the value is null — the distinction from shape 2.
        Assert.True(data.TryGetProperty("lastSyncAt", out var last));
        Assert.Equal(JsonValueKind.Null, last.ValueKind);
    }

    [Fact]
    public async Task Status_config_endpoint_empty_string_disables()
    {
        var reader = new FakeReader
        {
            Status = new IsamsConfigStatus(
                Endpoint: "", LastSyncAt: null, IsActive: true, CredentialsEncrypted: "enc:v1:abc"),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.False(data.GetProperty("enabled").GetBoolean());            // empty endpoint → false
    }

    // formmaps#145 — the UI gates on `connected`. Legacy (schoolService.ts:506-508):
    //   connected: !!(config?.isActive && config?.endpoint && config?.credentialsEncrypted)
    // Pins the FULL truth table on the WIRE (exact lowercase key — JsonDocument.GetProperty is case-sensitive),
    // including the JS !! coercion: "" is falsy exactly like null for BOTH endpoint and credentials.
    [Theory]
    [InlineData(true, "https://x", "enc:v1:abc", true)]    // active + endpoint + credentials → connected
    [InlineData(false, "https://x", "enc:v1:abc", false)]  // isActive false → never connected
    [InlineData(true, null, "enc:v1:abc", false)]          // endpoint NULL → false
    [InlineData(true, "", "enc:v1:abc", false)]            // endpoint "" → false (JS-falsy, unlike C# non-null)
    [InlineData(true, "https://x", null, false)]           // credentials NULL → false
    [InlineData(true, "https://x", "", false)]             // credentials "" → false (JS-falsy)
    public async Task Status_connected_truth_table(bool isActive, string? endpoint, string? credentials, bool expected)
    {
        var reader = new FakeReader
        {
            Status = new IsamsConfigStatus(
                Endpoint: endpoint, LastSyncAt: null, IsActive: isActive, CredentialsEncrypted: credentials),
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, StatusPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(expected, data.GetProperty("connected").GetBoolean());
    }

    // ---- jobs ----

    [Fact]
    public async Task Jobs_no_school_returns_empty_data_array()
    {
        using var factory = new Factory(new FakeReader(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, JobsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Empty(doc.RootElement.GetProperty("data").EnumerateArray());
    }

    [Fact]
    public async Task Jobs_happy_path_full_row_camelCase_passthrough()
    {
        var reader = new FakeReader
        {
            Jobs =
            [
                new IsamsSyncJobRow(
                    Id: "j1", SchoolId: School, InitiatedBy: "user-1", Status: "completed", Details: "d",
                    StartedAt: "2026-03-01T10:00:00.000Z", FinishedAt: "2026-03-01T10:05:00.000Z", IsActive: true,
                    CreatedBy: "creator-1", CreatedDate: "2026-03-01T09:00:00.000Z", UpdatedBy: null,
                    UpdatedAt: "2026-03-01T10:06:00.000Z"),
            ],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JobsPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal(12, row.EnumerateObject().Count());
        Assert.Equal("j1", row.GetProperty("id").GetString());
        Assert.Equal(School, row.GetProperty("schoolId").GetString());
        Assert.Equal("user-1", row.GetProperty("initiatedBy").GetString());
        Assert.Equal("completed", row.GetProperty("status").GetString());
        Assert.Equal("d", row.GetProperty("details").GetString());
        Assert.Equal("2026-03-01T10:00:00.000Z", row.GetProperty("startedAt").GetString());
        Assert.Equal("2026-03-01T10:05:00.000Z", row.GetProperty("finishedAt").GetString());
        Assert.True(row.GetProperty("isActive").GetBoolean());
        Assert.Equal("creator-1", row.GetProperty("createdBy").GetString());
        Assert.Equal("2026-03-01T09:00:00.000Z", row.GetProperty("createdDate").GetString());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("updatedBy").ValueKind);
        Assert.Equal("2026-03-01T10:06:00.000Z", row.GetProperty("updatedAt").GetString());
    }

    [Fact]
    public async Task Jobs_null_started_finished_details_serialize_as_null()
    {
        var reader = new FakeReader
        {
            Jobs =
            [
                new IsamsSyncJobRow(
                    Id: "j1", SchoolId: School, InitiatedBy: "user-1", Status: "pending", Details: null,
                    StartedAt: null, FinishedAt: null, IsActive: true, CreatedBy: null,
                    CreatedDate: "2026-03-01T09:00:00.000Z", UpdatedBy: null, UpdatedAt: "2026-03-01T09:00:00.000Z"),
            ],
        };
        using var factory = new Factory(reader, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JobsPath);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = doc.RootElement.GetProperty("data")[0];
        Assert.Equal(JsonValueKind.Null, row.GetProperty("details").ValueKind);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("startedAt").ValueKind);
        Assert.Equal(JsonValueKind.Null, row.GetProperty("finishedAt").ValueKind);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IIsamsReadsReader>();
                services.AddSingleton<IIsamsReadsReader>(reader);
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

    private sealed class FakeReader : IIsamsReadsReader
    {
        public IsamsConfigStatus? Status { get; init; }
        public IReadOnlyList<IsamsSyncJobRow> Jobs { get; init; } = [];

        public Task<IsamsConfigStatus?> GetStatusAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Status);

        public Task<IReadOnlyList<IsamsSyncJobRow>> GetSyncJobsAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Jobs);
    }
}
