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
///
/// Compares every field the shadow write path sets: status, cancelAtPeriodEnd, isActive,
/// nextBillingDate and planId. The last two were added in the Domain 9a final-review fix wave
/// (Important 2) — without them this worker was blind to the whole class of bug it exists to catch, and
/// in fact would not have flagged Important 1's nextBillingDate wipe.
/// </summary>
public sealed class BillingReconciliationService(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IBillingReconciliationService
{
    public async Task<ReconciliationResult> ReconcileAsync(CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = Command(session, """
            SELECT s."userId", s."status" AS shadow_status, s."cancelAtPeriodEnd" AS shadow_cancel, s."isActive" AS shadow_active,
                   l."status" AS live_status, l."cancelAtPeriodEnd" AS live_cancel, l."isActive" AS live_active,
                   s."nextBillingDate" AS shadow_next_billing, l."nextBillingDate" AS live_next_billing,
                   s."planId" AS shadow_plan, l."planId" AS live_plan
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

            // Final-review fix wave (Important 2). Reconciliation compared only status/cancelAtPeriodEnd/
            // isActive, which is why Important 1's bug -- the webhook writing a NULL nextBillingDate on
            // every renewal event -- could have run in shadow mode indefinitely without this worker ever
            // raising a mismatch. nextBillingDate and planId are the remaining two fields the shadow write
            // path sets, so they are now compared too.
            var shadowNextBilling = ReadNullableUtc(reader, 7);
            var liveNextBilling = ReadNullableUtc(reader, 8);
            if (shadowNextBilling != liveNextBilling)
            {
                mismatches.Add(new ReconciliationMismatch(userId, "nextBillingDate", FormatUtc(shadowNextBilling), FormatUtc(liveNextBilling)));
            }

            var shadowPlan = reader.IsDBNull(9) ? null : reader.GetString(9);
            var livePlan = reader.IsDBNull(10) ? null : reader.GetString(10);
            if (shadowPlan != livePlan)
            {
                mismatches.Add(new ReconciliationMismatch(userId, "planId", shadowPlan, livePlan));
            }
        }

        return new ReconciliationResult(total, mismatches);
    }

    /// <summary>
    /// Both columns are TIMESTAMPTZ, so Npgsql hands back a DateTime whose Kind is Utc already; SpecifyKind
    /// is belt-and-suspenders so the two sides are never compared across different Kinds.
    /// </summary>
    private static DateTimeOffset? ReadNullableUtc(DbDataReader reader, int ordinal) =>
        reader.IsDBNull(ordinal)
            ? null
            : new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(ordinal), DateTimeKind.Utc));

    private static string? FormatUtc(DateTimeOffset? value) =>
        value?.UtcDateTime.ToString("O", System.Globalization.CultureInfo.InvariantCulture);

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }
}
