using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Text;
using FormMaps.Api.Auth;
using FormMaps.Api.Insights;
using FormMaps.Application.Auth;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace FormMaps.UnitTests.Insights;

/// <summary>
/// Unit tests for <see cref="LegacyApiInsightsTrigger"/> (formmaps#144) — the .NET half of the
/// polyglot insights funnel. Pins the four load-bearing properties of the mechanism:
///
/// 1. WHAT it calls: POST {LEGACY_API_BASE_URL}/api/v1/assessment/generate-insights — the SAME
///    authenticated Node route the frontend uses, whose handler re-checks the completion gate and
///    backgrounds fingerprint-idempotent generation (so gate + idempotency live in ONE place, Node).
/// 2. HOW it authenticates: a short-lived HS256 JWT for the EVALUATED user, signed with the shared
///    JWT_SECRET through the same SecretOverride-then-env precedence as every other .NET mint path
///    (the formmaps#41 lesson), with the claim shape Node's verifyAccessToken expects.
/// 3. The fail-soft-BUT-LOUD contract (formmaps#137): TriggerAsync NEVER throws — every failure mode
///    (unreachable Node, non-2xx, unknown user, missing config/secret) logs at Error carrying the
///    userId + source needed to backfill, and skips cleanly.
/// 4. What it must NOT do: no HTTP call at all when config/user/secret are missing (a half-built
///    request against a wrong origin would be worse than a loud skip).
///
/// In <see cref="JwtSecretEnvironmentCollection"/> because two tests here mutate the process-wide
/// JWT_SECRET environment variable.
/// </summary>
[Collection(JwtSecretEnvironmentCollection.Name)]
public sealed class LegacyApiInsightsTriggerTests
{
    private const string Secret = "override-secret-at-least-32-bytes-long!!!!";
    private const string UserId = "user-360";

    private static readonly AuthUserRow StudentRow = new(
        UserId, "Student Name", "student@x.com", PasswordHash: null,
        RoleId: "role-1", RoleName: "student", SchoolId: "school-9", IsActive: true);

    [Fact]
    public async Task TriggerAsync_posts_to_the_generate_insights_route_with_a_short_lived_token_for_the_user()
    {
        var handler = new CapturingHandler(Respond(HttpStatusCode.OK,
            """{"success":true,"data":{"status":"generating"}}"""));
        var logger = new CapturingLogger();
        var trigger = MakeTrigger(handler, logger, baseUrl: "https://legacy.example/");

        await trigger.TriggerAsync(UserId, "evaluation.feedback.submitted");

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        // Trailing slash on the configured base URL must not produce "//api/...".
        Assert.Equal("https://legacy.example/api/v1/assessment/generate-insights", request.Uri);
        Assert.Equal("Bearer", request.AuthScheme);

        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(request.AuthParameter);
        Assert.Equal(UserId, jwt.Subject);
        Assert.Equal("nexa-api", jwt.Issuer);
        Assert.Contains("nexa-frontend", jwt.Audiences);
        Assert.Equal("student", jwt.Claims.Single(c => c.Type == "role").Value);
        Assert.Equal("school-9", jwt.Claims.Single(c => c.Type == "schoolId").Value);
        // Short-lived: 60s TTL, not the ~60min session TTL — this token exists for one internal call.
        Assert.True(jwt.ValidTo <= DateTime.UtcNow.AddSeconds(65), $"ValidTo was {jwt.ValidTo:O}");
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddSeconds(30), $"ValidTo was {jwt.ValidTo:O}");
        // Backdated nbf: Node's jwt.verify applies ZERO clock tolerance, so a .NET clock slightly
        // ahead of Node's must not make every trigger fail "jwt not active".
        Assert.True(jwt.ValidFrom < DateTime.UtcNow.AddSeconds(-5), $"ValidFrom was {jwt.ValidFrom:O}");

        Assert.True(VerifiesUnder(request.AuthParameter!, Secret));

