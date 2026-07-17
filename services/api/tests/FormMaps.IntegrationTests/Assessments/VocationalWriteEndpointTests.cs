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
/// Guard chain + HTTP mapping for the authed vocational score recompute endpoint
/// (POST /api/v1/vocational360/score/{id}/recompute). The writer/access-guard are faked (the writer's DB
/// behavior is proven by VocationalWriterTests). Pins: authenticate-only (NO subscription gate; anon -> 401
/// before work), ownership via canAccessUser (a privileged role recomputes a foreign id; deny -> 404 "Not
/// found"), the 100-char path-param bound, and each outcome -> its 200 JSON body (ready/not_ready/never).
/// </summary>
public class VocationalWriteEndpointTests
{
    private const string CallerUserId = "user-123";
    private const string TargetUserId = "student-x";

    [Fact]
    public async Task Recompute_denies_anonymous_before_any_work()
    {
        var writer = new FakeWriter();
        var guard = new FakeAccessGuard(allow: true);
        using var factory = new Factory(writer, guard);
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/v1/vocational360/score/{TargetUserId}/recompute", new { });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task Recompute_access_denied_is_404_not_found_and_skips_the_writer()
    {
        var writer = new FakeWriter();
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(writer, guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertMessage(response, "Not found");
        Assert.Equal(TargetUserId, guard.LastTargetUserId);
        Assert.Equal(0, writer.Calls);
    }

    [Fact]
    public async Task Recompute_ready_returns_200_with_status_ready_and_numeric_composite_for_a_privileged_caller()
    {
        var payload = new VocationalResultPayload(
            InstrumentVersion: "v1", Composite: 75, Band: "moderateHigh", RespondentCount: 2,
            GroupsIncluded: ["self", "parent"], DimensionScores: [],
            Rankings: new Rankings([], [], null, []),
            WeightsApplied: new Dictionary<string, double> { ["self"] = 0.5, ["parent"] = 0.5 });
        var writer = new FakeWriter { Outcome = new VocationalRecomputeOutcome(VocationalRecomputeStatus.Ready, payload, null) };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}/recompute", FormMapsRoles.Counselor);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(TargetUserId, writer.LastEvaluatedUserId);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("ready", data.GetProperty("status").GetString());
        Assert.Equal(75d, data.GetProperty("composite").GetDouble()); // Decimal-as-number
        Assert.Equal("moderateHigh", data.GetProperty("band").GetString());
    }

    [Fact]
    public async Task Recompute_not_ready_returns_200_with_reason()
    {
        var writer = new FakeWriter { Outcome = new VocationalRecomputeOutcome(VocationalRecomputeStatus.NotReady, null, "needs_self_plus_one") };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = doc.RootElement.GetProperty("data");
        Assert.Equal("not_ready", data.GetProperty("status").GetString());
        Assert.Equal("needs_self_plus_one", data.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Recompute_never_computed_returns_200_with_status_never_computed()
    {
        var writer = new FakeWriter { Outcome = new VocationalRecomputeOutcome(VocationalRecomputeStatus.NeverComputed, null, null) };
        using var factory = new Factory(writer, new FakeAccessGuard(allow: true));
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{TargetUserId}/recompute");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("never_computed", doc.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task Recompute_bounds_the_path_param_to_100_chars_before_the_access_check()
    {
        var longId = new string('a', 150);
        var writer = new FakeWriter();
        var guard = new FakeAccessGuard(allow: false);
        using var factory = new Factory(writer, guard);
        using var client = factory.CreateClient();

        var response = await Send(client, $"/api/v1/vocational360/score/{longId}/recompute");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(100, guard.LastTargetUserId!.Length); // sliced to 100 (legacy slice(0,100))
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
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json"),
        };
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
        public VocationalRecomputeOutcome Outcome { get; init; } =
            new(VocationalRecomputeStatus.NeverComputed, null, null);

        public int Calls { get; private set; }

        public string? LastEvaluatedUserId { get; private set; }

        public Task<VocationalRecomputeOutcome> RecomputeScoreAsync(
            RequestContext context, string evaluatedUserId, CancellationToken cancellationToken = default)
        {
            Calls++;
            LastEvaluatedUserId = evaluatedUserId;
            return Task.FromResult(Outcome);
        }
    }
}
