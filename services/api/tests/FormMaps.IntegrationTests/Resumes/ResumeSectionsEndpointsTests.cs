using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Guard chain + routing + HTTP mapping for the four resume section/template endpoints (FM-DOTNET-089; repo +
/// subscription guard faked). Pins: anon → 401; subscription denied → 403; the outcome→status map (NotOwned 404
/// "Resume not found"; InvalidSectionOrder 400; TemplateRequired 400; InvalidTemplateType 500); the happy shapes
/// (reorder { data:{ sections } }; add 201 { data:<section> }; delete { success:true }; template { data:{ id,
/// template } }); and malformed body → 500.
/// </summary>
public sealed class ResumeSectionsEndpointsTests
{
    private const string Order = "/api/resume/r1/sections/order";
    private const string Sections = "/api/resume/r1/sections";
    private const string Section1 = "/api/resume/r1/sections/s1";
    private const string Template = "/api/resume/r1/template";

    [Fact]
    public async Task Anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await client.PostAsync(Sections, Json("{}"));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Subscription_denied_is_403()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: false);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Sections, Json("{}"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Reorder_happy_returns_sections()
    {
        var repo = new FakeRepo { Result = new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, SectionsJson: """[{"id":"a"}]""") };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Order, Json("""{"sectionOrder":["a"]}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("a", data.GetProperty("sections")[0].GetProperty("id").GetString());
    }

    [Fact]
    public async Task Reorder_invalid_order_is_400()
    {
        var repo = new FakeRepo { Result = ResumeSectionsOutcome.InvalidSectionOrder };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Order, Json("{}"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("sectionOrder array required", await Message(response));
    }

    [Fact]
    public async Task Add_happy_returns_201_with_section()
    {
        var repo = new FakeRepo { Result = new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, NewSectionJson: """{"id":"new","type":"custom"}""") };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Sections, Json("""{"title":"X"}"""));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("new", data.GetProperty("id").GetString());
        Assert.Equal("custom", data.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Not_owned_is_404_resume_not_found()
    {
        var repo = new FakeRepo { Result = ResumeSectionsOutcome.NotOwned };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, Section1, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Resume not found", await Message(response));
    }

    [Fact]
    public async Task Delete_happy_returns_success()
    {
        var repo = new FakeRepo { Result = new ResumeSectionsOutcome(ResumeSectionsStatus.Ok) };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Delete, Section1, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(doc.RootElement.GetProperty("success").GetBoolean());
    }

    [Fact]
    public async Task Template_happy_returns_id_and_template()
    {
        var repo = new FakeRepo { Result = new ResumeSectionsOutcome(ResumeSectionsStatus.Ok, Template: "modern") };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Template, Json("""{"template":"modern"}"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = await Data(response);
        Assert.Equal("r1", data.GetProperty("id").GetString());
        Assert.Equal("modern", data.GetProperty("template").GetString());
    }

    [Fact]
    public async Task Template_required_is_400()
    {
        var repo = new FakeRepo { Result = ResumeSectionsOutcome.TemplateRequired };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Template, Json("{}"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("template required", await Message(response));
    }

    [Fact]
    public async Task Template_invalid_type_is_500()
    {
        var repo = new FakeRepo { Result = ResumeSectionsOutcome.InvalidTemplateType };
        using var factory = new Factory(repo, allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Put, Template, Json("""{"template":5}"""));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task Malformed_body_is_500()
    {
        using var factory = new Factory(new FakeRepo(), allowSubscription: true);
        using var client = factory.CreateClient();

        var response = await Send(client, HttpMethod.Post, Sections, new StringContent("{ bad", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    // ---- helpers ----

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

    private static async Task<string?> Message(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.GetProperty("message").GetString();
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
                services.RemoveAll<IResumeSectionsRepository>();
                services.AddSingleton<IResumeSectionsRepository>(repo);
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

    private sealed class FakeRepo : IResumeSectionsRepository
    {
        public ResumeSectionsOutcome Result { get; init; } = new(ResumeSectionsStatus.Ok);

        public Task<ResumeSectionsOutcome> ReorderAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);

        public Task<ResumeSectionsOutcome> AddAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);

        public Task<ResumeSectionsOutcome> DeleteAsync(RequestContext context, string resumeId, string sectionId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);

        public Task<ResumeSectionsOutcome> SetTemplateAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken cancellationToken = default) =>
            Task.FromResult(Result);
    }
}
