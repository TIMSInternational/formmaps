using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.StudentApplications;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.StudentApplications;

/// <summary>
/// Guard + validation + PUT raw-body-resolution + result mapping for the student applications core CRUD
/// (FM-DOTNET-074; repo faked). Pins: anonymous → 401; list/deadlines/get shapes + get 404 "Application not found";
/// POST 201 + zod-400 (first message) + matchScore-float → 500 + malformed/primitive → 500 + array → "Expected object,
/// received array"; PUT NotFound → 404, InvalidBody → 500, Ok → 200, array-body → empty valid update; DELETE 404 + 200
/// { deleted:true }.
/// </summary>
public class StudentApplicationEndpointsTests
{
    private const string ListPath = "/api/v1/student/applications";
    private const string DeadlinesPath = "/api/v1/student/applications/deadlines";
    private const string ItemPath = "/api/v1/student/applications/app1";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(DeadlinesPath, "GET")]
    [InlineData(ItemPath, "GET")]
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
    public async Task Get_not_found_is_404()
    {
        var repo = new FakeRepo { Get = null };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ItemPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Application not found", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task List_returns_rows()
    {
        var repo = new FakeRepo { List = [SampleRow("app1"), SampleRow("app2")] };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, ListPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Post_valid_returns_201()
    {
        var repo = new FakeRepo();
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"name":"MIT","matchScore":92}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("MIT", repo.LastCreate!.Name);
        Assert.Equal(92, repo.LastCreate.MatchScore);
        Assert.Equal("university", repo.LastCreate.Type);       // default
        Assert.Equal("researching", repo.LastCreate.Column);    // default
    }

    [Theory]
    [InlineData("""{}""", "Required")]
    [InlineData("""{"name":""}""", "String must contain at least 1 character(s)")]
    [InlineData("[]", "Expected object, received array")]
    public async Task Post_validation_400(string body, string message)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: body);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(message, doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Post_non_integer_matchScore_is_500()
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        // 85.5 passes zod (0-100) but 500s at the Int column.
        var response = await Send(client, HttpMethod.Post, ListPath, body: """{"name":"n","matchScore":85.5}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Theory]
    [InlineData("{\"a\":")]  // malformed
    [InlineData("5")]        // primitive
    public async Task Post_malformed_or_primitive_is_500(string body)
    {
        using var factory = new Factory(new FakeRepo());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Post, ListPath, body: body);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_not_found_is_404()
    {
        var repo = new FakeRepo { Update = new ApplicationUpdateResult(ApplicationUpdateOutcome.NotFound, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"name":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Put_invalid_body_type_is_500_and_flags_invalid()
    {
        var repo = new FakeRepo { Update = new ApplicationUpdateResult(ApplicationUpdateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"name":5}""");
        Assert.False(repo.LastFieldsValid); // non-string name flagged
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_ok_returns_row_and_forwards_present_fields()
    {
        var repo = new FakeRepo { Update = new ApplicationUpdateResult(ApplicationUpdateOutcome.Ok, SampleRow("app1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"column":"applied","matchScore":null}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastFieldsValid);
        Assert.True(repo.LastFields!.HasColumn);
        Assert.Equal("applied", repo.LastFields.Column);
        Assert.True(repo.LastFields.HasMatchScore);
        Assert.True(repo.LastFields.MatchScoreIsNull);  // present null → set NULL
        Assert.False(repo.LastFields.HasName);
    }

    [Fact]
    public async Task Put_matchScore_out_of_int32_range_is_invalid()
    {
        // 3_000_000_000 is a whole number but overflows int4 → Prisma/Postgres 500 in Node; must flag invalid (not
        // silently wrap-and-write). Repo faked, so we assert the endpoint flagged it invalid → InvalidBody → 500.
        var repo = new FakeRepo { Update = new ApplicationUpdateResult(ApplicationUpdateOutcome.InvalidBody, null) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: """{"matchScore":3000000000}""");
        Assert.False(repo.LastFieldsValid);
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Put_array_body_is_empty_valid_update()
    {
        var repo = new FakeRepo { Update = new ApplicationUpdateResult(ApplicationUpdateOutcome.Ok, SampleRow("app1")) };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, ItemPath, body: "[]");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); // array → no keys → empty update
        Assert.True(repo.LastFieldsValid);
        Assert.False(repo.LastFields!.HasName);
        Assert.False(repo.LastFields.HasColumn);
    }

    [Fact]
    public async Task Delete_ok_returns_deleted_true()
    {
        var repo = new FakeRepo { Delete = true };
        using var factory = new Factory(repo);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("data").GetProperty("deleted").GetBoolean());
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

    private static ApplicationRow SampleRow(string id) => new(
        id, "student-1", "Name", "university", null, null, null, null, "researching", null, null, null, null,
        true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z", "researching");

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
                services.RemoveAll<IStudentApplicationRepository>();
                services.AddSingleton<IStudentApplicationRepository>(repo);
            });
        }
    }

    private sealed class FakeRepo : IStudentApplicationRepository
    {
        public IReadOnlyList<ApplicationRow> List { get; init; } = [];
        public ApplicationRow? Get { get; init; } = SampleRow("app1");
        public ApplicationUpdateResult Update { get; init; } = new(ApplicationUpdateOutcome.Ok, SampleRow("app1"));
        public bool Delete { get; init; } = true;

        public CreateApplicationInput? LastCreate { get; private set; }
        public bool LastFieldsValid { get; private set; }
        public ApplicationUpdateFields? LastFields { get; private set; }

        public Task<IReadOnlyList<ApplicationRow>> ListAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<IReadOnlyList<ApplicationRow>> ListDeadlinesAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<ApplicationRow?> GetAsync(RequestContext context, string studentId, string id, CancellationToken ct = default) =>
            Task.FromResult(Get);

        public Task<ApplicationRow> CreateAsync(RequestContext context, string studentId, CreateApplicationInput input, CancellationToken ct = default)
        {
            LastCreate = input;
            return Task.FromResult(SampleRow("app1"));
        }

        public Task<ApplicationUpdateResult> UpdateAsync(RequestContext context, string studentId, string id, bool fieldsValid, ApplicationUpdateFields fields, CancellationToken ct = default)
        {
            LastFieldsValid = fieldsValid;
            LastFields = fields;
            return Task.FromResult(Update);
        }

        public Task<bool> SoftDeleteAsync(RequestContext context, string studentId, string id, CancellationToken ct = default) =>
            Task.FromResult(Delete);
    }
}
