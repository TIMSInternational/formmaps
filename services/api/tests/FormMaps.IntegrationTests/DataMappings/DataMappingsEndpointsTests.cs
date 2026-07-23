using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.DataMappings;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.DataMappings;

/// <summary>
/// Guard chain + HTTP mapping for the three school:data-mapping endpoints (FM-DOTNET-056); reader/writer faked (DB
/// behavior is proven by the reader/writer tests). Pins: anon→401 and missing school:data-mapping→403 on all three;
/// no-school→400 "No school" on all three; the GET 100-cap + NaN/0 default clamping; the { success, data:{ data,
/// total, page, limit, totalPages } } envelope; POST 201 with the full row; and the RATIFIED SAFE DIVERGENCE — a
/// missing/non-array/empty mappingIds normalizes to an EMPTY id list at the boundary (→ the writer approves 0, never
/// the whole school), while a real array passes those ids through.
/// </summary>
public class DataMappingsEndpointsTests
{
    private const string ListPath = "/api/v1/school-admin/data-mappings";
    private const string BulkPath = "/api/v1/school-admin/data-mappings/bulk-approve";
    private const string School = "school-1";

    // ---- auth ----

    [Fact]
    public async Task Anonymous_get_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(ListPath)).StatusCode);
    }

    [Fact]
    public async Task Anonymous_post_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await client.PostAsync(ListPath, new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Anonymous_bulk_is_401()
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await client.PostAsync(BulkPath, new StringContent("{}", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("GET", ListPath)]
    [InlineData("POST", ListPath)]
    [InlineData("POST", BulkPath)]
    public async Task Missing_permission_is_403(string method, string path)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, new HttpMethod(method), path, method == "GET" ? null : "{}",
            permission: FormMapsPermissions.SchoolManage);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    // ---- no-school (all three) ----

    [Theory]
    [InlineData("GET", ListPath, null)]
    [InlineData("POST", ListPath, "{}")]
    [InlineData("POST", BulkPath, "{}")]
    public async Task No_school_is_400(string method, string path, string? body)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, new HttpMethod(method), path, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    // ---- GET envelope + pagination clamp ----

    [Fact]
    public async Task Get_returns_nested_envelope()
    {
        var reader = new FakeReader
        {
            Page = new DataMappingsPage(
                [new DataMappingRow("m1", School, "EXT1", null, "manual", "course-1", "0.85", "manual", "approved",
                    "admin-1", "2024-01-01T00:00:00.000Z", true, null, "2024-01-01T00:00:00.000Z", null,
                    "2024-01-01T00:00:00.000Z")],
                Total: 1, Page: 1, Limit: 20, TotalPages: 1),
        };
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await SendGet(client, ListPath);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("total").GetInt32());
        Assert.Equal(1, data.GetProperty("totalPages").GetInt32());
        var row = data.GetProperty("data")[0];
        Assert.Equal("0.85", row.GetProperty("confidence").GetString()); // confidence STRING passthrough
        Assert.Equal("manual", row.GetProperty("source").GetString());
        Assert.Equal("approved", row.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Get_caps_limit_at_100_and_defaults_on_nan_and_zero()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        // limit=500 → capped 100; page=abc (NaN) → 1; limit still capped.
        await SendGet(client, $"{ListPath}?page=abc&limit=500");
        Assert.Equal(1, reader.LastPage);
        Assert.Equal(100, reader.LastLimit);

        // limit=0 → default 20; page=0 → default 1.
        await SendGet(client, $"{ListPath}?page=0&limit=0");
        Assert.Equal(1, reader.LastPage);
        Assert.Equal(20, reader.LastLimit);
    }

    [Fact]
    public async Task Get_passes_status_filter_and_drops_empty()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        await SendGet(client, $"{ListPath}?status=pending");
        Assert.Equal("pending", reader.LastStatus);

        await SendGet(client, $"{ListPath}?status=");
        Assert.Null(reader.LastStatus); // empty → no filter
    }

    // ---- POST ----

    [Fact]
    public async Task Post_returns_201_full_row()
    {
        var writer = new FakeWriter
        {
            CreatedRow = new DataMappingRow("new-id", School, "EXT1", null, "manual", "course-1", null, "manual",
                "approved", "admin-1", "2024-01-01T00:00:00.000Z", true, null, "2024-01-01T00:00:00.000Z", null,
                "2024-01-01T00:00:00.000Z"),
        };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, ListPath,
            """{"externalCode":"EXT1","internalCourseId":"course-1"}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("new-id", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
        Assert.Equal("admin-1", writer.LastApprovedBy); // caller stamped
    }

    // ---- bulk-approve safe divergence ----

    [Theory]
    [InlineData("{}")]                        // missing mappingIds
    [InlineData("""{"mappingIds":"nope"}""")] // non-array
    [InlineData("""{"mappingIds":[]}""")]     // empty array
    public async Task Bulk_missing_or_non_array_normalizes_to_empty_ids(string body)
    {
        var writer = new FakeWriter { ApproveCount = 0 };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, BulkPath, body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("approved").GetInt32());
        Assert.NotNull(writer.LastIds);
        Assert.Empty(writer.LastIds!); // the ratified safe divergence: NEVER a dropped filter → NEVER all-in-school
    }

    [Fact]
    public async Task Bulk_real_array_passes_ids_and_skips_non_strings()
    {
        var writer = new FakeWriter { ApproveCount = 2 };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, BulkPath, """{"mappingIds":["a","b",5,null]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetProperty("approved").GetInt32());
        Assert.Equal(["a", "b"], writer.LastIds); // non-string elements skipped (won't match → 0 for those)
    }

    // ---- PUT/DELETE /data-mappings/{id} (FM-DOTNET-061) ----

    private const string ItemPath = ListPath + "/m1";

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Mapping_write_anonymous_is_401(string method)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var request = new HttpRequestMessage(new HttpMethod(method), ItemPath);
        if (method == "PUT")
        {
            request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Mapping_write_missing_permission_is_403(string method)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), ItemPath, method == "PUT" ? "{}" : null, FormMapsPermissions.SchoolManage);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task Mapping_write_no_school_is_400(string method)
    {
        using var factory = new Factory(new FakeReader(), new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await Send(client, new HttpMethod(method), ItemPath, method == "PUT" ? "{}" : null);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_mapping_not_found_is_404_mapping_not_found()
    {
        // The writer's null outcome (missing OR wrong-school) → uniform 404 (NOT 403 — mappings differ from courses).
        var writer = new FakeWriter { UpdateResult = null };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, """{"externalCode":"X"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Mapping not found", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal("m1", writer.LastMappingId);
        Assert.Equal("admin-1", writer.LastUserId); // caller stamped as updatedBy
    }

    [Fact]
    public async Task Delete_mapping_not_found_is_404_mapping_not_found()
    {
        var writer = new FakeWriter { DeleteResult = false };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath, null);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Mapping not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_mapping_success_is_200_with_id()
    {
        var writer = new FakeWriter { UpdateResult = "m1" };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, """{"externalName":"New"}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("m1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Delete_mapping_success_is_200_success_true()
    {
        var writer = new FakeWriter { DeleteResult = true };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath, null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _)); // delete → { success:true } only
    }

    // ---- the 403-vs-404 asymmetry pin (courses vs mappings) ----

    [Fact]
    public async Task Mappings_not_found_is_404_while_courses_not_owned_is_403()
    {
        // Same "ownership gate failed" outcome maps to DIFFERENT status codes across the two domains. This pins the
        // data-mappings side (404); SchoolCoursesEndpointsTests pins the courses side (403).
        var writer = new FakeWriter { UpdateResult = null, DeleteResult = false };
        using var factory = new Factory(new FakeReader(), writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var put = await Send(client, HttpMethod.Put, ItemPath, "{}");
        var del = await Send(client, HttpMethod.Delete, ItemPath, null);

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> SendGet(HttpClient client, string path, string permission = FormMapsPermissions.SchoolDataMapping) =>
        Send(client, HttpMethod.Get, path, body: null, permission: permission);

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string? body,
        string permission = FormMapsPermissions.SchoolDataMapping)
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
                services.RemoveAll<IDataMappingsReader>();
                services.AddSingleton<IDataMappingsReader>(reader);
                services.RemoveAll<IDataMappingsWriter>();
                services.AddSingleton<IDataMappingsWriter>(writer);
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

    private sealed class FakeReader : IDataMappingsReader
    {
        public DataMappingsPage Page { get; set; } = new([], 0, 1, 20, 0);
        public int LastPage { get; private set; }
        public int LastLimit { get; private set; }
        public string? LastStatus { get; private set; }

        public Task<DataMappingsPage> ListAsync(
            RequestContext context, string schoolId, int page, int limit, long skip, string? status,
            CancellationToken cancellationToken = default)
        {
            LastPage = page;
            LastLimit = limit;
            LastStatus = status;
            return Task.FromResult(Page);
        }
    }

    private sealed class FakeWriter : IDataMappingsWriter
    {
        public DataMappingRow CreatedRow { get; set; } = new("id", "school-1", "EXT", null, "manual", "course",
            null, "manual", "approved", null, null, true, null, "2024-01-01T00:00:00.000Z", null,
            "2024-01-01T00:00:00.000Z");
        public int ApproveCount { get; set; }
        public string? LastApprovedBy { get; private set; }
        public IReadOnlyList<string>? LastIds { get; private set; }

        // updateDataMapping / deleteDataMapping outcomes: null / false = not-found (endpoint → 404).
        public string? UpdateResult { get; set; } = "m1";
        public bool DeleteResult { get; set; } = true;
        public string? LastUserId { get; private set; }
        public string? LastMappingId { get; private set; }
        public bool UpdateCalled { get; private set; }
        public bool DeleteCalled { get; private set; }

        public Task<DataMappingRow> CreateAsync(
            RequestContext context, string schoolId, JsonElement body, string approvedBy,
            CancellationToken cancellationToken = default)
        {
            LastApprovedBy = approvedBy;
            return Task.FromResult(CreatedRow);
        }

        public Task<int> BulkApproveAsync(
            RequestContext context, string schoolId, IReadOnlyList<string> ids, string approvedBy,
            CancellationToken cancellationToken = default)
        {
            LastIds = ids;
            LastApprovedBy = approvedBy;
            return Task.FromResult(ApproveCount);
        }

        public Task<string?> UpdateDataMappingAsync(
            RequestContext context, string schoolId, string userId, string mappingId, JsonElement body,
            CancellationToken cancellationToken = default)
        {
            UpdateCalled = true;
            LastUserId = userId;
            LastMappingId = mappingId;
            return Task.FromResult(UpdateResult);
        }

        public Task<bool> DeleteDataMappingAsync(
            RequestContext context, string schoolId, string mappingId, CancellationToken cancellationToken = default)
        {
            DeleteCalled = true;
            LastMappingId = mappingId;
            return Task.FromResult(DeleteResult);
        }
    }
}
