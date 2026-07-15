using System.Net;
using System.Text;
using FormMaps.Api.Security;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Security;

public class ApiSecurityMiddlewareTests
{
    [Fact]
    public async Task Health_responses_include_security_and_no_store_headers()
    {
        using var factory = new SecurityApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertHeader(response, "X-FormMaps-Service", "formmaps-api");
        AssertHeader(response, "Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        AssertHeader(response, "Referrer-Policy", "strict-origin-when-cross-origin");
        AssertHeader(response, "X-Content-Type-Options", "nosniff");
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString(), StringComparison.Ordinal);
        Assert.Contains(response.Headers.Pragma, value => value.Name == "no-cache");
    }

    [Fact]
    public async Task Cors_allows_configured_credentialed_origins()
    {
        using var factory = new SecurityApiFactory(new Dictionary<string, string?>
        {
            ["ApiSecurity:AllowedOrigins:0"] = "https://allowed.example"
        });
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/health");
        request.Headers.Add("Origin", "https://allowed.example");
        request.Headers.Add("Access-Control-Request-Method", "GET");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        AssertHeader(response, "Access-Control-Allow-Origin", "https://allowed.example");
        AssertHeader(response, "Access-Control-Allow-Credentials", "true");
    }

    [Fact]
    public async Task Mutation_requests_reject_unsupported_content_types()
    {
        using var factory = new SecurityApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync(
            "/api/v1/context/current",
            new StringContent("plain text", Encoding.UTF8, "text/plain"));

        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode);
    }

    [Fact]
    public async Task Json_requests_over_configured_body_limit_are_rejected()
    {
        using var factory = new SecurityApiFactory(new Dictionary<string, string?>
        {
            ["ApiSecurity:JsonBodyLimitBytes"] = "4"
        });
        using var client = factory.CreateClient();

        var response = await client.PostAsync(
            "/api/v1/context/current",
            new StringContent("""{"value":"too-large"}""", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
    }

    [Fact]
    public async Task Global_rate_limit_rejects_requests_over_the_configured_window()
    {
        using var factory = new SecurityApiFactory(new Dictionary<string, string?>
        {
            ["ApiSecurity:RateLimits:General:PermitLimit"] = "1",
            ["ApiSecurity:RateLimits:General:WindowSeconds"] = "60"
        });
        using var client = factory.CreateClient();

        var first = await client.GetAsync("/health");
        var second = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal((HttpStatusCode)429, second.StatusCode);
    }

    private static void AssertHeader(HttpResponseMessage response, string name, string expected)
    {
        Assert.True(response.Headers.TryGetValues(name, out var values), $"Missing header {name}");
        Assert.Contains(expected, values);
    }

    private sealed class SecurityApiFactory(
        IReadOnlyDictionary<string, string?>? configuration = null) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, configBuilder) =>
            {
                if (configuration is not null)
                {
                    configBuilder.AddInMemoryCollection(configuration);
                }
            });
        }
    }
}
