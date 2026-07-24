using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.IsamsWrites;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.IsamsWrites;

/// <summary>
/// Guard chain + HTTP mapping for the iSAMS configure write (FM-DOTNET-087; writer + scope faked — DB behavior is
/// proven by <see cref="IsamsConfigWriterTests"/>). Pins: anon → 401; missing school:manage → 403; no-school → 400
/// "No school"; malformed / top-level-primitive body → 500; the happy 200 { id, endpoint, configured:true } shape
/// (incl. a null endpoint echoed as null); and the writer's InvalidBody outcome → 500.
/// </summary>
public sealed class IsamsWriteEndpointsTests
{
    private const string Path = "/api/v1/school-admin/integrations/isams";
    private const string School = "school-1";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(Path, new { endpoint = "https://x" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Missing_school_manage_is_403()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JsonBody("""{"endpoint":"https://x"}"""), permission: FormMapsPermissions.AnalyticsSchool);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(null));
        using var client = factory.CreateClient();

        var response = await Send(client, JsonBody("""{"endpoint":"https://x"}"""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Malformed_body_is_500()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, new StringContent("{ not json", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Primitive_body_is_500()
    {
        using var factory = new Factory(new FakeWriter(), new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, new StringContent("5", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Happy_path_returns_200_with_id_endpoint_configured()
    {
        var writer = new FakeWriter { Result = new ConfigureIsamsResult(ConfigureIsamsStatus.Ok, "cfg-1", "https://x") };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JsonBody("""{"endpoint":"https://x"}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal(3, data.EnumerateObject().Count());
        Assert.Equal("cfg-1", data.GetProperty("id").GetString());
        Assert.Equal("https://x", data.GetProperty("endpoint").GetString());
        Assert.True(data.GetProperty("configured").GetBoolean());
    }

    [Fact]
    public async Task Null_endpoint_is_echoed_as_null()
    {
        var writer = new FakeWriter { Result = new ConfigureIsamsResult(ConfigureIsamsStatus.Ok, "cfg-1", null) };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JsonBody("{}"));

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("data").GetProperty("endpoint").ValueKind);
    }

    [Fact]
    public async Task Invalid_body_outcome_is_500()
    {
        var writer = new FakeWriter { Result = new ConfigureIsamsResult(ConfigureIsamsStatus.InvalidBody) };
        using var factory = new Factory(writer, new FakeScope(School));
        using var client = factory.CreateClient();

        var response = await Send(client, JsonBody("""{"authType":123}"""));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- helpers ----

    private static StringContent JsonBody(string json) => new(json, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpContent content, string permission = FormMapsPermissions.SchoolManage)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeWriter writer, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IIsamsConfigWriter>();
                services.AddSingleton<IIsamsConfigWriter>(writer);
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

    private sealed class FakeWriter : IIsamsConfigWriter
    {
        public ConfigureIsamsResult Result { get; init; } = new(ConfigureIsamsStatus.Ok, "cfg-1", "https://x");

        public Task<ConfigureIsamsResult> ConfigureAsync(
            RequestContext context, string schoolId, JsonElement body, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);
    }
}
