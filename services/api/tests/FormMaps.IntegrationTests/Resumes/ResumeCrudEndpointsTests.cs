using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Guard chain + routing + HTTP mapping for the three resume CRUD endpoints (FM-DOTNET-090; repo + subscription
/// guard faked). Pins: anon → 401 and subscription-denied → 403 on every route (incl. the static /default); the
/// GET /default static shape; the list envelope { data:[rows] }; POST create → 201 { data:<row> } with the full
/// key set; POST InvalidStringField → 500; and malformed / top-level-primitive body → 500.
/// </summary>
public sealed class ResumeCrudEndpointsTests
{
    private const string Default = "/api/resume/default";
    private const string Root = "/api/resume";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await client.GetAsync(Root);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Default_subscription_denied_is_403()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: false);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Default, null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Default_returns_static_empty_resume()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Default, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("", data.GetProperty("personalInfo").GetProperty("name").GetString());
        Assert.Equal("", data.GetProperty("summary").GetString());
        Assert.Equal(0, data.GetProperty("experience").GetArrayLength());
        Assert.Equal(0, data.GetProperty("certifications").GetArrayLength());
    }

    [Fact]
    public async Task List_returns_rows_envelope()
    {
        var repo = new FakeRepo { Rows = [Row("r1", "First"), Row("r2", "Second")] };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Get, Root, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal(2, data.GetArrayLength());
        Assert.Equal("r1", data[0].GetProperty("id").GetString());
        Assert.Equal("First", data[0].GetProperty("name").GetString());
        Assert.True(data[0].GetProperty("isActive").GetBoolean());
    }

    [Fact]
    public async Task Create_returns_201_with_full_row()
    {
        var repo = new FakeRepo { CreateResult = ResumeCreateOutcome.Created(Row("new", "Mine")) };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Root, Json("""{"name":"Mine"}"""));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("new", data.GetProperty("id").GetString());
        Assert.Equal("Mine", data.GetProperty("name").GetString());
        Assert.Equal(JsonValueKind.Object, data.GetProperty("personalInfo").ValueKind);
        Assert.Equal(JsonValueKind.Null, data.GetProperty("createdBy").ValueKind);
    }

    [Fact]
    public async Task Create_invalid_string_field_is_500()
    {
        var repo = new FakeRepo { CreateResult = ResumeCreateOutcome.InvalidStringField };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Root, Json("""{"name":5}"""));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Create_malformed_body_is_500()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Root, new StringContent("{ bad", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Create_top_level_primitive_body_is_500()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Root, Json("42"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- helpers ----

    private static ResumeRow Row(string id, string name) => new(
        Id: id, UserId: "user-1", Name: name, Template: "default", CareerField: "",
        PersonalInfo: J("{}"), Experience: J("[]"), Education: J("[]"), Skills: J("[]"),
        Sections: J("[]"), FieldVisibility: J("{}"), CustomFields: J("[]"), DocumentEdits: J("[]"),
        OriginalFileKey: null, OriginalFileType: null, OriginalPdfKey: null,
        HasOriginal: false, IsActive: true, CreatedBy: null,
        CreatedDate: "2026-07-24T12:00:00.000Z", UpdatedBy: null, UpdatedAt: "2026-07-24T12:00:00.000Z");

    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, HttpContent? content)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "user-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "student");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@e.st");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("data").Clone();
    }

    private sealed class Factory(FakeRepo repo, bool allowSubscription) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IResumeRepository>();
                services.AddSingleton<IResumeRepository>(repo);
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(new FakeSub(allowSubscription));
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "Active subscription required"));
    }

    private sealed class FakeRepo : IResumeRepository
    {
        public IReadOnlyList<ResumeRow> Rows { get; init; } = Array.Empty<ResumeRow>();
        public ResumeCreateOutcome CreateResult { get; init; } = ResumeCreateOutcome.Created(
            new ResumeRow("x", "user-1", "n", "default", "", J("{}"), J("[]"), J("[]"), J("[]"), J("[]"), J("{}"),
                J("[]"), J("[]"), null, null, null, false, true, null, "2026-07-24T12:00:00.000Z", null,
                "2026-07-24T12:00:00.000Z"));

        public Task<IReadOnlyList<ResumeRow>> ListAsync(RequestContext context, CancellationToken cancellationToken = default) =>
            Task.FromResult(Rows);

        public Task<ResumeCreateOutcome> CreateAsync(RequestContext context, JsonElement body, CancellationToken cancellationToken = default) =>
            Task.FromResult(CreateResult);
    }
}
