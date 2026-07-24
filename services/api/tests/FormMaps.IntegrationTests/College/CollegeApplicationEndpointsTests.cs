using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.College;
using FormMaps.Application.StudentApplications;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.College;

/// <summary>
/// Guard + access-collapse + validation + create/update resolution + result mapping for the college applications CRUD
/// (FM-DOTNET-081; resolver + repo faked). Pins: anonymous → 401; access-fail → uniform 404 "Not found"; PUT/DELETE
/// missing-app → 404 "Application not found" (distinct); POST 400 required + statusToColumn mapping + invalid-enum/
/// non-string/bad-date → 500; PUT deferred type-500 past the 404 gates; DELETE → { success:true }; malformed/primitive
/// body → 500.
/// </summary>
public class CollegeApplicationEndpointsTests
{
    private const string ListPath = "/api/v1/college/students/stu-1/applications";
    private const string ItemPath = "/api/v1/college/applications/app1";

    [Theory]
    [InlineData(ListPath, "GET")]
    [InlineData(ListPath, "POST")]
    [InlineData(ItemPath, "PUT")]
    [InlineData(ItemPath, "DELETE")]
    public async Task Anonymous_is_401(string path, string method)
    {
        using var factory = new Factory(new FakeResolver(), new FakeRepo());
        using var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    [Fact]
    public async Task List_access_denied_is_uniform_404_not_found()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo(), HttpMethod.Get, ListPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task List_returns_rows()
    {
        var repo = new FakeRepo { List = [Listed("a1"), Listed("a2")] };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Get, ListPath);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, doc.RootElement.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task Create_requires_collegeName_or_universityId()
    {
        var response = await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"appStatus":"applying"}""");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("collegeName or universityId required", await Message(response));
    }

    [Fact]
    public async Task Create_access_denied_is_404_before_required_check()
    {
        // access is checked before the required-field 400 (college.ts order). Body present but inaccessible → 404.
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo(), HttpMethod.Post, ListPath, """{"collegeName":"X"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Theory]
    [InlineData("submitted", "applied")]
    [InlineData("accepted", "accepted")]
    [InlineData("rejected", "applied")]
    [InlineData("waitlisted", "applied")]
    public async Task Create_maps_appStatus_to_column(string appStatus, string expectedColumn)
    {
        var repo = new FakeRepo();
        var response = await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath,
            $$"""{"collegeName":"MIT","appStatus":"{{appStatus}}"}""");
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(appStatus, repo.LastCreate!.AppStatus);
        Assert.Equal(expectedColumn, repo.LastCreate.Column);
    }

    [Fact]
    public async Task Create_defaults_and_deferred_type_and_bad_inputs_500()
    {
        // No appStatus → stored "researching"/column "researching".
        var repo = new FakeRepo();
        Assert.Equal(HttpStatusCode.Created,
            (await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath, """{"universityId":"u1"}""")).StatusCode);
        Assert.Equal("researching", repo.LastCreate!.AppStatus);
        Assert.Equal("researching", repo.LastCreate.Column);
        Assert.Equal("u1", repo.LastCreate.UniversityId);

