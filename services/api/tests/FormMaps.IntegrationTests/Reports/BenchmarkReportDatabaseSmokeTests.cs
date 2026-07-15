using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Domain.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace FormMaps.IntegrationTests.Reports;

public class BenchmarkReportDatabaseSmokeTests
{
    private const string RunFlag = "FORMMAPS_RUN_BENCHMARK_DB_SMOKE";
    private const string SmokeDatabaseUrl = "FORMMAPS_SMOKE_DATABASE_URL";
    private const string SchoolIdEnv = "FORMMAPS_SMOKE_SCHOOL_ID";
    private const string UserIdEnv = "FORMMAPS_SMOKE_USER_ID";

    [Fact]
    public async Task Benchmark_reads_through_real_database_session_when_enabled()
    {
        if (!IsEnabled(Environment.GetEnvironmentVariable(RunFlag)))
        {
            return;
        }

        var databaseUrl =
            Environment.GetEnvironmentVariable(SmokeDatabaseUrl) ??
            Environment.GetEnvironmentVariable("DATABASE_URL");
        var schoolId = RequireEnvironment(SchoolIdEnv);
        var userId = RequireEnvironment(UserIdEnv);

        if (string.IsNullOrWhiteSpace(databaseUrl))
        {
            throw new InvalidOperationException(
                $"Set {SmokeDatabaseUrl} or DATABASE_URL before enabling {RunFlag}.");
        }

        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment(Environments.Development);
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["DATABASE_URL"] = databaseUrl,
                        ["Database:MaxPoolSize"] = "2",
                        ["Database:TimeoutSeconds"] = "30"
                    });
                });
            });

        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/reports/benchmark");
        request.Headers.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        request.Headers.Add(DevelopmentRequestContextFactory.RoleHeader, FormMapsRoles.SchoolAdmin);
        request.Headers.Add(DevelopmentRequestContextFactory.SchoolIdHeader, schoolId);
        request.Headers.Add(DevelopmentRequestContextFactory.EmailHeader, "benchmark-smoke@formmaps.local");
        request.Headers.Add(DevelopmentRequestContextFactory.NameHeader, "Benchmark Smoke");
        request.Headers.Add(DevelopmentRequestContextFactory.PermissionsHeader, FormMapsPermissions.AnalyticsSchool);

        var response = await client.SendAsync(request);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var data = root.GetProperty("data");
        var distribution = data.GetProperty("gpaDistribution");

        Assert.True(root.GetProperty("success").GetBoolean());
        Assert.True(data.GetProperty("totalStudents").GetInt32() >= 0);
        Assert.True(data.GetProperty("averageGpa").GetDouble() >= 0);
        Assert.True(data.GetProperty("pcaCompletionRate").GetInt32() >= 0);
        Assert.True(data.GetProperty("milAverageScore").GetDouble() >= 0);
        Assert.True(distribution.TryGetProperty("above35", out _));
        Assert.True(distribution.TryGetProperty("above30", out _));
        Assert.True(distribution.TryGetProperty("above25", out _));
        Assert.True(distribution.TryGetProperty("below25", out _));
        Assert.True(data.TryGetProperty("generatedAt", out _));
    }

    private static string RequireEnvironment(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"Set {name} before enabling {RunFlag}.");
        }

        return value;
    }

    private static bool IsEnabled(string? value)
    {
        return value?.Trim().ToLowerInvariant() is "1" or "true";
    }
}
