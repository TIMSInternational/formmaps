using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Runs Domain 9a's shadow/live reconciliation on a fixed interval. Never writes — read-only diff +
/// structured error log per mismatch, per the spec's "alert immediately, never silently log" exit criterion.
///
/// <para>formmaps#99: this type used to live in FormMaps.Workers. services/api/Dockerfile publishes ONLY
/// src/FormMaps.Api, and no FormMaps.Workers image / App Runner service was ever built, so the hourly job
/// had never executed in ANY deployed environment — Domain 9a's shadow mode was write-only and #44's
/// pre-cutover observation window was measuring nothing. It now lives in FormMaps.Infrastructure so
/// FormMaps.Api can host it in the existing container off the existing DATABASE_URL secret (registration
/// in FormMaps.Api/DependencyInjection.cs). FormMaps.Workers still references this project, so the
/// standalone worker host keeps hosting it too.</para>
/// </summary>
public sealed class BillingReconciliationWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<BillingReconciliationWorker> logger,
    TimeProvider timeProvider) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    private const string ShadowTableProbeSql = "SELECT to_regclass('public.shadow_user_subscriptions') IS NOT NULL";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // formmaps#99 startup guard. The shadow_* tables do NOT exist in production yet (they ship with
        // the Domain 9a migration, which is still gated). Now that this worker runs inside the API
        // container, an ungated loop would throw "relation does not exist" and log an Error EVERY HOUR
        // in the API's logs forever. Probe once at startup; if the tables are absent, log once and exit
        // the loop for the lifetime of the process — the next deploy after the migration lands turns it
        // back on. This is deliberately a start-up-only check, not a per-tick one, so the log says the
        // skip exactly once instead of hourly.
        if (!await ShadowTablesExistAsync(stoppingToken))
        {
            return;
        }

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

    /// <summary>
    /// One read-only <c>to_regclass</c> probe for the shadow table this worker diffs. Returns false —
    /// disabling the loop — when the table is absent.
    ///
    /// <para>A probe that THROWS (DB unreachable at boot, missing grant, bad DATABASE_URL) also returns
    /// false rather than rethrowing. Rethrowing is not an option: an unhandled BackgroundService
    /// exception stops the whole host in .NET 6+, which would mean a DB blip at boot takes down the
    /// entire API. Erroring hourly is the other alternative, and is exactly the log-spam this guard
    /// exists to prevent. So: log once at Error and stay off until the process restarts.</para>
    /// </summary>
    private async Task<bool> ShadowTablesExistAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var databaseSessionFactory = scope.ServiceProvider.GetRequiredService<IFormMapsDatabaseSessionFactory>();
            // System() session, matching BillingReconciliationService/BillingShadowRepository: the shadow
            // tables are .NET-internal and carry no RLS policies.
            await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
            await using var command = session.Connection.CreateCommand();
            command.Transaction = session.Transaction;
            command.CommandText = ShadowTableProbeSql;
            var probe = await command.ExecuteScalarAsync(cancellationToken);

            if (probe is bool exists && exists)
            {
                return true;
            }

            logger.LogWarning(
                "Billing reconciliation disabled for this process: table public.shadow_user_subscriptions does not exist. "
                + "Domain 9a's shadow migration has not been applied to this database; redeploy after it lands to re-enable the hourly diff.");
            return false;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Billing reconciliation disabled for this process: shadow-table probe failed");
            return false;
        }
    }
}
