using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
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
/// Guard chain + HTTP mapping for the question360 WRITE endpoints (writer faked; DB behavior in
/// Question360WriterTests). Pins: anon → 401 on all six; the evaluations:manage gate → 403 (writer not invoked);
/// POST 201 / validation 400; PUT 200 / missing → 500 (legacy P2025, NOT 404); DELETE 200 {success:true} no data,
/// child-guard 400, missing 500; bulk-create non-array → 400 "Array required" and the report envelope.
/// </summary>
public sealed class Question360WriteEndpointsTests
{
    private static readonly Question360Row Sample = new(
        "q-1", "EN", "ES", "collaboration", "peer", 1, false, null, true, null,
        "2025-03-01T00:00:00.000Z", null, "2025-03-01T00:00:00.000Z");

    [Theory]
    [InlineData("POST", "/api/question360")]
    [InlineData("POST", "/api/question360/bulk-create")]
    [InlineData("PUT", "/api/question360/q-1")]
    [InlineData("PUT", "/api/question360/q-1/activate")]
    [InlineData("PUT", "/api/question360/q-1/deactivate")]
    [InlineData("DELETE", "/api/question360/q-1")]
    public async Task Anonymous_is_401(string method, string path)
    {
        using var factory = new Factory(new FakeWriter());
        using var client = factory.CreateClient();

        var response = await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Create_without_manage_is_403_and_does_not_invoke_the_writer()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/question360", FormMapsPermissions.ProfileRead, """{"x":1}""");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.False(writer.Invoked);
    }

    [Fact]
    public async Task Create_returns_201_with_data()
    {
        var writer = new FakeWriter { CreateOutcome = new Question360WriteOutcome(Question360WriteStatus.Created, Sample, null) };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/question360", FormMapsPermissions.EvaluationsManage, "{}");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var root = await Root(response);
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("q-1", root.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Create_validation_error_is_400_with_message()
    {
        var writer = new FakeWriter { CreateOutcome = new Question360WriteOutcome(Question360WriteStatus.ValidationError, null, "Required") };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/question360", FormMapsPermissions.EvaluationsManage, "{}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Required", (await Root(response)).GetProperty("message").GetString());
    }

    [Fact]
    public async Task Update_success_is_200_with_data()
    {
        var writer = new FakeWriter { UpdateOutcome = new Question360WriteOutcome(Question360WriteStatus.Ok, Sample, null) };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, "/api/question360/q-1", FormMapsPermissions.EvaluationsManage, """{"category":"c"}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = await Root(response);
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.Equal("q-1", root.GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task Update_missing_id_is_500_not_404()
    {
        var writer = new FakeWriter { UpdateOutcome = new Question360WriteOutcome(Question360WriteStatus.Missing, null, null) };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, "/api/question360/gone", FormMapsPermissions.EvaluationsManage, "{}");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("Internal server error", (await Root(response)).GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_success_is_200_success_true_with_no_data()
    {
        var writer = new FakeWriter { DeleteStatus = Question360DeleteStatus.Deleted };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, "/api/question360/q-1", FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = await Root(response);
        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.False(root.TryGetProperty("data", out _)); // DELETE envelope has NO data key
    }

    [Fact]
    public async Task Delete_child_guard_is_400_with_exact_message()
    {
        var writer = new FakeWriter { DeleteStatus = Question360DeleteStatus.ChildGuard };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, "/api/question360/q-1", FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Cannot delete: has active sub-questions", (await Root(response)).GetProperty("message").GetString());
    }

    [Fact]
    public async Task Delete_missing_is_500()
    {
        var writer = new FakeWriter { DeleteStatus = Question360DeleteStatus.Missing };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, "/api/question360/gone", FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Activate_returns_200_data()
    {
        var writer = new FakeWriter { SetActiveOutcome = new Question360WriteOutcome(Question360WriteStatus.Ok, Sample, null) };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, "/api/question360/q-1/activate", FormMapsPermissions.EvaluationsManage);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("q-1", (await Root(response)).GetProperty("data").GetProperty("id").GetString());
    }

    [Fact]
    public async Task BulkCreate_non_array_body_is_400_array_required()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/question360/bulk-create", FormMapsPermissions.EvaluationsManage, "{}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Array required", (await Root(response)).GetProperty("message").GetString());
        Assert.False(writer.Invoked);
    }

    [Fact]
    public async Task BulkCreate_array_returns_200_report()
    {
        var errors = new List<JsonObject> { new() { ["error"] = "Duplicate question" } };
        var writer = new FakeWriter { BulkResult = new Question360BulkResult(2, 3, errors) };
        using var factory = new Factory(writer);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, "/api/question360/bulk-create", FormMapsPermissions.EvaluationsManage, "[{},{},{}]");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = (await Root(response)).GetProperty("data");
        Assert.Equal(2, data.GetProperty("createdCount").GetInt32());
        Assert.Equal(3, data.GetProperty("totalRequested").GetInt32());
        Assert.Equal("Duplicate question", data.GetProperty("errors")[0].GetProperty("error").GetString());
    }

    // ---- helpers ----

    private static async Task<JsonElement> Root(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string permissions, string? json = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "admin-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "school_admin");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "a@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Admin");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, permissions);
        if (json is not null)
        {
            request.Content = JsonContent.Create(JsonDocument.Parse(json).RootElement);
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeWriter writer) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IQuestion360Writer>();
                services.AddSingleton<IQuestion360Writer>(writer);
            });
        }
    }

    private sealed class FakeWriter : IQuestion360Writer
    {
        public bool Invoked { get; private set; }

        public Question360WriteOutcome CreateOutcome { get; init; } = new(Question360WriteStatus.Created, Sample, null);

        public Question360WriteOutcome UpdateOutcome { get; init; } = new(Question360WriteStatus.Ok, Sample, null);

        public Question360WriteOutcome SetActiveOutcome { get; init; } = new(Question360WriteStatus.Ok, Sample, null);

        public Question360DeleteStatus DeleteStatus { get; init; } = Question360DeleteStatus.Deleted;

        public Question360BulkResult BulkResult { get; init; } = new(0, 0, []);

        public Task<Question360WriteOutcome> CreateAsync(RequestContext context, JsonElement body, CancellationToken cancellationToken = default)
        {
            Invoked = true;
            return Task.FromResult(CreateOutcome);
        }

        public Task<Question360WriteOutcome> UpdateAsync(RequestContext context, string id, JsonElement body, CancellationToken cancellationToken = default)
        {
            Invoked = true;
            return Task.FromResult(UpdateOutcome);
        }

        public Task<Question360WriteOutcome> SetActiveAsync(RequestContext context, string id, bool isActive, CancellationToken cancellationToken = default)
        {
            Invoked = true;
            return Task.FromResult(SetActiveOutcome);
        }

        public Task<Question360DeleteStatus> DeleteAsync(RequestContext context, string id, CancellationToken cancellationToken = default)
        {
            Invoked = true;
            return Task.FromResult(DeleteStatus);
        }

        public Task<Question360BulkResult> BulkCreateAsync(RequestContext context, JsonElement array, CancellationToken cancellationToken = default)
        {
            Invoked = true;
            return Task.FromResult(BulkResult);
        }
    }
}
