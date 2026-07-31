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
/// checkout.session.completed fallback (TEMPORARY, scoped to this task): the real fix — fetching the
/// live Stripe.Subscription for accurate current_period_end/trial_end via IStripeGateway.GetSubscriptionAsync
/// — doesn't exist until Task 8. Until then, this handler falls back to the checkout event's own embedded
/// fields (subscription id, hardcoded "active" status, no period-end data). Task 8 must delete this
/// fallback branch and replace it with a real subscription fetch.
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
        IConfiguration configuration, CancellationToken cancellationToken)
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
                    var lite = new StripeSubscriptionLite(session.SubscriptionId, "active", null, null, null, false);
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
                    var lite = new StripeSubscriptionLite(sub.Id, sub.Status, null, null, null, sub.CancelAtPeriodEnd);
                    await repository.MarkSubscriptionCancelledAsync(stripeEvent.Id, stripeEvent.Type, sub.Id, lite, cancellationToken);
                }
                break;
            }
        }

        return Results.Ok(new { received = true });
    }
}
