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
using Microsoft.Extensions.Options;

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
[Collection(nameof(JwtSecretCollection))]
public class ModerationRateLimitTests : IDisposable
{
    private const string Secret = "formmaps-test-secret-that-is-at-least-32-bytes";

    // Required because the partition-key tests below present REAL session JWTs (see
    // One_caller_cannot_mint_a_fresh_budget_by_rotating_their_access_token): minting one goes through
    // AccessTokenFactory, which reads the process-wide JWT_SECRET (formmaps#37).
    private readonly JwtSecretScope jwtSecretScope = new(Secret);

    public void Dispose()
    {
        jwtSecretScope.Dispose();
        GC.SuppressFinalize(this);
    }

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

    // =============================================================================================
    // THE PARTITION KEY. Nothing above this line exercises it.
    // =============================================================================================

    /// <summary>
    /// WHO the budget belongs to. legacy's <c>keyGenerator</c> (rateLimiter.ts:33) is
    /// <c>req.userId || req.ip</c>, and <c>router.use(authenticate)</c> at moderation.ts:20 runs BEFORE the
    /// limiter, so on every authenticated request that resolves to the USER — two users never share a budget.
    ///
    /// <para>WHY THIS TEST EXISTS. The suite had 73 tests and not one of them looked at the key.
    /// <c>The_three_limited_routes_share_one_per_caller_budget</c> proves the three routes share ONE budget,
    /// but every request it sends comes from one client with one identity, so a per-user key, a per-IP key and
    /// a single global constant are all indistinguishable under it — replacing the key expression with the
    /// literal <c>"SABOTAGE-GLOBAL-BUDGET"</c> (one abuser exhausting the moderation budget for every user on
    /// the instance) left the whole namespace green. This test is red under that mutation.</para>
    ///
    /// <para>It is ALSO the test that was red against the shipped keying: the port keyed the partition on a
    /// SHA-256 of the access token and, with no token on these dev-auth requests, both callers fell through to
    /// <c>ip:127.0.0.1</c> and shared one budget — where legacy gives each their own.</para>
    /// </summary>
    [Fact]
    public async Task Two_different_callers_each_get_their_own_budget()
    {
        using var factory = new Factory(new StubRepo(), permitLimit: 1);
        using var client = factory.CreateClient();

        var first = await Send(client, HttpMethod.Post, "/api/v1/moderation/report", userId: "caller-a");
        var second = await Send(client, HttpMethod.Post, "/api/v1/moderation/report", userId: "caller-b");

        Assert.NotEqual((HttpStatusCode)429, first.StatusCode);
        Assert.NotEqual((HttpStatusCode)429, second.StatusCode);
    }

    /// <summary>
    /// The inverse, and the assertion that would have caught the keying drift in the first place: ONE user with
    /// two live sessions gets ONE budget, not one per session.
    ///
    /// <para>THE DRIFT. <c>BuildRequestLimitKey</c> returns <c>auth:{sha256(token)[..32]}</c> whenever an access
    /// token is present, so every distinct token was its own partition. Because <c>/auth/refresh</c> rotation
    /// hands out a new access token, and a new token was a new partition, the 30/hour cap on POST /report and
    /// POST/DELETE /block was renewable on demand by any authenticated user — on the one surface where the
    /// limiter is the ONLY control. Legacy has no such property: its key is the userId, which rotation does not
    /// change.</para>
    ///
    /// <para>REAL JWTs, deliberately, not placeholder cookie values. The production key path only runs when a
    /// token actually resolves to an identity — a garbage cookie makes the context Anonymous and silently falls
    /// back to the IP key, which would make this test pass for the wrong reason. These are minted through the
    /// same <c>AccessTokenFactory</c> the service issues with, so the request shape is production's. This is
    /// also the suite's first coverage of the token branch at all.</para>
    /// </summary>
    [Fact]
    public async Task One_caller_cannot_mint_a_fresh_budget_by_rotating_their_access_token()
    {
        var tokens = new AccessTokenFactory(Options.Create(new LegacyJwtOptions()));
        var claims = new AccessTokenClaims("caller-a", "Caller A", "a@example.test", "student", "school-1", []);

        // Two DIFFERENT tokens for the SAME user, which is exactly what a refresh-token rotation produces.
        var sessionOne = tokens.CreateAccessToken(claims);
        var sessionTwo = tokens.CreateAccessToken(claims with { Name = "Caller A (second session)" });
        Assert.NotEqual(sessionOne, sessionTwo);

        using var factory = new Factory(new StubRepo(), permitLimit: 1);
        using var client = factory.CreateClient();

        var first = await SendWithToken(client, sessionOne);
        var second = await SendWithToken(client, sessionTwo);

        Assert.NotEqual((HttpStatusCode)429, first.StatusCode);
        Assert.Equal((HttpStatusCode)429, second.StatusCode);
    }

    // ---- helpers ----

    private static Task<HttpResponseMessage> SendWithToken(HttpClient client, string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/moderation/report");
        request.Headers.Add("Cookie", $"access_token={accessToken}");
        request.Content = new StringContent(
            """{"targetType":"message","targetId":"m1","reason":"abusive"}""", Encoding.UTF8, "application/json");
        return client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Send(
        HttpClient client, HttpMethod method, string path, string role = "student", string userId = "caller-1")
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
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
