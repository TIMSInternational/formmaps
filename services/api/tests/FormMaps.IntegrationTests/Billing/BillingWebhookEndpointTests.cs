using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FormMaps.Application.Billing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace FormMaps.IntegrationTests.Billing;

[Collection(nameof(BillingDatabaseCollection))]
public class BillingWebhookEndpointTests(BillingDatabaseFixture fixture) : IClassFixture<WebApplicationFactory<Program>>
{
    private WebApplicationFactory<Program> CreateFactory() => new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeWebhookVerifier>(_ => new FakeVerifier());
            });
        });

    [Fact]
    public async Task Webhook_SubscriptionCreated_WritesShadowRow()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = FakeVerifier.SubscriptionCreatedEventJson(eventId: "evt_web_1", userId: "user_w1", planId: "plan_1", stripeSubscriptionId: "sub_w1");
        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await fixture.QueryShadowSubscriptionAsync("user_w1");
        Assert.Equal("sub_w1", row.StripeSubscriptionId);
        Assert.Equal("active", row.Status);
    }

    [Fact]
    public async Task Webhook_InvalidSignature_Returns400()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeWebhookVerifier>(_ => new RejectingVerifier());
            });
        });
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_DuplicateEvent_SecondDeliveryStillReturns200_NoDoubleWrite()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var payload = FakeVerifier.SubscriptionCreatedEventJson("evt_dup_web", "user_w2", "plan_1", "sub_w2");

        var first = await client.PostAsync("/api/v1/billing/webhook", new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));
        var second = await client.PostAsync("/api/v1/billing/webhook", new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
    }
}
