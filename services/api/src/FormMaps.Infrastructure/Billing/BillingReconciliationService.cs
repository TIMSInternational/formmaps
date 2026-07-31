using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a's reconciliation read path. Diffs every shadow_user_subscriptions row against its
/// user_subscriptions counterpart by userId (LEFT JOIN from shadow -> live, since the shadow table
/// is the thing under test — a shadow row with no live match is itself a mismatch, reported as an
/// "existence" field). Read-only: runs under RequestContext.System() the same way
/// BillingShadowRepository's writes do, since shadow tables have no RLS policies. Never writes.
/// </summary>
public sealed class BillingReconciliationService(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IBillingReconciliationService
{
    public async Task<ReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """
            SELECT s."userId", s."status" AS shadow_status, s."cancelAtPeriodEnd" AS shadow_cancel, s."isActive" AS shadow_active,
                   l."status" AS live_status, l."cancelAtPeriodEnd" AS live_cancel, l."isActive" AS live_active
            FROM "shadow_user_subscriptions" s
            LEFT JOIN "user_subscriptions" l ON l."userId" = s."userId"
            """);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var mismatches = new List<ReconciliationMismatch>();
        var total = 0;
        while (await reader.ReadAsync(cancellationToken))
        {
            total++;
            var userId = reader.GetString(0);
            if (reader.IsDBNull(4))
            {
                // No live counterpart at all for this shadow row — the shadow write path recorded a
                // subscription the live table has never heard of.
                mismatches.Add(new ReconciliationMismatch(userId, "existence", "present", null));
                continue;
            }

            var shadowStatus = reader.GetString(1);
            var liveStatus = reader.GetString(4);
            if (shadowStatus != liveStatus)
            {
                mismatches.Add(new ReconciliationMismatch(userId, "status", shadowStatus, liveStatus));
            }

            var shadowCancel = reader.GetBoolean(2);
            var liveCancel = reader.GetBoolean(5);
            if (shadowCancel != liveCancel)
            {
                mismatches.Add(new ReconciliationMismatch(userId, "cancelAtPeriodEnd", shadowCancel.ToString(), liveCancel.ToString()));
            }

            var shadowActive = reader.GetBoolean(3);
            var liveActive = reader.GetBoolean(6);
            if (shadowActive != liveActive)
            {
                mismatches.Add(new ReconciliationMismatch(userId, "isActive", shadowActive.ToString(), liveActive.ToString()));
            }
        }

        return new ReconciliationResult(total, mismatches);
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }
}
