using System.Net;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Infrastructure.Billing;
using Microsoft.Extensions.Configuration;
using Stripe;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9a final-review fix wave (Critical 1). Pins that
/// <see cref="StripeGateway.CancelSubscriptionAsync" /> schedules cancellation at the END of the paid
/// period instead of terminating the subscription immediately.
///
/// The distinction is only visible in the HTTP request Stripe.net actually issues -- Stripe.net's
/// <c>SubscriptionService.CancelAsync</c> sends <c>DELETE /v1/subscriptions/{id}</c> (immediate,
/// irreversible loss of already-paid-for access), while <c>UpdateAsync</c> with
/// <c>CancelAtPeriodEnd = true</c> sends <c>POST /v1/subscriptions/{id}</c> with
/// <c>cancel_at_period_end=true</c>, matching legacy stripe.ts's
/// <c>stripe.subscriptions.update(subId, { cancel_at_period_end: true })</c>. So this test intercepts at
/// the SDK's own <see cref="IHttpClient" /> seam and asserts on the verb, path and form body -- no live
/// network call, and no way for a future regression back to CancelAsync to pass.
/// </summary>
public class StripeGatewayCancelSubscriptionTests
{
    private const string SubscriptionJson =
        """{"id":"sub_cancel_1","object":"subscription","status":"active","cancel_at_period_end":true}""";

    [Fact]
    public async Task CancelSubscriptionAsync_PostsCancelAtPeriodEnd_NeverIssuesAnImmediateDelete()
    {
        var http = new RecordingHttpClient(SubscriptionJson);
        var gateway = NewGateway(http);

        await gateway.CancelSubscriptionAsync("sub_cancel_1", CancellationToken.None);

        Assert.Equal(1, http.RequestCount);
        Assert.Equal(HttpMethod.Post, http.LastMethod);
        Assert.NotEqual(HttpMethod.Delete, http.LastMethod);
        Assert.Equal("/v1/subscriptions/sub_cancel_1", http.LastUri!.AbsolutePath);
        Assert.Contains("cancel_at_period_end=true", http.LastBody, StringComparison.Ordinal);
    }

    [Fact]
    public async Task CancelSubscriptionAsync_DoesNotSendAnyOtherMutation()
    {
        // Guards against a fix that sets cancel_at_period_end but also, say, cancels immediately as well,
        // or clears the plan: the only parameter legacy sends on this call is cancel_at_period_end.
        var http = new RecordingHttpClient(SubscriptionJson);
        var gateway = NewGateway(http);

        await gateway.CancelSubscriptionAsync("sub_cancel_1", CancellationToken.None);

        Assert.Equal("cancel_at_period_end=true", http.LastBody);
    }

    private static StripeGateway NewGateway(IHttpClient http) => new(
        new ConfigurationBuilder().Build(),
        new StubLiveCustomerReader(),
        new StripeClient("sk_test_unit_test_only", httpClient: http));

    /// <summary>Records the request Stripe.net would have sent and answers with a canned subscription payload.</summary>
    private sealed class RecordingHttpClient(string responseJson) : IHttpClient
    {
        public int RequestCount { get; private set; }

        public HttpMethod? LastMethod { get; private set; }

        public Uri? LastUri { get; private set; }

        public string LastBody { get; private set; } = string.Empty;

        public async Task<StripeResponse> MakeRequestAsync(StripeRequest request, CancellationToken cancellationToken = default)
        {
            RequestCount++;
            LastMethod = request.Method;
            LastUri = request.Uri;
            LastBody = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);

            // HttpResponseMessage is intentionally not disposed: StripeResponse keeps the headers instance.
            var message = new HttpResponseMessage(HttpStatusCode.OK);
            return new StripeResponse(HttpStatusCode.OK, message.Headers, responseJson);
        }

        public Task<StripeStreamedResponse> MakeStreamingRequestAsync(StripeRequest request, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException("Subscription cancellation never streams.");
    }

    private sealed class StubLiveCustomerReader : ILiveCustomerReader
    {
        public Task<string?> GetStripeCustomerIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
            Task.FromResult<string?>(null);
    }
}
