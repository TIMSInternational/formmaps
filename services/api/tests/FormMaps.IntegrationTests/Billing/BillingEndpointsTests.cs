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
    /// <summary>
    /// issue #98. The frontend has never called <c>/api/v1/billing/*</c> -- apps/web calls the LEGACY
    /// paths (<c>subscriptionStatusService.ts</c> -> /api/stripe/cancel-subscription,
    /// <c>subscriptionService.ts</c> -> /api/stripe/billing-portal), so the whole v1 surface was
    /// unreachable dead code and flipping FORMMAPS_ROUTE_BILLING_TO_DOTNET moved zero traffic. .NET now
    /// ALSO serves the legacy spellings from the SAME handler delegate. Every cancel/portal case below is
    /// parameterised over both spellings: the two paths must stay behaviourally identical, and a
    /// per-path assertion is the only thing that catches an alias silently drifting (or being dropped).
    /// Note the portal's legacy spelling is "billing-portal", NOT "portal".
    /// </summary>
    private const string CancelV1Path = "/api/v1/billing/cancel-subscription";
    private const string CancelLegacyPath = "/api/stripe/cancel-subscription";
    private const string PortalV1Path = "/api/v1/billing/portal";
    private const string PortalLegacyPath = "/api/stripe/billing-portal";

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

    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_ActiveSubscription_CallsGatewayCancel_Returns200(string path)
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

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(gateway.CancelCalled);
        Assert.Equal("sub_cancel", gateway.CancelledSubscriptionId);

        // formmaps#30 added the local write to this branch (legacy stripe.ts sets cancelAtPeriodEnd on
        // the row as well as scheduling at Stripe). Status/isActive must NOT change -- the
        // customer.subscription.* webhook flips those when Stripe actually ends the subscription.
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Subscription will cancel at the end of the current period", body.RootElement.GetProperty("message").GetString());
        var row = await fixture.QueryLiveSubscriptionAsync("user_cancel");
        Assert.NotNull(row);
        Assert.True(row!.Value.CancelAtPeriodEnd);
        Assert.Equal("active", row.Value.Status);
        Assert.True(row.Value.IsActive);
        Assert.True(row.Value.UpdatedAt.Year > 2000, "updatedAt was not bound by the writer");
    }

    /// <summary>
    /// formmaps#30, the reported bug. A live row that is active but was never linked to Stripe (comped or
    /// manually granted, a pre-Stripe legacy row, a direct insert) answered 404 "No active subscription
    /// found", leaving the user with an entitlement they could not revoke. Legacy stripe.ts cancels such a
    /// row directly in the database and answers 200 "Subscription cancelled"; this now matches, and makes
    /// NO Stripe call, because there is nothing at Stripe to cancel.
    /// </summary>
    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_ActiveRowWithNoStripeId_Cancels_Returns200_WithoutCallingStripe(string path)
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveSubscriptionAsync("user_no_stripe_id", stripeSubscriptionId: null);
        var gateway = new FakeStripeGateway();
        using var factory = FactoryWith(gateway);
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_no_stripe_id", "student");

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(gateway.CancelCalled);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(body.RootElement.GetProperty("success").GetBoolean());
        Assert.Equal("Subscription cancelled", body.RootElement.GetProperty("message").GetString());

        var row = await fixture.QueryLiveSubscriptionAsync("user_no_stripe_id");
        Assert.NotNull(row);
        Assert.Equal("cancelled", row!.Value.Status);
        Assert.False(row.Value.IsActive);
        Assert.True(row.Value.UpdatedAt.Year > 2000, "updatedAt was not bound by the writer");
    }

    /// <summary>
    /// formmaps#30 idempotency, second half. The local row is active with a Stripe id, but Stripe no
    /// longer has that subscription (a missed customer.subscription.deleted). The real gateway classifies
    /// that as AlreadyGone rather than throwing; the endpoint must finish the local cancellation and
    /// answer 200 rather than surfacing a 500 that would leave the user stuck forever.
    /// </summary>
    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_StripeNoLongerHasTheSubscription_Cancels_Returns200_NotA500(string path)
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveSubscriptionAsync("user_stripe_gone", stripeSubscriptionId: "sub_gone");
        var gateway = new FakeStripeGateway { CancelOutcome = StripeCancelOutcome.AlreadyGone };
        using var factory = FactoryWith(gateway);
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_stripe_gone", "student");

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(gateway.CancelCalled);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Subscription cancelled", body.RootElement.GetProperty("message").GetString());

        var row = await fixture.QueryLiveSubscriptionAsync("user_stripe_gone");
        Assert.Equal("cancelled", row!.Value.Status);
        Assert.False(row.Value.IsActive);
    }

    /// <summary>
    /// formmaps#30. Another user's row must be untouchable, and NOT merely because the caller cannot see
    /// it. This fixture applies no RLS policies at all (see BillingDatabaseFixture) -- so if the endpoint
    /// leaned on tenant visibility instead of its own explicit <c>"userId" = caller</c> predicates, the
    /// victim's row would be found and cancelled here and this test would fail. That is the point: the
    /// production RLS policy on user_subscriptions (api/prisma/rls/003-fk-users.sql) also admits any user
    /// in the SAME SCHOOL as the row's owner, so visibility alone was never sufficient.
    /// </summary>
    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_AnotherUsersSubscription_Returns404_AndLeavesItUntouched(string path)
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveSubscriptionAsync("victim_user", stripeSubscriptionId: null);
        var gateway = new FakeStripeGateway();
        using var factory = FactoryWith(gateway);
        using var client = factory.CreateClient();
        AddDevIdentity(client, "attacker_user", "school_admin");

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.CancelCalled);

        var victim = await fixture.QueryLiveSubscriptionAsync("victim_user");
        Assert.NotNull(victim);
        Assert.Equal("active", victim!.Value.Status);
        Assert.True(victim.Value.IsActive);
        Assert.False(victim.Value.CancelAtPeriodEnd);
        Assert.Equal(2000, victim.Value.UpdatedAt.Year); // the seeded sentinel: nothing wrote this row
    }

    /// <summary>
    /// formmaps#30, the other half of "not by visibility alone". The test above is denied by the READ, so
    /// it cannot say anything about the WRITE. Here the caller legitimately owns a cancellable row and a
    /// second user's row also exists: the endpoint must cancel exactly one. With no RLS in this fixture, a
    /// LiveSubscriptionWriter whose UPDATE dropped its own <c>"userId" = @userId</c> predicate would cancel
    /// both, and only this test would notice.
    /// </summary>
    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_CancelsOnlyTheCallersRow_NeverAnotherUsers(string path)
    {
        await fixture.ResetAsync();
        await fixture.SeedLiveSubscriptionAsync("owner_user", stripeSubscriptionId: null);
        await fixture.SeedLiveSubscriptionAsync("bystander_user", stripeSubscriptionId: null);
        using var factory = FactoryWith(new FakeStripeGateway());
        using var client = factory.CreateClient();
        AddDevIdentity(client, "owner_user", "student");

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var owner = await fixture.QueryLiveSubscriptionAsync("owner_user");
        Assert.Equal("cancelled", owner!.Value.Status);

        var bystander = await fixture.QueryLiveSubscriptionAsync("bystander_user");
        Assert.Equal("active", bystander!.Value.Status);
        Assert.True(bystander.Value.IsActive);
        Assert.Equal(2000, bystander.Value.UpdatedAt.Year); // seeded sentinel: the UPDATE never reached this row
    }

    private WebApplicationFactory<Program> FactoryWith(IStripeGateway gateway) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(Environments.Development);
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton(fixture.SessionFactory);
                services.AddScoped(_ => gateway);
            });
        });

    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_NoSubscription_Returns404(string path)
    {
        // Final-review fix wave (Important 10): legacy stripe.ts answers this case with
        // res.status(404) "No active subscription found"; this endpoint previously returned 400.
        await fixture.ResetAsync();
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        AddDevIdentity(client, "user_no_sub_cancel", "student");

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_AlreadyCancelledSubscription_Returns404_WithoutCallingStripe(string path)
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

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.CancelCalled);
    }

    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_InactiveSubscription_Returns404_WithoutCallingStripe(string path)
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

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.CancelCalled);
    }

    [Theory]
    [InlineData(CancelV1Path)]
    [InlineData(CancelLegacyPath)]
    public async Task PostCancelSubscription_Anonymous_Returns401(string path)
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(PortalV1Path)]
    [InlineData(PortalLegacyPath)]
    public async Task PostBillingPortal_ExistingStripeCustomer_ReturnsPortalUrl(string path)
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

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.StartsWith("https://billing.stripe.com/", body.RootElement.GetProperty("data").GetProperty("url").GetString());
        Assert.True(gateway.BillingPortalCalled);
        // The endpoint must never take the create-a-customer path here (Important 7).
        Assert.Equal(0, gateway.GetOrCreateCustomerCalls);
    }

    [Theory]
    [InlineData(PortalV1Path, "user_portal_null_customer", true)]
    [InlineData(PortalV1Path, "user_portal_no_row", false)]
    [InlineData(PortalLegacyPath, "user_portal_null_customer", true)]
    [InlineData(PortalLegacyPath, "user_portal_no_row", false)]
    public async Task PostBillingPortal_NoStripeCustomerOnFile_Returns404_WithoutCreatingOne(string path, string userId, bool seedUserRow)
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

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.False(gateway.BillingPortalCalled);
        Assert.Equal(0, gateway.GetOrCreateCustomerCalls);
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("No billing account found", body.RootElement.GetProperty("message").GetString());
    }

    /// <summary>
    /// issue #98, the config-key bug. The endpoint built the Stripe portal return URL from
    /// <c>configuration["NEXT_PUBLIC_APP_URL"]</c>, which is NOT one of formmaps-api-prod's runtime env
    /// keys (ASPNETCORE_ENVIRONMENT, ASPNETCORE_URLS, CORS_ORIGINS, FRONTEND_BASE_URL,
    /// LegacyJwt__Audience, LegacyJwt__Issuer -- verified with apprunner describe-service), so the value
    /// always came from the hard-coded literal and the variable was decorative.
    ///
    /// FRONTEND_BASE_URL is deliberately set to a SENTINEL host here rather than left unset: with it
    /// unset, FrontendUrl falls back (localhost:3000 outside Production) and the assertion would still
    /// pass against a hard-coded string, proving nothing about whether configuration is read at all. The
    /// sentinel can only appear in the captured URL if the env var is genuinely the source.
    ///
    /// The path is legacy stripe.ts:387's <c>/dashboard/subscriptions</c>, not <c>/dashboard/settings</c>.
    ///
    /// FrontendUrl reads the process-wide environment variable directly (not IConfiguration), so
    /// builder.UseSetting cannot drive it -- hence the scoped set/restore, same pattern as JwtSecretScope.
    /// </summary>
    [Theory]
    [InlineData(PortalV1Path)]
    [InlineData(PortalLegacyPath)]
    public async Task PostBillingPortal_ReturnUrl_ComesFromFrontendBaseUrl_AndPointsAtSubscriptions(string path)
    {
        const string Sentinel = "https://sentinel-frontend.invalid";
        await fixture.ResetAsync();
        await fixture.SeedUserAsync("user_portal_returnurl", stripeCustomerId: "cus_on_file");
        var gateway = new FakeStripeGateway();

        using (new EnvironmentVariableScope("FRONTEND_BASE_URL", Sentinel))
        {
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
            AddDevIdentity(client, "user_portal_returnurl", "student");

            var response = await client.PostAsync(path, null);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        Assert.True(gateway.BillingPortalCalled);
        Assert.Equal($"{Sentinel}/dashboard/subscriptions", gateway.CapturedReturnUrl);
    }

    /// <summary>
    /// Sets a process-wide environment variable for the scope and restores the previous value -- including
    /// restoring "unset". Same shape as <see cref="JwtSecretScope" />; kept local because FRONTEND_BASE_URL
    /// has no other test-side reader or writer in this suite (verified by grep), so there is nothing to
    /// serialize a shared collection against.
    /// </summary>
    private sealed class EnvironmentVariableScope : IDisposable
    {
        private readonly string name;
        private readonly string? previousValue;

        public EnvironmentVariableScope(string name, string? value)
        {
            this.name = name;
            previousValue = Environment.GetEnvironmentVariable(name);
            Environment.SetEnvironmentVariable(name, value);
        }

        public void Dispose() => Environment.SetEnvironmentVariable(name, previousValue);
    }

    [Theory]
    [InlineData(PortalV1Path)]
    [InlineData(PortalLegacyPath)]
    public async Task PostBillingPortal_Anonymous_Returns401(string path)
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsync(path, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private static void AddDevIdentity(HttpClient client, string userId, string role)
    {
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.UserIdHeader, userId);
        client.DefaultRequestHeaders.Add(DevelopmentRequestContextFactory.RoleHeader, role);
    }
}
