namespace FormMaps.Application.Billing;

/// <summary>
/// Domain 9a Task 8. Small read interface over subscription_plans, needed by POST /checkout-session to
/// validate the caller's planId and resolve its Stripe Price id. Folded into this task rather than a
/// separate one, per Task Right-Sizing.
/// </summary>
public sealed record PlanRow(string Id, string? StripePriceId, bool IsActive);

public interface IPlanReader
{
    Task<PlanRow?> GetActiveByIdAsync(string planId, CancellationToken cancellationToken = default);
}
