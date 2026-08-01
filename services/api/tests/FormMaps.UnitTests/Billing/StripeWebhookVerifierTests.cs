using FormMaps.Infrastructure.Billing;
using Stripe;

namespace FormMaps.UnitTests.Billing;

/// <summary>
/// Domain 9a final-review fix wave (Important 4). Pins the two halves of
/// <see cref="StripeWebhookVerifier" />'s contract that must not move together:
/// a correctly signed event whose api_version differs from the SDK's compiled one is ACCEPTED (it used
/// to throw StripeException, which BillingWebhookEndpoints could only report as
/// 400 "Invalid webhook signature" — a permanent rejection of legitimate traffic from any Stripe account
/// pinned to an older API version), while a tampered or absent signature is still REJECTED.
///
/// Signatures are computed the way Stripe itself computes them (EventUtility.ComputeSignature over
/// "{timestamp}.{payload}", header formatted "t={timestamp},v1={signature}"), so this exercises the real
/// HMAC path — no live network call and no fake verifier.
/// </summary>
public class StripeWebhookVerifierTests
{
    private const string WebhookSecret = "whsec_unit_test_secret_for_signature_verification";

    /// <summary>Deliberately NOT StripeConfiguration.ApiVersion — the point is that it differs.</summary>
    private const string OlderAccountApiVersion = "2020-08-27";

    private static string EventJson(string apiVersion) => $$"""
        {
          "id": "evt_api_version_probe",
          "object": "event",
          "type": "customer.subscription.updated",
          "api_version": "{{apiVersion}}",
          "data": { "object": { "id": "sub_probe", "object": "subscription", "status": "active" } }
        }
        """;

    [Fact]
    public void Verify_OlderAccountApiVersion_WithValidSignature_Succeeds()
    {
        var payload = EventJson(OlderAccountApiVersion);
        Assert.NotEqual(OlderAccountApiVersion, StripeConfiguration.ApiVersion);

        var stripeEvent = new StripeWebhookVerifier().Verify(payload, SignatureHeaderFor(payload), WebhookSecret);

        Assert.Equal("evt_api_version_probe", stripeEvent.Id);
        Assert.Equal("customer.subscription.updated", stripeEvent.Type);
    }

    [Fact]
    public void Verify_MatchingApiVersion_WithValidSignature_StillSucceeds()
    {
        var payload = EventJson(StripeConfiguration.ApiVersion);

        var stripeEvent = new StripeWebhookVerifier().Verify(payload, SignatureHeaderFor(payload), WebhookSecret);

        Assert.Equal("evt_api_version_probe", stripeEvent.Id);
    }

    [Fact]
    public void Verify_TamperedSignature_StillThrows()
    {
        // The whole risk of relaxing throwOnApiVersionMismatch is that it might weaken signature checking.
        // It does not: the api-version comparison is a separate step from HMAC verification.
        var payload = EventJson(OlderAccountApiVersion);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

        var exception = Assert.Throws<StripeException>(() =>
            new StripeWebhookVerifier().Verify(payload, $"t={timestamp},v1=0000000000000000000000000000000000000000000000000000000000000000", WebhookSecret));

        Assert.Contains("signature", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Verify_SignatureFromTheWrongSecret_StillThrows()
    {
        var payload = EventJson(OlderAccountApiVersion);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var wrongSecretSignature = EventUtility.ComputeSignature("whsec_a_completely_different_secret", timestamp, payload);

        Assert.Throws<StripeException>(() =>
            new StripeWebhookVerifier().Verify(payload, $"t={timestamp},v1={wrongSecretSignature}", WebhookSecret));
    }

    [Fact]
    public void Verify_PayloadTamperedAfterSigning_StillThrows()
    {
        var payload = EventJson(OlderAccountApiVersion);
        var header = SignatureHeaderFor(payload);
        var tamperedPayload = payload.Replace("sub_probe", "sub_attacker", StringComparison.Ordinal);

        Assert.Throws<StripeException>(() => new StripeWebhookVerifier().Verify(tamperedPayload, header, WebhookSecret));
    }

    private static string SignatureHeaderFor(string payload)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        return $"t={timestamp},v1={EventUtility.ComputeSignature(WebhookSecret, timestamp, payload)}";
    }
}
