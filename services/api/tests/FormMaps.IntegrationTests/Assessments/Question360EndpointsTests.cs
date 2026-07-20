using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Assessments;

/// <summary>
/// Guard chain + HTTP mapping for the question360 read endpoints (reader faked; DB behavior in
/// Question360ReaderTests). Pins: anon → 401 on all five; the permission asymmetry (a caller WITHOUT
/// evaluations:manage gets 200 on /GetQuestions,/all,/category but 403 on /sub-questions,/:id; WITH it → 200
/// everywhere); /:id missing → 404 "Not found"; and the /GetQuestions rich envelope (message + count +
/// relationType echo, "all" when absent).
/// </summary>
public class Question360EndpointsTests
{
    private static readonly Question360Row Sample = new(
        "q-1", "EN", "ES", "collaboration", "peer", 1, false, null, true, null,
        "2025-03-01T00:00:00.000Z", null, "2025-03-01T00:00:00.000Z");

    [Theory]
    [InlineData("/api/question360/GetQuestions")]
    [InlineData("/api/question360/all")]
    [InlineData("/api/question360/category/leadership")]
    [InlineData("/api/question360/sub-questions/parent-1")]
    [InlineData("/api/question360/q-1")]
    public async Task Anonymous_is_401(string path)
    {
        using var factory = new Factory(new FakeReader());
        using var client = factory.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/question360/GetQuestions")]
    [InlineData("/api/question360/all")]
    [InlineData("/api/question360/category/leadership")]
    public async Task Auth_only_routes_allow_a_caller_without_manage(string path)
    {
        var reader = new FakeReader { Rows = [Sample] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path, permissions: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/question360/sub-questions/parent-1")]
    [InlineData("/api/question360/q-1")]
    public async Task Manage_routes_are_403_without_the_permission(string path)
    {
        var reader = new FakeReader { Rows = [Sample], Single = Sample };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path, permissions: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("missing_permission", doc.RootElement.GetProperty("code").GetString());
        Assert.Equal("Insufficient permissions", doc.RootElement.GetProperty("message").GetString());
        Assert.Null(reader.RequestedParent);   // reader never invoked
        Assert.Null(reader.RequestedId);
    }

    [Theory]
    [InlineData("/api/question360/sub-questions/parent-1")]
    [InlineData("/api/question360/q-1")]
    public async Task Manage_routes_allow_a_caller_with_the_permission(string path)
    {
        var reader = new FakeReader { Rows = [Sample], Single = Sample };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path, permissions: FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetById_missing_is_404_not_found()
    {
        var reader = new FakeReader { Single = null };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/question360/missing", permissions: FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task GetQuestions_rich_envelope_echoes_all_when_relationType_absent()
    {
        var reader = new FakeReader { Rows = [Sample] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/question360/GetQuestions", permissions: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("Questions retrieved", root.GetProperty("message").GetString());
        Assert.Equal(1, root.GetProperty("count").GetInt32());
        Assert.Equal("all", root.GetProperty("relationType").GetString());   // no filter -> echo "all"
        Assert.Equal(1, root.GetProperty("data").GetArrayLength());
        Assert.Equal("q-1", root.GetProperty("data")[0].GetProperty("id").GetString()); // camelCase key
        Assert.Null(reader.RequestedRelationType);                            // null filter passed to reader
    }

    [Fact]
    public async Task GetQuestions_passes_and_echoes_the_relationType_filter()
    {
        var reader = new FakeReader { Rows = [Sample] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/question360/GetQuestions?relationType=peer", permissions: FormMapsPermissions.ProfileRead);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("peer", doc.RootElement.GetProperty("relationType").GetString());
        Assert.Equal("peer", reader.RequestedRelationType);
    }

    [Theory]
    [InlineData("/api/question360/all", FormMapsPermissions.ProfileRead)]
    [InlineData("/api/question360/category/leadership", FormMapsPermissions.ProfileRead)]
    [InlineData("/api/question360/sub-questions/parent-1", FormMapsPermissions.EvaluationsManage)]
    public async Task List_routes_return_the_bare_success_data_envelope(string path, string permissions)
    {
        var reader = new FakeReader { Rows = [Sample] };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, path, permissions: permissions);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Array, root.GetProperty("data").ValueKind);
        Assert.Equal(1, root.GetProperty("data").GetArrayLength());
        Assert.Equal("q-1", root.GetProperty("data")[0].GetProperty("id").GetString());
        // bare envelope: the rich /GetQuestions-only keys must NOT leak onto these routes
        Assert.False(root.TryGetProperty("message", out _));
        Assert.False(root.TryGetProperty("count", out _));
        Assert.False(root.TryGetProperty("relationType", out _));
    }

    [Fact]
    public async Task GetById_present_returns_bare_success_data_object()
    {
        var reader = new FakeReader { Single = Sample };
        using var factory = new Factory(reader);
        using var client = factory.CreateClient();

        var response = await Send(client, "/api/question360/q-1", permissions: FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal(JsonValueKind.Object, root.GetProperty("data").ValueKind);   // single object, not array
        Assert.Equal("q-1", root.GetProperty("data").GetProperty("id").GetString());
        Assert.False(root.TryGetProperty("message", out _));
        Assert.False(root.TryGetProperty("count", out _));
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string permissions)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-123");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "school_admin");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "a@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IQuestion360Reader>();
                services.AddSingleton<IQuestion360Reader>(reader);
            });
        }
    }

    private sealed class FakeReader : IQuestion360Reader
    {
        public IReadOnlyList<Question360Row> Rows { get; init; } = [];

        public Question360Row? Single { get; init; }

        public string? RequestedRelationType { get; private set; }

        public string? RequestedParent { get; private set; }

        public string? RequestedId { get; private set; }

        public Task<IReadOnlyList<Question360Row>> ListAsync(
            RequestContext context, string? relationType, CancellationToken cancellationToken = default)
        {
            RequestedRelationType = relationType;
            return Task.FromResult(Rows);
        }

        public Task<IReadOnlyList<Question360Row>> ListByCategoryAsync(
            RequestContext context, string category, CancellationToken cancellationToken = default) =>
            Task.FromResult(Rows);

        public Task<IReadOnlyList<Question360Row>> ListByParentAsync(
            RequestContext context, string parentQuestionId, CancellationToken cancellationToken = default)
        {
            RequestedParent = parentQuestionId;
            return Task.FromResult(Rows);
        }

        public Task<Question360Row?> GetByIdAsync(
            RequestContext context, string id, CancellationToken cancellationToken = default)
        {
            RequestedId = id;
            return Task.FromResult(Single);
        }
    }
}
