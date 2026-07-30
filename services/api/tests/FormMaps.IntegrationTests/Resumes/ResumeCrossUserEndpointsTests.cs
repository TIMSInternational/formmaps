using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Resumes;
using FormMaps.Application.Storage;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Resumes;

/// <summary>
/// Guard chain + routing for the 4 resume.ts cross-user completion endpoints (Phase F). Pins the GET-cross-user
/// vs. PUT/DELETE-owner-only asymmetry: a privileged FakeUserAccessGuard(allow:true) lets GET succeed for a
/// non-owner, but PUT/DELETE 404 for a non-owner regardless of the fake guard's answer (they don't call it at all).
/// </summary>
public sealed class ResumeCrossUserEndpointsTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement.Clone();

    private static ResumeRow Row(string id, string userId) => new(
        id, userId, "n", "default", "", J("{}"), J("[]"), J("[]"), J("[]"), J("[]"), J("{}"), J("[]"), J("[]"),
        null, null, "key.pdf", true, true, null, "2026-07-24T12:00:00.000Z", null, "2026-07-24T12:00:00.000Z");

    [Fact]
    public async Task GetById_anonymous_is_401()
    {
        using var factory = new Factory(new FakeRepo(), new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/api/resume/some-id");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetById_direct_hit_denied_by_access_guard_is_404()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(false), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1", null, callerId: "someone-else");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_direct_hit_allowed_by_access_guard_returns_200()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetById_falls_back_to_userId_lookup_when_no_direct_resume_matches()
    {
        var repo = new FakeRepo { ActiveById = null, MostRecentForUser = Row("r2", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/owner-1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetById_fallback_with_no_resumes_is_404()
    {
        var repo = new FakeRepo { ActiveById = null, MostRecentForUser = null };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/owner-1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_owner_only_non_owner_is_404_even_though_access_guard_would_allow()
    {
        var repo = new FakeRepo { UpdateResult = ResumeUpdateOutcome.NotOwned };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage()); // guard would ALLOW; must not be consulted
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, "/api/resume/r1", Json("""{"name":"x"}"""), callerId: "attacker");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_owner_succeeds()
    {
        var repo = new FakeRepo { UpdateResult = ResumeUpdateOutcome.Updated(Row("r1", "owner-1")) };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Put, "/api/resume/r1", Json("""{"name":"x"}"""), callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Delete_non_owner_is_404()
    {
        var repo = new FakeRepo { SoftDeleteResult = false };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, "/api/resume/r1", null, callerId: "attacker");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Delete_owner_succeeds()
    {
        var repo = new FakeRepo { SoftDeleteResult = true };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Delete, "/api/resume/r1", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_missing_originalPdfKey_is_404()
    {
        var noOriginal = Row("r1", "owner-1") with { OriginalPdfKey = null };
        var repo = new FakeRepo { ActiveById = noOriginal };
        using var factory = new Factory(repo, new FakeGuard(true), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_denied_by_access_guard_is_404()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        using var factory = new Factory(repo, new FakeGuard(false), new FakeStorage());
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "someone-else");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOriginal_success_returns_presigned_url()
    {
        var repo = new FakeRepo { ActiveById = Row("r1", "owner-1") };
        var storage = new FakeStorage { Url = "https://example.s3/key.pdf?sig=abc" };
        using var factory = new Factory(repo, new FakeGuard(true), storage);
        using var client = factory.CreateClient();
        var response = await Send(client, HttpMethod.Get, "/api/resume/r1/original", null, callerId: "owner-1");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("https://example.s3/key.pdf?sig=abc", doc.RootElement.GetProperty("data").GetProperty("url").GetString());
    }

    private static StringContent Json(string json) => new(json, Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, HttpContent? content, string callerId)
    {
        var request = new HttpRequestMessage(method, path) { Content = content };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, callerId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, "student");
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "s@e.st");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Student");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, "");
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeRepo repo, FakeGuard guard, FakeStorage storage) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IResumeRepository>();
                services.AddSingleton<IResumeRepository>(repo);
                services.RemoveAll<ISubscriptionGuard>();
                services.AddSingleton<ISubscriptionGuard>(new FakeSub(true));
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(guard);
                services.RemoveAll<IObjectStorage>();
                services.AddSingleton<IObjectStorage>(storage);
            });
        }
    }

    private sealed class FakeSub(bool allow) : ISubscriptionGuard
    {
        public Task<GuardDecision> RequireSubscriptionAsync(RequestContext context, CancellationToken ct = default) =>
            Task.FromResult(allow ? GuardDecision.Allow() : GuardDecision.Deny(403, "SUBSCRIPTION_REQUIRED", "Active subscription required"));
    }

    private sealed class FakeGuard(bool allow) : IUserAccessGuard
    {
        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken ct = default) =>
            Task.FromResult(allow);
    }

    private sealed class FakeStorage : IObjectStorage
    {
        public string Url { get; init; } = "https://example.s3/x";
        public Task<StoredObject> UploadAndGetUrlAsync(string folder, string filename, byte[] body, string contentType, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<string> GetPresignedReadUrlAsync(string key, int ttlSeconds, bool inline, string contentType, CancellationToken ct = default) =>
            Task.FromResult(Url);
    }

    private sealed class FakeRepo : IResumeRepository
    {
        public ResumeRow? ActiveById { get; init; }
        public ResumeRow? MostRecentForUser { get; init; }
        public ResumeUpdateOutcome UpdateResult { get; init; } = ResumeUpdateOutcome.NotOwned;
        public bool SoftDeleteResult { get; init; }

        public Task<IReadOnlyList<ResumeRow>> ListAsync(RequestContext context, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<ResumeCreateOutcome> CreateAsync(RequestContext context, JsonElement body, CancellationToken ct = default) =>
            throw new NotSupportedException();
        public Task<ResumeRow?> FindActiveByIdAsync(string resumeId, CancellationToken ct = default) =>
            Task.FromResult(ActiveById);
        public Task<ResumeRow?> FindMostRecentActiveByUserIdAsync(string userId, CancellationToken ct = default) =>
            Task.FromResult(MostRecentForUser);
        public Task<ResumeUpdateOutcome> UpdateAsync(RequestContext context, string resumeId, JsonElement body, CancellationToken ct = default) =>
            Task.FromResult(UpdateResult);
        public Task<bool> SoftDeleteAsync(RequestContext context, string resumeId, CancellationToken ct = default) =>
            Task.FromResult(SoftDeleteResult);
    }
}
