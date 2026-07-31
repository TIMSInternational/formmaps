using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Infrastructure.Billing;
using Microsoft.Extensions.Configuration;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9a Task 8 fix round 1 (Finding 1). Proves StripeGateway.GetOrCreateCustomerAsync looks up an
/// existing Stripe customer id via ILiveCustomerReader before ever reaching Stripe's
/// CustomerService.CreateAsync. Exercises the real StripeGateway class (not FakeStripeGateway) with a
/// fake ILiveCustomerReader -- the "found" branch returns before StripeGateway ever constructs a
/// CustomerService, so no live network call is possible; a pre-cancelled CancellationToken is passed as a
/// belt-and-suspenders guard so that if the implementation regresses and falls through to the create
/// path, the Stripe SDK throws immediately on the cancelled token instead of this test hanging on (or
/// silently attempting) a real network call.
/// </summary>
public class StripeGatewayCustomerLookupTests
{
    [Fact]
    public async Task GetOrCreateCustomerAsync_ExistingCustomerIdOnFile_ReturnsItWithoutCallingStripeCreate()
    {
        var reader = new FakeLiveCustomerReader(existingCustomerId: "cus_existing_123");
        var gateway = new StripeGateway(new ConfigurationBuilder().Build(), reader);

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var result = await gateway.GetOrCreateCustomerAsync(RequestContext.System(), "user_1", email: null, cts.Token);

        Assert.Equal("cus_existing_123", result);
        Assert.Equal(1, reader.GetStripeCustomerIdCalls);
    }

    [Fact]
    public async Task GetOrCreateCustomerAsync_ConsultsReaderWithGivenContextAndUserId()
    {
        var reader = new FakeLiveCustomerReader(existingCustomerId: "cus_abc");
        var gateway = new StripeGateway(new ConfigurationBuilder().Build(), reader);
        var context = RequestContext.System();

        await gateway.GetOrCreateCustomerAsync(context, "user_42", email: null, CancellationToken.None);

        Assert.Same(context, reader.LastContext);
        Assert.Equal("user_42", reader.LastUserId);
    }

    private sealed class FakeLiveCustomerReader(string? existingCustomerId) : ILiveCustomerReader
    {
        public int GetStripeCustomerIdCalls { get; private set; }

        public RequestContext? LastContext { get; private set; }

        public string? LastUserId { get; private set; }

        public Task<string?> GetStripeCustomerIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
        {
            GetStripeCustomerIdCalls++;
            LastContext = context;
            LastUserId = userId;
            return Task.FromResult(existingCustomerId);
        }
    }
}
