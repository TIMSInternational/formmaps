using System.Net;
using System.Text;
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
/// Guard chain + HTTP mapping for the authed vocational INTEGRATED recompute endpoint
/// (POST /api/v1/vocational360/integrated/{id}/recompute). The writer/access-guard are faked (the writer's
/// DB behavior is proven by IntegratedRecomputeWriterTests). Pins: authenticate-only (anon -> 401 before any
/// work), ownership via canAccessUser (privileged recompute; deny -> 404 "Not found"), the 100-char bound,
/// and each outcome -> its 200 body (ready payload / not_ready+missing / never_computed).
/// </summary>
public class VocationalIntegratedWriteEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string TargetUserId = "student-x";

    [Fact]
    public async Task Recompute_denies_anonymous_before_any_work()
    {
        var writer = new FakeWriter();
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await client.PostAsync($"/api/v1/vocational360/integrated/{TargetUserId}/recompute", Body());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task Recompute_access_denied_is_404_and_skips_the_writer()
    {
        var writer = new FakeWriter();
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(writer, guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Not found", doc.RootElement.GetProperty("message").GetString());
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task Recompute_ready_returns_200_with_status_ready_and_numeric_composite()
    {
        var payload = new IntegratedResultPayload(
            InstrumentVersion: "v1", IntegratedComposite: 77, Band: "moderateHigh",
            ThreeSixtyScore: 70, PcaScore: 100, MilScore: 60,
            WeightsApplied: new IntegrationWeights(0.5, 0.3, 0.2));
        var writer = new FakeWriter { Outcome = payload };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}/recompute", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, writer.LastEvaluatedUserId);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("ready", data.GetProperty("status").GetString());
        Assert.Equal(77d, data.GetProperty("integratedComposite").GetDouble()); // Decimal-as-number
        Assert.Equal("moderateHigh", data.GetProperty("band").GetString());
        Assert.Equal(70d, data.GetProperty("threeSixtyScore").GetDouble());
        Assert.Equal(0.3d, data.GetProperty("weightsApplied").GetProperty("pca").GetDouble()); // camelCase
    }

    [Fact]
    public async Task Recompute_not_ready_returns_200_with_missing_channels()
    {
        var writer = new FakeWriter { Outcome = new IntegrationNotReady(["360", "pca"]) };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("not_ready", data.GetProperty("status").GetString());
        Assert.Equal(new[] { "360", "pca" }, data.GetProperty("missing").EnumerateArray().Select(e => e.GetString()).ToArray());
    }

    [Fact]
    public async Task Recompute_never_computed_returns_200_with_status_never_computed()
    {
        var writer = new FakeWriter { Outcome = null };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("never_computed", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Recompute_bounds_the_path_param_to_100_chars_before_the_access_check()
    {
        var longId = new string('a', 150);
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(new FakeWriter(), guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/integrated/{longId}/recompute");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(100, guard.LastTargetUserId!.Length);
    }

    // ---- helpers ----

    private static StringContent Body() => new("{}", Encoding.UTF8, "application/json");

    private static Task<HttpResponseMessage> Send(HttpClient client, string path, string role = "student")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = Body() };
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, CallerUserId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "user@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Test User");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.ProfileRead);
        return client.SendAsync(request);
    }

    private sealed class Factory(FakeWriter writer, FakeAccessGuard accessGuard) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IVocationalWriter>();
                services.AddSingleton<IVocationalWriter>(writer);
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

    private sealed class FakeWriter : IVocationalWriter
    {
        public IntegrationOutcome? Outcome { get; init; }

        public int Calls { get; private set; }

        public string? LastEvaluatedUserId { get; private set; }

        public Task<VocationalRecomputeOutcome> RecomputeScoreAsync(
            RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("score recompute is covered by VocationalWriteEndpointTests");

        public Task<IntegrationOutcome?> RecomputeIntegratedAsync(
            RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default)
        {
            Calls++;
            LastEvaluatedUserId = evaluatedUserId;
            return Task.FromResult(Outcome);
        }
    }
}
