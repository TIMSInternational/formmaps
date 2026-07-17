using System.Net;
using System.Net.Http.Json;
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
/// Guard chain + HTTP mapping for the vocational result read endpoints (GET /score/{id}, /integrated/{id}).
/// The reader/access-guard are faked. Pins: authenticate-only (anon -> 401), canAccessUser (privileged reads
/// a foreign id; deny -> 404 "Not found"), the 100-char path bound, ready -> 200 {status:"ready",...}, and
/// null reader -> 200 {status:"never_computed"}.
/// </summary>
public class VocationalReadEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string TargetUserId = "student-x";

    private static JsonElement Empty => JsonDocument.Parse("{}").RootElement.Clone();

    [Fact]
    public async Task GetScore_denies_anonymous()
    {
        var reader = new FakeReader();
        using var factory = new Factory(reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/v1/vocational360/score/{TargetUserId}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, reader.ScoreCalls);
    }

    [Fact]
    public async Task GetScore_access_denied_is_404_not_found()
    {
        var reader = new FakeReader();
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(reader, guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
        Assert.Equal(TargetUserId, guard.LastTargetUserId);
        Assert.Equal(0, reader.ScoreCalls);
    }

    [Fact]
    public async Task GetScore_ready_returns_200_status_ready_for_a_privileged_caller()
    {
        var read = new VocationalScoreRead(
            TargetUserId, "v1", 75, "moderateHigh", 2, ["self", "parent"], Empty, Empty, Empty, "2026-06-15T12:34:56.789Z");
        var reader = new FakeReader { Score = read };
        using var factory = new Factory(reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, reader.LastScoreUserId);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("ready", data.GetProperty("status").GetString());
        Assert.Equal(75d, data.GetProperty("composite").GetDouble());
    }

    [Fact]
    public async Task GetScore_null_is_200_never_computed()
    {
        var reader = new FakeReader { Score = null };
        using var factory = new Factory(reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("never_computed", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetScore_bounds_the_path_param_to_100_chars()
    {
        var longId = new string('a', 150);
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(new FakeReader(), guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{longId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(100, guard.LastTargetUserId!.Length);
    }

    [Fact]
    public async Task GetIntegrated_denies_anonymous_and_404s_on_access_denied()
    {
        // The integrated route shares AuthorizeAsync with /score — pin its guard chain independently.
        var reader = new FakeReader { Integrated = new VocationalIntegratedRead(TargetUserId, "v1", 70, "b", 75, 60, 80, Empty, "t") };
        using (var anonFactory = new Factory(reader, new FakeAccessGuard(allow: true)))
        using (var anonClient = anonFactory.CreateClient())
        {
            var anon = await anonClient.GetAsync($"/api/v1/vocational360/integrated/{TargetUserId}");
            Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);
        }

        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(reader, guard);
        using var client = factory.CreateClient();
        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
    }

    [Fact]
    public async Task GetIntegrated_ready_returns_200_status_ready()
    {
        var read = new VocationalIntegratedRead(TargetUserId, "v1", 70, "moderateHigh", 75, 60, 80, Empty, "2026-06-15T12:34:56.789Z");
        var reader = new FakeReader { Integrated = read };
        using var factory = new Factory(reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("ready", data.GetProperty("status").GetString());
        Assert.Equal(70d, data.GetProperty("integratedComposite").GetDouble());
    }

    [Fact]
    public async Task GetIntegrated_null_is_200_never_computed()
    {
        var reader = new FakeReader { Integrated = null };
        using var factory = new Factory(reader, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("never_computed", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    // ---- helpers ----

    private static async Task AssertMessage(HttpResponseMessage response, string expected)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal(expected, doc.RootElement.GetProperty("message").GetString());
    }

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string role = "student")
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeReader reader, FakeAccessGuard accessGuard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IVocationalReader>();
                services.AddSingleton<IVocationalReader>(reader);
                services.RemoveAll<IUserAccessGuard>();
                services.AddSingleton<IUserAccessGuard>(accessGuard);
            });
        }
    }

    private sealed class FakeAccessGuard(bool allow) : IUserAccessGuard
    {
        public string? LastTargetUserId { get; private set; }

        public Task<bool> CanAccessUserAsync(RequestContext caller, string targetUserId, CancellationToken cancellationToken = default)
        {
            LastTargetUserId = targetUserId;
            return Task.FromResult(allow);
        }
    }

    private sealed class FakeReader : IVocationalReader
    {
        public VocationalScoreRead? Score { get; init; }

        public VocationalIntegratedRead? Integrated { get; init; }

        public int ScoreCalls { get; private set; }

        public string? LastScoreUserId { get; private set; }

        public Task<VocationalScoreRead?> GetScoreAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default)
        {
            ScoreCalls++;
            LastScoreUserId = evaluatedUserId;
            return Task.FromResult(Score);
        }

        public Task<VocationalIntegratedRead?> GetIntegratedAsync(RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default) =>
            Task.FromResult(Integrated);
    }
}
