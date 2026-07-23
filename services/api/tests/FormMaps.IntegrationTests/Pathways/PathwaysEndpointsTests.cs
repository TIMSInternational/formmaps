using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Pathways;
using FormMaps.Application.SchoolAdmin;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Pathways;

/// <summary>
/// Guard chain + HTTP mapping for the single derived-pathways endpoint (FM-DOTNET-058); reader faked (DB behavior is
/// proven by PathwaysReaderTests + the pure PathwaysComputerTests). Pins: anon→401, wrong-permission→403, no-school→400
/// "No school", and the exact wire shape { success, data:{ truncated, groups:[{ department, chains:[[{ courseId, code,
/// name, isHonors }]] }] } }.
/// </summary>
public class PathwaysEndpointsTests
{
    private const string School = "school-1";
    private const string Path = "/api/v1/school-admin/courses/pathways";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync(Path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Wrong_permission_is_403()
    {
        using var factory = Factory();
        using var client = factory.CreateClient();
        var response = await Send(client, FormMapsPermissions.SchoolManage);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task No_school_is_400()
    {
        using var factory = Factory(scope: new FakeScope(null));
        using var client = factory.CreateClient();
        var response = await Send(client, FormMapsPermissions.CurriculumManage);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No school", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Success_wire_shape()
    {
        var reader = new FakeReader
        {
            Result = new PathwaysResult(
                Truncated: true,
                Groups:
                [
                    new PathwayGroup("Mathematics",
                    [
                        [new PathwayNode("id-a", "ALG1", "Algebra 1", false), new PathwayNode("id-b", "ALG2", "Algebra 2", true)],
                    ]),
                ])
        };
        using var factory = Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, FormMapsPermissions.CurriculumManage);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.True(data.GetProperty("truncated").GetBoolean());

        var group = data.GetProperty("groups")[0];
        Assert.Equal("Mathematics", group.GetProperty("department").GetString());

        var node0 = group.GetProperty("chains")[0][0];
        Assert.Equal("id-a", node0.GetProperty("courseId").GetString());
        Assert.Equal("ALG1", node0.GetProperty("code").GetString());
        Assert.Equal("Algebra 1", node0.GetProperty("name").GetString());
        Assert.False(node0.GetProperty("isHonors").GetBoolean());

        var node1 = group.GetProperty("chains")[0][1];
        Assert.Equal("ALG2", node1.GetProperty("code").GetString());
        Assert.True(node1.GetProperty("isHonors").GetBoolean());
    }

    [Fact]
    public async Task Empty_result_is_200_empty_groups()
    {
        using var factory = Factory(new FakeReader { Result = new PathwaysResult(false, []) });
        using var client = factory.CreateClient();
        var response = await Send(client, FormMapsPermissions.CurriculumManage);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("data").GetProperty("truncated").GetBoolean());
        Assert.Equal(0, doc.RootElement.GetProperty("data").GetProperty("groups").GetArrayLength());
    }

    // ---- helpers ----

    private static Factory_ Factory(FakeReader? reader = null, FakeScope? scope = null) =>
        new(reader ?? new FakeReader(), scope ?? new FakeScope(School));

    private static Task<HttpResponseMessage> Send(HttpClient client, string permission)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, Path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "admin@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permission);
        return client.SendAsync(request);
    }

    private sealed class Factory_(FakeReader reader, FakeScope scope) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPathwaysReader>();
                services.AddSingleton<IPathwaysReader>(reader);
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

    private sealed class FakeReader : IPathwaysReader
    {
        public PathwaysResult Result { get; set; } = new(false, []);

        public Task<PathwaysResult> ComputePathwaysAsync(
            RequestContext context, string schoolId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);
    }
}
