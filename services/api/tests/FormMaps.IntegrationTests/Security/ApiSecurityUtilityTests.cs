using System.Text.Json;
using FormMaps.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FormMaps.IntegrationTests.Security;

[Collection(nameof(JwtSecretCollection))]
public class ApiSecurityUtilityTests
{
    [Fact]
    public void Startup_validation_rejects_missing_jwt_secret_in_production()
    {
        var configuration = new ConfigurationBuilder().Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupEnvironmentValidator.Validate(
                configuration,
                new TestHostEnvironment(Environments.Production)));

        Assert.Contains("JWT_SECRET", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Startup_validation_rejects_missing_database_connection_in_production()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JWT_SECRET"] = "formmaps-production-secret-at-least-32-bytes"
            })
            .Build();

        var exception = Assert.Throws<InvalidOperationException>(() =>
            StartupEnvironmentValidator.Validate(
                configuration,
                new TestHostEnvironment(Environments.Production)));

        Assert.Contains("DATABASE_URL", exception.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Startup_validation_accepts_required_production_secrets()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JWT_SECRET"] = "formmaps-production-secret-at-least-32-bytes",
                ["DATABASE_URL"] = "Host=localhost;Database=formmaps;Username=user;Password=pass",
                ["STRIPE_SECRET_KEY"] = "sk_test_formmaps_placeholder",
                ["STRIPE_WEBHOOK_SECRET"] = "whsec_formmaps_placeholder"
            })
            .Build();

        StartupEnvironmentValidator.Validate(
            configuration,
            new TestHostEnvironment(Environments.Production));
    }

    [Fact]
    public void Startup_validation_allows_missing_jwt_secret_outside_production()
    {
        var configuration = new ConfigurationBuilder().Build();

        StartupEnvironmentValidator.Validate(
            configuration,
            new TestHostEnvironment(Environments.Development));
    }

    [Fact]
    public void Request_log_redactor_removes_sensitive_query_values()
    {
        var safeUrl = RequestLogRedactor.RedactUrl(
            "/callback?token=abc&next=/dashboard&access_token=def&refresh_token=ghi");

        Assert.Contains("token=[REDACTED]", safeUrl, StringComparison.Ordinal);
        Assert.Contains("access_token=[REDACTED]", safeUrl, StringComparison.Ordinal);
        Assert.Contains("refresh_token=[REDACTED]", safeUrl, StringComparison.Ordinal);
        Assert.DoesNotContain("abc", safeUrl, StringComparison.Ordinal);
        Assert.DoesNotContain("def", safeUrl, StringComparison.Ordinal);
        Assert.DoesNotContain("ghi", safeUrl, StringComparison.Ordinal);
    }

    [Fact]
    public void Json_body_sanitizer_strips_html_except_for_secret_fields()
    {
        var sanitized = JsonBodySanitizer.SanitizeJson("""
            {
              "name": "<b>Ada</b>",
              "password": "<b>keep-secret-shape</b>",
              "profile": {
                "bio": "Hello <script>alert(1)</script>"
              }
            }
            """);

        using var document = JsonDocument.Parse(sanitized);
        var root = document.RootElement;

        Assert.Equal("Ada", root.GetProperty("name").GetString());
        Assert.Equal("<b>keep-secret-shape</b>", root.GetProperty("password").GetString());
        Assert.Equal("Hello alert(1)", root.GetProperty("profile").GetProperty("bio").GetString());
    }

    [Fact]
    public async Task Request_timeout_middleware_returns_gateway_timeout_when_next_observes_cancellation()
    {
        var middleware = new RequestTimeoutMiddleware(
            async context => await Task.Delay(TimeSpan.FromSeconds(5), context.RequestAborted),
            Options.Create(new ApiSecurityOptions { RequestTimeoutMilliseconds = 1 }));
        var httpContext = new DefaultHttpContext();

        await middleware.InvokeAsync(httpContext);

        Assert.Equal(StatusCodes.Status504GatewayTimeout, httpContext.Response.StatusCode);
    }

    private sealed class TestHostEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;

        public string ApplicationName { get; set; } = "FormMaps.IntegrationTests";

        public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
