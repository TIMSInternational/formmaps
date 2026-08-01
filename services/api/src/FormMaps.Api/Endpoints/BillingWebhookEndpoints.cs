using System.Text.Json;
using FormMaps.Application.Billing;
using Stripe;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Domain 9a shadow webhook. Deliberately UNAUTHENTICATED (Stripe can't send a bearer token) —
/// integrity comes entirely from signature verification, not RequestContext. Writes only to
/// shadow tables (see IBillingShadowRepository) — never touches live billing state. See
/// spec docs/superpowers/specs/2026-07-31-domain9a-billing-subscriptions-design.md.
/// Exempted from JsonBodySanitizationMiddleware (Task 4 fix round 1 — required for real Stripe
/// signature verification to work, since that middleware can mutate the raw request body). Still
/// NOT exempted from MutationContentTypeMiddleware/RequestTimeoutMiddleware — that's Task 5's job.
///
/// checkout.session.completed (Task 8 retrofit): fetches the live Stripe.Subscription for accurate
/// status/current_period_end/trial_end via IStripeGateway.GetSubscriptionAsync, replacing the Task 4
/// temporary fallback that constructed a StripeSubscriptionLite from the checkout event's own embedded
/// fields (subscription id, hardcoded "active" status, no period-end data).
///
/// Handled event types: checkout.session.completed, customer.subscription.updated,
/// customer.subscription.deleted, invoice.payment_failed. Anything else is acknowledged with 200 and
/// ignored (Stripe retries non-2xx forever, so silence must be a 200, not a 4xx).
/// </summary>
public static class BillingWebhookEndpoints
{
    public static IEndpointRouteBuilder MapBillingWebhookEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/v1/billing/webhook", HandleWebhookAsync);
        return app;
    }

    private static async Task<IResult> HandleWebhookAsync(
        HttpRequest request, IStripeWebhookVerifier verifier, IBillingShadowRepository repository,
        IStripeGateway gateway, IConfiguration configuration, CancellationToken cancellationToken)
    {
        request.EnableBuffering();
        using var reader = new StreamReader(request.Body, leaveOpen: true);
        var payload = await reader.ReadToEndAsync(cancellationToken);
        request.Body.Position = 0;

        var signature = request.Headers["Stripe-Signature"].ToString();
        var webhookSecret = configuration["STRIPE_WEBHOOK_SECRET"] ?? string.Empty;

        Event stripeEvent;
        try
        {
            stripeEvent = verifier.Verify(payload, signature, webhookSecret);
        }
        catch (StripeException)
        {
            return Results.BadRequest(new { success = false, message = "Invalid webhook signature" });
        }

        switch (stripeEvent.Type)
        {
            case "checkout.session.completed":
            {
                var session = stripeEvent.Data.Object as Stripe.Checkout.Session;
                if (session?.Mode == "subscription" &&
                    session.Metadata is not null &&
                    session.Metadata.TryGetValue("userId", out var userId) &&
                    session.Metadata.TryGetValue("planId", out var planId) &&
                    !string.IsNullOrEmpty(session.SubscriptionId))
                {
                    var lite = await gateway.GetSubscriptionAsync(session.SubscriptionId, cancellationToken);
                    await repository.ApplySubscriptionEventAsync(stripeEvent.Id, stripeEvent.Type, userId, planId, lite, cancellationToken);
                }
                break;
            }
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
            {
                var sub = stripeEvent.Data.Object as Stripe.Subscription;
                if (sub is not null)
                {
                    // Final-review fix wave (Important 1): this used to hand-build the lite record as
                    // `new StripeSubscriptionLite(sub.Id, sub.Status, null, null, null, sub.CancelAtPeriodEnd)`,
                    // hardcoding all three period-end fields to null. StripeSubscriptionMapper.ToRecord
                    // resolves nextBillingDate from exactly those fields, so every customer.subscription.updated
                    // event -- i.e. every renewal, the single most common lifecycle event -- wrote a NULL
                    // nextBillingDate over the correct one. StripeSubscriptionMapper.ToLite extracts them
                    // properly from the real Stripe.Subscription already on hand.
                    var lite = StripeSubscriptionMapper.ToLite(sub);
                    await repository.MarkSubscriptionCancelledAsync(stripeEvent.Id, stripeEvent.Type, sub.Id, lite, cancellationToken);
                }
                break;
            }
            case "invoice.payment_failed":
            {
                // Final-review fix wave (Important 3). BillingShadowRepository's class summary claimed this
                // event was ported, but no case existed for it. Legacy stripeService.ts sets exactly one
                // column on the matching subscription: status = "past_due".
                var subscriptionId = ResolveInvoiceSubscriptionId(stripeEvent.Data.Object as Invoice);
                if (!string.IsNullOrEmpty(subscriptionId))
                {
                    await repository.MarkSubscriptionPastDueAsync(stripeEvent.Id, stripeEvent.Type, subscriptionId, cancellationToken);
                }
                break;
            }
        }

        return Results.Ok(new { received = true });
    }

    /// <summary>
    /// Where the subscription id lives on an invoice depends on the API version the event was serialised
    /// with, and a webhook endpoint receives whatever version the Stripe ACCOUNT is pinned to — not
    /// necessarily the one Stripe.net 52.2.0 compiles against.
    /// </summary>
    /// <remarks>
    /// Stripe.net 52.2.0's <see cref="Invoice" /> has no top-level SubscriptionId property at all
    /// (confirmed by reflection against the installed package): the current API shape nests it at
    /// <c>parent.subscription_details.subscription</c>, surfaced as
    /// <c>Invoice.Parent.SubscriptionDetails.SubscriptionId</c>. Older API versions — the shape legacy
    /// stripeService.ts reads, as <c>invoice.subscription</c> — put it at the invoice root, where the
    /// current SDK simply does not map it. Both were verified against the real SDK; the raw-JSON fallback
    /// is what keeps a legitimately older-versioned account's payment_failed events from silently
    /// no-oping.
    /// </remarks>
    private static string? ResolveInvoiceSubscriptionId(Invoice? invoice)
    {
        if (invoice is null)
        {
            return null;
        }

        var fromParent = invoice.Parent?.SubscriptionDetails?.SubscriptionId;
        if (!string.IsNullOrEmpty(fromParent))
        {
            return fromParent;
        }

        if (invoice.RawJsonElement is { ValueKind: JsonValueKind.Object } raw &&
            raw.TryGetProperty("subscription", out var legacy) &&
            legacy.ValueKind == JsonValueKind.String)
        {
            return legacy.GetString();
        }

        return null;
    }
}