        var fired = Assert.Single(logger.Entries, e => e.Message.StartsWith("insights.trigger fired", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, fired.Level);
        Assert.Contains(UserId, fired.Message, StringComparison.Ordinal);
        Assert.Contains("generating", fired.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TriggerAsync_signs_with_JWT_SECRET_env_when_no_SecretOverride_is_configured()
    {
        const string envSecret = "env-secret-that-is-at-least-32-bytes-long!!";
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", envSecret);
            var handler = new CapturingHandler(Respond(HttpStatusCode.OK, """{"success":true}"""));
            var trigger = MakeTrigger(handler, new CapturingLogger(), secretOverride: null);

            await trigger.TriggerAsync(UserId, "assessment.lia.completed");

            var request = Assert.Single(handler.Requests);
            Assert.True(VerifiesUnder(request.AuthParameter!, envSecret));
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", previous);
        }
    }

    [Fact]
    public async Task TriggerAsync_never_throws_and_logs_error_on_a_non_success_status()
    {
        // 429 is the realistic case: the route sits under Node's shared per-IP aiLimiter (10/min),
        // and every .NET-originated trigger shares ONE egress IP.
        var handler = new CapturingHandler(Respond((HttpStatusCode)429,
            """{"success":false,"message":"AI rate limit reached, please wait"}"""));
        var logger = new CapturingLogger();
        var trigger = MakeTrigger(handler, logger);

        await trigger.TriggerAsync(UserId, "evaluation.feedback.submitted");

        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains(UserId, error.Message, StringComparison.Ordinal);
        Assert.Contains("evaluation.feedback.submitted", error.Message, StringComparison.Ordinal);
        Assert.Contains("429", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TriggerAsync_never_throws_and_logs_error_when_the_legacy_api_is_unreachable()
    {
        var handler = new CapturingHandler(_ => throw new HttpRequestException("connection refused"));
        var logger = new CapturingLogger();
        var trigger = MakeTrigger(handler, logger);

        await trigger.TriggerAsync(UserId, "assessment.lia.completed");

        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains(UserId, error.Message, StringComparison.Ordinal);
        Assert.Contains("assessment.lia.completed", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TriggerAsync_logs_error_and_makes_no_call_when_the_base_url_is_not_configured()
    {
        var handler = new CapturingHandler(Respond(HttpStatusCode.OK, "{}"));
        var logger = new CapturingLogger();
        var trigger = MakeTrigger(handler, logger, baseUrl: null);

        await trigger.TriggerAsync(UserId, "evaluation.feedback.submitted");

        Assert.Empty(handler.Requests);
        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains("LEGACY_API_BASE_URL", error.Message, StringComparison.Ordinal);
        Assert.Contains(UserId, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TriggerAsync_logs_error_and_makes_no_call_when_the_user_is_unknown()
    {
        var handler = new CapturingHandler(Respond(HttpStatusCode.OK, "{}"));
        var logger = new CapturingLogger();
        var trigger = MakeTrigger(handler, logger, userExists: false);

        await trigger.TriggerAsync(UserId, "assessment.lia.completed");

        Assert.Empty(handler.Requests);
        var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
        Assert.Contains(UserId, error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TriggerAsync_logs_error_and_makes_no_call_when_no_signing_secret_is_available()
    {
        var previous = Environment.GetEnvironmentVariable("JWT_SECRET");
        try
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
            var handler = new CapturingHandler(Respond(HttpStatusCode.OK, "{}"));
            var logger = new CapturingLogger();
            var trigger = MakeTrigger(handler, logger, secretOverride: null);

            await trigger.TriggerAsync(UserId, "evaluation.feedback.submitted");

            Assert.Empty(handler.Requests);
            var error = Assert.Single(logger.Entries, e => e.Level == LogLevel.Error);
            Assert.Contains("JWT_SECRET", error.Message, StringComparison.Ordinal);
            Assert.Contains(UserId, error.Message, StringComparison.Ordinal);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", previous);
        }
    }

    // ==============================================================================================
    // Helpers
    // ==============================================================================================

    private static LegacyApiInsightsTrigger MakeTrigger(
        CapturingHandler handler,
        CapturingLogger logger,
        string? baseUrl = "https://legacy.example",
        string? secretOverride = Secret,
        bool userExists = true)
    {
        var repository = new Mock<IAuthRepository>(MockBehavior.Loose);
        repository
            .Setup(r => r.FindUserByIdWithRoleAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(userExists ? StudentRow : null);

        return new LegacyApiInsightsTrigger(
            new HttpClient(handler),
            repository.Object,
            Options.Create(new LegacyJwtOptions
            {
                Issuer = "nexa-api",
                Audience = "nexa-frontend",
                SecretOverride = secretOverride,
            }),
            new InsightsTriggerOptions(baseUrl),
            logger);
    }

    private static Func<HttpRequestMessage, HttpResponseMessage> Respond(HttpStatusCode status, string body) =>
        _ => new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static bool VerifiesUnder(string token, string secret)
    {
        try
        {
            new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = false,
            }, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }

    private sealed record CapturedRequest(HttpMethod Method, string Uri, string? AuthScheme, string? AuthParameter);

    private sealed class CapturingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public List<CapturedRequest> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(new CapturedRequest(
                request.Method,
                request.RequestUri!.ToString(),
                request.Headers.Authorization?.Scheme,
                request.Headers.Authorization?.Parameter));
            return Task.FromResult(responder(request));
        }
    }

    private sealed record LogEntry(LogLevel Level, string Message);

    private sealed class CapturingLogger : ILogger<LegacyApiInsightsTrigger>
    {
        public List<LogEntry> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add(new LogEntry(logLevel, formatter(state, exception)));
    }
}