        // Invalid appStatus enum → 500.
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"collegeName":"X","appStatus":"shortlisted"}""")).StatusCode);
        // Truthy non-string collegeName → 500 (passes the required check, fails the type check).
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"collegeName":5}""")).StatusCode);
        // Unparseable deadlineDate → 500.
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, """{"collegeName":"X","deadlineDate":"not-a-date"}""")).StatusCode);
    }

    [Fact]
    public async Task Create_falsy_deadlineDate_is_null_not_error()
    {
        var repo = new FakeRepo();
        // deadlineDate:"" is falsy → applicationDeadline null (not a 500).
        Assert.Equal(HttpStatusCode.Created,
            (await Send(new FakeResolver(), repo, HttpMethod.Post, ListPath, """{"collegeName":"X","deadlineDate":""}""")).StatusCode);
        Assert.Null(repo.LastCreate!.ApplicationDeadline);
    }

    [Fact]
    public async Task Create_malformed_and_primitive_body_500()
    {
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, "{bad json")).StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError,
            (await Send(new FakeResolver(), new FakeRepo(), HttpMethod.Post, ListPath, "42")).StatusCode);
    }

    [Fact]
    public async Task Update_missing_app_is_application_not_found()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Put, ItemPath, """{"notes":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Application not found", await Message(response)); // distinct from access 404
    }

    [Fact]
    public async Task Update_access_denied_is_not_found()
    {
        var response = await Send(new FakeResolver { Access = false }, new FakeRepo { Owner = "stu-1" }, HttpMethod.Put, ItemPath, """{"notes":"x"}""");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Not found", await Message(response));
    }

    [Fact]
    public async Task Update_deferred_type_500_after_gates()
    {
        // Owner present + access ok, but invalid appStatus enum → 500 (deferred past the existence + access 404s).
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Put, ItemPath, """{"appStatus":"bogus"}""");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Update_ok_forwards_fields_and_column_sync()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Put, ItemPath, """{"appStatus":"accepted","deadlineType":null}""");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(repo.LastFields!.HasAppStatus);
        Assert.Equal("accepted", repo.LastFields.AppStatus);
        Assert.True(repo.LastFields.ColumnSync);
        Assert.Equal("accepted", repo.LastFields.Column);
        Assert.True(repo.LastFields.HasDeadlineType);
        Assert.True(repo.LastFields.DeadlineTypeIsNull); // present null → set NULL
    }

    [Fact]
    public async Task Delete_ok_returns_success_only()
    {
        var repo = new FakeRepo { Owner = "stu-1" };
        var response = await Send(new FakeResolver(), repo, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.False(doc.RootElement.TryGetProperty("data", out _)); // { success:true } only — no data
    }

    [Fact]
    public async Task Delete_missing_app_is_application_not_found()
    {
        var response = await Send(new FakeResolver(), new FakeRepo { Owner = null }, HttpMethod.Delete, ItemPath);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Application not found", await Message(response));
    }

    // ---- helpers ----

    private static ApplicationListRow Listed(string id) =>
        new(id, "College", null, "researching", "researching", null, null, null, null, "2026-01-01T00:00:00.000Z", 0, 0);

    private static ApplicationRow FullRow(string id) => new(
        id, "stu-1", "Name", "college", null, null, null, null, "researching", null, null, null, null,
        true, null, "2026-01-01T00:00:00.000Z", null, "2026-01-01T00:00:00.000Z", "researching");

    private static async Task<string?> Message(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
    }

    private static Task<HttpResponseMessage> Send(
        FakeResolver resolver, FakeRepo repo, HttpMethod method, string path, string? body = null)
    {
        // NOT `using` — the factory must outlive the returned Task (the caller awaits + reads content); disposing it
        // here would tear down the TestServer mid-request.
        var factory = new Factory(resolver, repo);
        var client = factory.CreateClient();
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "c@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Caller");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(FakeResolver resolver, FakeRepo repo) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICollegeAccessResolver>();
                services.RemoveAll<ICollegeApplicationsRepository>();
                services.AddSingleton<ICollegeAccessResolver>(resolver);
                services.AddSingleton<ICollegeApplicationsRepository>(repo);
            });
        }
    }

    private sealed class FakeResolver : ICollegeAccessResolver
    {
        public bool Access { get; init; } = true;

        public Task<bool> CanAccessAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(Access);
    }

    private sealed class FakeRepo : ICollegeApplicationsRepository
    {
        public IReadOnlyList<ApplicationListRow> List { get; init; } = [];
        public string? Owner { get; init; } = "stu-1";

        public CollegeCreateInput? LastCreate { get; private set; }
        public CollegeUpdateFields? LastFields { get; private set; }

        public Task<IReadOnlyList<ApplicationListRow>> ListAsync(RequestContext context, string studentId, CancellationToken ct = default) =>
            Task.FromResult(List);

        public Task<ApplicationRow> CreateAsync(RequestContext context, string callerId, CollegeCreateInput input, CancellationToken ct = default)
        {
            LastCreate = input;
            return Task.FromResult(FullRow("created"));
        }

        public Task<string?> FindActiveOwnerAsync(RequestContext context, string id, CancellationToken ct = default) =>
            Task.FromResult(Owner);

        public Task<ApplicationRow> ApplyUpdateAsync(RequestContext context, string callerId, string id, CollegeUpdateFields fields, CancellationToken ct = default)
        {
            LastFields = fields;
            return Task.FromResult(FullRow(id));
        }

        public Task SoftDeleteAsync(RequestContext context, string callerId, string id, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
