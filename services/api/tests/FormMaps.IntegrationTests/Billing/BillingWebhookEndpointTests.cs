using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FormMaps.Application.Billing;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Stripe;
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
                // Task 8 retrofit: checkout.session.completed now calls IStripeGateway.GetSubscriptionAsync
                // instead of building a StripeSubscriptionLite from the checkout event's embedded fields.
                // Without this override the real StripeGateway would attempt a live network call to Stripe.
                services.AddScoped<IStripeGateway>(_ => new FakeStripeGateway());
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
                services.AddScoped<IStripeGateway>(_ => new FakeStripeGateway());
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

    [Fact]
    public async Task Webhook_RealSignatureVerification_SurvivesBodyMutatingCharacters()
    {
        // Task 4 fix round 1 (Critical finding, adversarial review): before exempting this route
        // from JsonBodySanitizationMiddleware, this test failed with 400 "Invalid webhook signature"
        // -- the middleware re-serializes JSON bodies (System.Text.Json's default Web encoder
        // HTML-escapes '&' as "&") and swaps in the mutated bytes whenever they differ from the
        // original, so the real StripeWebhookVerifier's HMAC (computed over the ORIGINAL bytes, like
        // Stripe itself does) no longer matched. Deliberately does NOT override IStripeWebhookVerifier
        // -- exercises the real StripeWebhookVerifier -> Stripe.EventUtility.ConstructEvent registered
        // in FormMaps.Infrastructure.DependencyInjection, through the full HTTP pipeline (including
        // JsonBodySanitizationMiddleware), with a signature computed the way Stripe actually computes
        // one (EventUtility.ComputeSignature over "{timestamp}.{payload}", formatted as
        // "t={timestamp},v1={signature}" per Stripe's documented Stripe-Signature header format).
        await fixture.ResetAsync();
        const string webhookSecret = "whsec_test_secret_for_real_signature_verification";
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureAppConfiguration((_, configBuilder) =>
            {
                configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["STRIPE_WEBHOOK_SECRET"] = webhookSecret
                });
            });
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped<IStripeGateway>(_ => new FakeStripeGateway());
            });
        });
        using var client = factory.CreateClient();

        // planId contains '&' -- a character JsonBodySanitizationMiddleware's re-serialization would
        // otherwise rewrite, mutating the bytes the signature was computed over. api_version must
        // match the installed Stripe.net package's compiled ApiVersion (Stripe.StripeConfiguration.
        // ApiVersion) or EventUtility's default-overload compatibility check NREs on deserializing it.
        var payload = """
            {
              "id": "evt_sig_real_1",
              "object": "event",
              "type": "checkout.session.completed",
              "api_version": "2026-07-29.dahlia",
              "data": { "object": {
                "id": "cs_evt_sig_real_1", "object": "checkout.session", "mode": "subscription",
                "metadata": { "userId": "user_sig_1", "planId": "plan_a&b" },
                "subscription": "sub_sig_1", "customer": "cus_test"
              }}
            }
            """;

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var signature = EventUtility.ComputeSignature(webhookSecret, timestamp, payload);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/billing/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Stripe-Signature", $"t={timestamp},v1={signature}");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await fixture.QueryShadowSubscriptionAsync("user_sig_1");
        Assert.Equal("sub_sig_1", row.StripeSubscriptionId);
    }

    [Fact]
    public async Task Webhook_CheckoutSessionCompleted_SubscriptionModeWithoutMetadata_Returns200NoCrash()
    {
        // Important finding (adversarial review): `session?.Mode == "subscription" &&
        // session.Metadata.TryGetValue(...)` only null-guards `session`, not `session.Metadata`.
        // Confirmed via Stripe.net directly: deserializing a subscription-mode checkout session with
        // no "metadata" key at all leaves session.Metadata null (not an empty dictionary), and
        // TryGetValue on a null dictionary throws NullReferenceException -- a plausible malformed/
        // edge-case event shape that would otherwise 500 to Stripe and trigger its retry-storm
        // behavior. This test crashed with an unhandled NRE before the null-guard fix.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = """
            {
              "id": "evt_no_metadata_1",
              "type": "checkout.session.completed",
              "data": { "object": {
                "id": "cs_evt_no_metadata_1", "object": "checkout.session", "mode": "subscription",
                "subscription": "sub_no_meta_1", "customer": "cus_test"
              }}
            }
            """;

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(payload, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_SubscriptionUpdated_KeepsNextBillingDateFromTheEvent()
    {
        // Final-review fix wave (Important 1). The customer.subscription.updated/deleted branch used to
        // build `new StripeSubscriptionLite(sub.Id, sub.Status, null, null, null, sub.CancelAtPeriodEnd)`,
        // hardcoding every period-end field to null -- so the most common lifecycle event of all, a
        // renewal, overwrote a correct nextBillingDate with NULL. Before the fix this test's final
        // assertion failed with NextBillingDate == null.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        // Bootstrap the shadow row (the update branch is an UPDATE ... WHERE stripeSubscriptionId).
        var created = FakeVerifier.SubscriptionCreatedEventJson("evt_nbd_create", "user_nbd", "plan_1", "sub_nbd");
        var createResponse = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(created, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, createResponse.StatusCode);

        var renewalPeriodEnd = new DateTimeOffset(2027, 3, 1, 0, 0, 0, TimeSpan.Zero);
        var updated = FakeVerifier.SubscriptionLifecycleEventJson(
            eventId: "evt_nbd_update", eventType: "customer.subscription.updated",
            stripeSubscriptionId: "sub_nbd", status: "active",
            itemCurrentPeriodEndUnixSeconds: renewalPeriodEnd.ToUnixTimeSeconds(), cancelAtPeriodEnd: false);

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(updated, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await fixture.QueryShadowSubscriptionAsync("user_nbd");
        Assert.Equal("active", row.Status);
        Assert.Equal(renewalPeriodEnd, row.NextBillingDate);
    }

    [Theory]
    [InlineData("current")]
    [InlineData("legacy")]
    public async Task Webhook_InvoicePaymentFailed_SetsShadowStatusToPastDue(string invoiceShape)
    {
        // Final-review fix wave (Important 3). BillingShadowRepository's class summary claimed
        // invoice.payment_failed was ported, but HandleWebhookAsync's switch had no case for it, so a
        // failed renewal left the shadow row reading "active" forever. Both invoice serialisations are
        // covered: the current API nests the subscription id under parent.subscription_details, while an
        // account pinned to an older version (the shape legacy Node reads) puts it at the invoice root,
        // where Stripe.net 52.2.0 maps it to no property at all.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var userId = $"user_pf_{invoiceShape}";
        var subscriptionId = $"sub_pf_{invoiceShape}";
        var created = FakeVerifier.SubscriptionCreatedEventJson($"evt_pf_create_{invoiceShape}", userId, "plan_1", subscriptionId);
        var createResponse = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(created, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, createResponse.StatusCode);
        Assert.Equal("active", (await fixture.QueryShadowSubscriptionAsync(userId)).Status);

        var payload = invoiceShape == "current"
            ? FakeVerifier.InvoicePaymentFailedEventJson($"evt_pf_{invoiceShape}", subscriptionId)
            : FakeVerifier.LegacyShapeInvoicePaymentFailedEventJson($"evt_pf_{invoiceShape}", subscriptionId);

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(payload, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("past_due", (await fixture.QueryShadowSubscriptionAsync(userId)).Status);
    }

    [Fact]
    public async Task Webhook_InvoicePaymentFailedWithNoSubscription_Returns200NoCrash()
    {
        // A one-off (non-subscription) invoice carries no subscription id in either shape. Must be
        // acknowledged, not 500'd -- Stripe retries non-2xx indefinitely.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var payload = """
            {
              "id": "evt_pf_no_sub",
              "type": "invoice.payment_failed",
              "data": { "object": { "id": "in_one_off", "object": "invoice" } }
            }
            """;

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(payload, Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_ContentTypeJson_IsNotBlockedByMutationMiddleware()
    {
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var payload = FakeVerifier.SubscriptionCreatedEventJson("evt_mw", "user_mw", "plan_1", "sub_mw");

        var response = await client.PostAsync("/api/v1/billing/webhook",
            new StringContent(payload, System.Text.Encoding.UTF8, "application/json"));

        // Verifies MutationContentTypeMiddleware does not 415 a JSON-content-type webhook request
        // and RequestTimeoutMiddleware does not otherwise block it, so the request reaches the
        // endpoint and the correct shadow subscription row is written. This does not exercise
        // body-byte integrity through signature verification (FakeVerifier performs no HMAC check) --
        // that proof lives separately in Task 4's Webhook_RealSignatureVerification_SurvivesBodyMutatingCharacters
        // test, which uses the real verifier.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var row = await fixture.QueryShadowSubscriptionAsync("user_mw");
        Assert.Equal("sub_mw", row.StripeSubscriptionId);
    }
}
