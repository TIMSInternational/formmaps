using System.Net;
using System.Text;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Moderation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Moderation;

/// <summary>
/// formmaps#63 — legacy's <c>moderationLimiter</c> (api/src/middleware/rateLimiter.ts:26), ported.
///
/// <para>WHY THIS FILE EXISTS AT ALL. A rate limit present in legacy and ABSENT in .NET is not a cosmetic
/// gap on this surface: /report and /block are the two endpoints an abuser uses to flood the moderation
/// queue or mint block rows, and without the policy the flag flip would silently remove the only cap. So
/// the limiter is asserted here the same way the endpoints are — window, limit, response body, and which
/// routes it does and does not cover.</para>
///
/// <para>WHICH ROUTES. THREE of the four. GET /reports is NOT behind the limiter in legacy
/// (routes/moderation.ts:81 has no middleware argument, unlike :35, :118 and :154), and adding it here
/// would be a divergence in the tightening direction — still a divergence. Verified by grep, and pinned by
/// <c>The_admin_queue_is_not_rate_limited</c> below.</para>
/// </summary>
public class ModerationRateLimitTests
{
    [Theory]
    [InlineData("/api/v1/moderation/report", "POST")]
    [InlineData("/api/v1/moderation/block/u2", "POST")]
    [InlineData("/api/v1/moderation/block/u2", "DELETE")]
    public async Task Rate_limited_routes_return_429_with_legacy_message(string path, string method)
    {
        using var factory = new Factory(new StubRepo(), permitLimit: 1);
        using var client = factory.CreateClient();

        var first = await Send(client, new HttpMethod(method), path);
        var second = await Send(client, new HttpMethod(method), path);

        Assert.NotEqual((HttpStatusCode)429, first.StatusCode);
        Assert.Equal((HttpStatusCode)429, second.StatusCode);

        // rateLimiter.ts:31 -- `message: { success: false, message: "Too many attempts. Try again later." }`.
        using var doc = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Too many attempts. Try again later.", doc.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task The_three_limited_routes_share_one_per_caller_budget()
    {
        // Legacy shares ONE express-rate-limit instance (and one `sharedStore("moderation")` bucket, keyed
        // `req.userId || req.ip`) across all three routes, so a caller who spends the budget on /report
        // cannot then block. A per-route budget would triple the effective limit.
        using var factory = new Factory(new StubRepo(), permitLimit: 2);
        using var client = factory.CreateClient();

        await Send(client, HttpMethod.Post, "/api/v1/moderation/report");
        await Send(client, HttpMethod.Post, "/api/v1/moderation/block/u2");
        var third = await Send(client, HttpMethod.Delete, "/api/v1/moderation/block/u2");

        Assert.Equal((HttpStatusCode)429, third.StatusCode);
    }

    [Fact]
    public async Task The_admin_queue_is_not_rate_limited()
    {
        using var factory = new Factory(new StubRepo(), permitLimit: 1);
        using var client = factory.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            var response = await Send(client, HttpMethod.Get, "/api/v1/moderation/reports", role: "school_admin");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }

    [Fact]
    public async Task The_configured_defaults_are_legacys_thirty_per_hour()
    {
        // The numbers live in appsettings.json + RateLimitPolicyOptions.Moderation. Asserting them here is
        // what stops a later "tidy-up" folding moderation into Sensitive's 10/hour, which would cap
        // legitimate flagging bursts at the password-change rate.
        var options = new FormMaps.Api.Security.RateLimitPolicyOptions();
        Assert.Equal(30, options.Moderation.PermitLimit);
        Assert.Equal(3600, options.Moderation.WindowSeconds);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, string role = "student")
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, "caller-1");
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, role);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "caller@example.test");
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, "school-1");
        if (method == HttpMethod.Post && path.EndsWith("/report", StringComparison.Ordinal))
        {
            request.Content = new StringContent(
                """{"targetType":"message","targetId":"m1","reason":"abusive"}""", Encoding.UTF8, "application/json");
        }

        return client.SendAsync(request);
    }

    private sealed class Factory(IModerationRepository repository, int permitLimit) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["ApiSecurity:RateLimits:Moderation:PermitLimit"] = permitLimit.ToString(),
                    ["ApiSecurity:RateLimits:Moderation:WindowSeconds"] = "3600",
                }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IModerationRepository>();
                services.AddSingleton(repository);
            });
        }
    }

    private sealed class StubRepo : IModerationRepository
    {
        public Task<bool> CanReportTargetAsync(RequestContext context, string reporterId, string targetType, string targetId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task<CreatedReport> CreateReportAsync(RequestContext context, string reporterId, string targetType, string targetId, string reason, string actorEmail, string clientIp, CancellationToken cancellationToken = default) => Task.FromResult(new CreatedReport("rep-1", "open"));
        public Task<OpenReportsPage> ListOpenReportsAsync(RequestContext context, int page, int limit, string? schoolId, CancellationToken cancellationToken = default) => Task.FromResult(new OpenReportsPage([], 0));
        public Task<bool> CanModerateUserAsync(RequestContext context, string actorId, string targetId, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task BlockUserAsync(RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<bool> UnblockUserAsync(RequestContext context, string blockerId, string blockedId, string actorEmail, string clientIp, CancellationToken cancellationToken = default) => Task.FromResult(true);
    }
}
