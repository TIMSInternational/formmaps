// services/api/tests/FormMaps.IntegrationTests/Billing/BillingEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Billing;
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
///
/// Domain 9a Task 8 adds POST /checkout-session coverage to this same file/group (per the class doc
/// above: "Tasks 8-10 add checkout/cancel/portal to the same group"). CreateFactory() registers
/// FakeStripeGateway unconditionally -- harmless for the GET /status tests above, and needed so the
/// checkout-session tests never make a real network call to Stripe.
/// </summary>
[Collection(nameof(BillingDatabaseCollection))]
public class BillingEndpointsTests(BillingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => new FakeStripeGateway());
            });
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

    [Fact]
    public async Task PostCheckoutSession_ValidPlan_ReturnsCheckoutUrl()
    {
        await fixture.ResetAsync();
        await fixture.SeedPlanAsync("plan_checkout", price: 29.99m, interval: "month");
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_checkout", "student");

        var response = await client.PostAsJsonAsync("/api/v1/billing/checkout-session", new { planId = "plan_checkout" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.StartsWith("https://checkout.stripe.com/", body.RootElement.GetProperty("data").GetProperty("url").GetString());
    }

    [Fact]
    public async Task PostCheckoutSession_UnknownPlan_Returns400()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_checkout2", "student");

        var response = await client.PostAsJsonAsync("/api/v1/billing/checkout-session", new { planId = "does_not_exist" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PostCancelSubscription_ActiveSubscription_CallsGatewayCancel_Returns200()
    {
        await fixture.ResetAsync();
        await fixture.SeedMatchingSubscriptionAsync("user_cancel", "sub_cancel", "active");
        var gateway = new FakeStripeGateway();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => gateway);
            });
        });
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_cancel", "student");

        var response = await client.PostAsync("/api/v1/billing/cancel-subscription", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(gateway.CancelCalled);
        Assert.Equal("sub_cancel", gateway.CancelledSubscriptionId);
    }

    [Fact]
    public async Task PostCancelSubscription_NoSubscription_Returns404()
    {
        // Final-review fix wave (Important 10): legacy stripe.ts answers this case with
        // res.status(404) "No active subscription found"; this endpoint previously returned 400.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_no_sub_cancel", "student");

        var response = await client.PostAsync("/api/v1/billing/cancel-subscription", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostCancelSubscription_AlreadyCancelledSubscription_Returns404_WithoutCallingStripe()
    {
        // Final-review fix wave (Critical 1, second half): without legacy's
        // status IN (active, trialing, past_due) AND isActive filter, this row would be handed straight
        // to Stripe again -- Stripe errors on re-cancelling, and the endpoint would surface that as a 500.
        await fixture.ResetAsync();
        await fixture.SeedMatchingSubscriptionAsync("user_recancel", "sub_recancel", "cancelled");
        var gateway = new FakeStripeGateway();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => gateway);
            });
        });
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_recancel", "student");

        var response = await client.PostAsync("/api/v1/billing/cancel-subscription", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.CancelCalled);
    }

    [Fact]
    public async Task PostCancelSubscription_InactiveSubscription_Returns404_WithoutCallingStripe()
    {
        // Same filter, other half: status is still "active" but the live row is isActive = false.
        await fixture.ResetAsync();
        await fixture.SeedIsActiveMismatchedSubscriptionAsync("user_inactive_cancel", shadowIsActive: false, liveIsActive: false);
        var gateway = new FakeStripeGateway();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => gateway);
            });
        });
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_inactive_cancel", "student");

        var response = await client.PostAsync("/api/v1/billing/cancel-subscription", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.CancelCalled);
    }

    [Fact]
    public async Task PostCancelSubscription_Anonymous_Returns401()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/billing/cancel-subscription", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PostBillingPortal_ExistingStripeCustomer_ReturnsPortalUrl()
    {
        await fixture.ResetAsync();
        await fixture.SeedUserAsync("user_portal", stripeCustomerId: "cus_on_file");
        var gateway = new FakeStripeGateway();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => gateway);
            });
        });
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_portal", "student");

        var response = await client.PostAsync("/api/v1/billing/portal", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.StartsWith("https://billing.stripe.com/", body.RootElement.GetProperty("data").GetProperty("url").GetString());
        Assert.True(gateway.BillingPortalCalled);
        // The endpoint must never take the create-a-customer path here (Important 7).
        Assert.Equal(0, gateway.GetOrCreateCustomerCalls);
    }

    [Theory]
    [InlineData("user_portal_null_customer", true)]
    [InlineData("user_portal_no_row", false)]
    public async Task PostBillingPortal_NoStripeCustomerOnFile_Returns404_WithoutCreatingOne(string userId, bool seedUserRow)
    {
        // Final-review fix wave (Important 7 / Important 10). This endpoint used to call
        // GetOrCreateCustomerAsync unconditionally, so simply opening the billing portal CREATED a real
        // Stripe customer -- and under the read-only-live-tables constraint that new id could never be
        // written back to users."stripeCustomerId", orphaning it permanently. Legacy stripe.ts reads the
        // column and 404s "No billing account found". Both misses are covered: a users row whose
        // stripeCustomerId is NULL, and no users row at all.
        await fixture.ResetAsync();
        if (seedUserRow)
        {
            await fixture.SeedUserAsync(userId, stripeCustomerId: null);
        }

        var gateway = new FakeStripeGateway();
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => gateway);
            });
        });
        using var client = factory.CreateClient();
        AddDevIdentity(client, userId, "student");

        var response = await client.PostAsync("/api/v1/billing/portal", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.BillingPortalCalled);
        Assert.Equal(0, gateway.GetOrCreateCustomerCalls);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No billing account found", body.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task PostBillingPortal_Anonymous_Returns401()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/billing/portal", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static void AddDevIdentity(HttpClient client, string userId, string role)
    {
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.RoleHeader, role);
    }
}
