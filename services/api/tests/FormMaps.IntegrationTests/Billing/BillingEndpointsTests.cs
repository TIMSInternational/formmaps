// services/api/tests/FormMaps.IntegrationTests/Billing/BillingEndpointsTests.cs
using System.Net;
using System.Text.Json;
using FormMaps.Api.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace FormMaps.IntegrationTests.Billing;

/// <summary>
/// HTTP-level coverage for BillingEndpoints (Domain 9a Task 7, GET /api/v1/billing/status). Unlike
/// BillingWebhookEndpointTests (which is deliberately unauthenticated) and every other file in this
/// directory (which reads the shadow tables under RequestContext.System()), this endpoint reads the
/// LIVE user_subscriptions table under the caller's own tenant-scoped RLS session and requires real
/// authenticated identity -- so it reuses BillingDatabaseFixture's live-table seed helpers
/// (SeedMatchingSubscriptionAsync) and the dev-header identity convention from
/// DevelopmentRequestContextFactory (verified against MessagesEndpointsTests), same as every other
/// identity-gated endpoint test in this codebase.
/// </summary>
[Collection(nameof(BillingDatabaseCollection))]
public class BillingEndpointsTests(BillingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services => services.AddSingleton(fixture.SessionFactory));
        });

    [Fact]
    public async Task GetStatus_ActiveSubscription_ReturnsGrantsAccessTrue()
    {
        await fixture.ResetAsync();
        await fixture.SeedMatchingSubscriptionAsync("user_status1", "sub_status1", "active");
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_status1", "student");

        var response = await client.GetAsync("/api/v1/billing/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("data").GetProperty("grantsAccess").GetBoolean());
        Assert.Equal("active", body.RootElement.GetProperty("data").GetProperty("status").GetString());
    }

    [Fact]
    public async Task GetStatus_NoSubscription_ReturnsGrantsAccessFalse()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_no_sub", "student");

        var response = await client.GetAsync("/api/v1/billing/status");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.False(body.RootElement.GetProperty("data").GetProperty("grantsAccess").GetBoolean());
    }

    [Fact]
    public async Task GetStatus_Anonymous_Returns401()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/v1/billing/status");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static void AddDevIdentity(HttpClient client, string userId, string role)
    {
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.RoleHeader, role);
    }
}
