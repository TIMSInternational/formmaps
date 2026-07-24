using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.CommunityService;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.CommunityService;

/// <summary>
/// Guard + validation + result mapping for the student community-service CRUD (FM-DOTNET-075; repo faked). Pins:
/// anonymous → 401; GET { data, totalHours, totalHoursRequired } envelope; POST 201 + zod-400 + NoSchool → 400 "No
/// school" + malformed/primitive → 500; PUT zod-400 + 404 "Not found" + 200; DELETE 404 + 200 { data:null }.
/// </summary>
public class CommunityServiceEndpointsTests
{
    private const string ListPath = "/api/v1/student/community-service";
    private const string ItemPath = "/api/v1/student/community-service/cs1";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(ListPath, "POST")]
    [InlineData(ItemPath, "PUT")]
    [InlineData(ItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task Get_envelope_shape()
    {
        var repo = new FakeRepo { List = new CommunityServiceList([SampleRow("cs1")], 12.5, 40) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("data").GetArrayLength());
        Assert.Equal(12.5, data.GetProperty("totalHours").GetDouble());
        Assert.Equal(40, data.GetProperty("totalHoursRequired").GetInt32());
    }

    [Fact]
    public async Task Post_valid_returns_201()
    {
        var repo = new FakeRepo { Create = new CreateCommunityServiceResult(false, SampleRow("cs1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"organization":"Red Cross","hours":8,"date":"2020-01-01"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Post_no_school_is_400()
    {
        var repo = new FakeRepo { Create = new CreateCommunityServiceResult(true, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"organization":"Red Cross","hours":8,"date":"2020-01-01"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("""{}""", "Required")]
    [InlineData("""{"organization":"o","hours":8,"date":"2099-01-01"}""", "Date must be a valid, non-future date")]
    public async Task Post_validation_400(string body, string message)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("{\"a\":")]
    [InlineData("5")]
    public async Task Post_malformed_or_primitive_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.InternalServerError, (await Send(client, HttpMethod.Post, ListPath, body: body)).StatusCode);
    }

    [Fact]
    public async Task Put_empty_body_is_400_at_least_one()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: "{}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("At least one field is required", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_not_found_is_404()
    {
        var repo = new FakeRepo { Update = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"hours":5}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Put_ok_returns_row()
    {
        var repo = new FakeRepo { Update = SampleRow("cs1") };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"hours":5}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("cs1", doc.RootElement.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Delete_ok_returns_null_data()
    {
        var repo = new FakeRepo { Delete = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").ValueKind);
    }

    [Fact]
    public async Task Delete_not_found_is_404()
    {
        var repo = new FakeRepo { Delete = false };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await Send(client, HttpMethod.Delete, ItemPath)).StatusCode);
    }

    // ---- helpers ----

    private static CommunityServiceRow SampleRow(string id) => new(
        id, "student-1", "school-1", "Red Cross", null, "8", "2026-06-01T00:00:00.000Z", null, null, "pending",
        null, null, null, true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "student-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.Student);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICommunityServiceRepository>();
                services.AddSingleton<ICommunityServiceRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : ICommunityServiceRepository
    {
        public CommunityServiceList List { get; init; } = new([], 0, 0);
        public CreateCommunityServiceResult Create { get; init; } = new(false, SampleRow("cs1"));
        public CommunityServiceRow? Update { get; init; } = SampleRow("cs1");
        public bool Delete { get; init; } = true;

        public Task<CommunityServiceList> GetListAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<CreateCommunityServiceResult> CreateAsync(RequestContext context, string studentId, CommunityServiceCreateInput input, CancellationToken ct = default) =>
            Task.FromResult(Create);

        public Task<CommunityServiceRow?> UpdateAsync(RequestContext context, string studentId, string id, CommunityServicePatch patch, CancellationToken ct = default) =>
            Task.FromResult(Update);

        public Task<bool> SoftDeleteAsync(RequestContext context, string studentId, string id, CancellationToken ct = default) =>
            Task.FromResult(Delete);
    }
}
