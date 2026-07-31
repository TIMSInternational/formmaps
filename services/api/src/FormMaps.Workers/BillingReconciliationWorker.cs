using FormMaps.Application.Billing;

namespace FormMaps.Workers;

/// <summary>Runs Domain 9a's shadow/live reconciliation on a fixed interval. Never writes — read-only diff + structured error log per mismatch, per the spec's "alert immediately, never silently log" exit criterion.</summary>
public sealed class BillingReconciliationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<BillingReconciliationWorker> logger,
    TimeProvider timeProvider) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // IBillingReconciliationService is Scoped (it depends on the Scoped
                // IFormMapsDatabaseSessionFactory), so each run gets its own scope — this
                // BackgroundService itself is a Singleton.
                await using var scope = scopeFactory.CreateAsyncScope();
                var reconciliationService = scope.ServiceProvider.GetRequiredService<IBillingReconciliationService>();
                var result = await reconciliationService.ReconcileAsync(stoppingToken);
                if (result.Mismatches.Count > 0)
                {
                    foreach (var mismatch in result.Mismatches)
                    {
                        logger.LogError(
                            "Billing reconciliation mismatch: user={UserId} field={Field} shadow={ShadowValue} live={LiveValue}",
                            mismatch.UserId, mismatch.Field, mismatch.ShadowValue, mismatch.LiveValue);
                    }
                }
                else
                {
                    logger.LogInformation("Billing reconciliation clean: {Count} subscriptions compared", result.TotalCompared);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Billing reconciliation run failed");
            }

            try { await Task.Delay(Interval, timeProvider, stoppingToken); }
            catch (OperationCanceledException) { }
        }
    }
}
