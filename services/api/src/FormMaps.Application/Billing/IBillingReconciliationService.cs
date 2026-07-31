namespace FormMaps.Application.Billing;

public sealed record ReconciliationMismatch(string UserId, string Field, string? ShadowValue, string? LiveValue);

public sealed record ReconciliationResult(int TotalCompared, IReadOnlyList<ReconciliationMismatch> Mismatches);

/// <summary>
/// Domain 9a's reconciliation rail: diffs every shadow_user_subscriptions row against its
/// user_subscriptions counterpart by userId. This is the safety mechanism that catches a bug in the
/// webhook write path (BillingShadowRepository) before real users are affected — it never writes,
/// only compares and reports. See BillingReconciliationWorker for the hourly BackgroundService that
/// runs this and logs mismatches at Error level.
/// </summary>
public interface IBillingReconciliationService
{
    Task<ReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default);
}
