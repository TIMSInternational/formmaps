using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Shadow-table writer for Domain 9a. Ports the subscription-only paths of legacy
/// applyStripeWebhookEvent (stripeService.ts) — checkout.session.completed (subscription mode),
/// customer.subscription.updated/deleted, invoice.payment_failed. Booking/payment-intent paths
/// are Domain 9b, out of scope here. Idempotency: event row written LAST in the same transaction,
/// exactly matching legacy's DB-based dedup (see stripe.ts:344-390). Shadow tables have no RLS
/// policies (.NET-internal, not tenant-scoped legacy tables), so writes run under
/// RequestContext.System() -> TenantGucPlanResolver's IsSystem branch -> bypass-RLS mode.
/// </summary>
public sealed class BillingShadowRepository(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IBillingShadowRepository
{
    public async Task<bool> ApplySubscriptionEventAsync(
        string eventId, string eventType, string userId, string? planId, StripeSubscriptionLite subscription,
        CancellationToken cancellationToken = default)
    {
        var record = StripeSubscriptionMapper.ToRecord(subscription, planId);
        return await RunTransactionAsync(eventId, eventType, async session =>
        {
            await using var upsert = Command(session, """
                INSERT INTO "shadow_user_subscriptions"
                    ("id", "userId", "planId", "status", "nextBillingDate", "stripeSubscriptionId", "cancelAtPeriodEnd", "isActive", "updatedAt")
                VALUES (@id, @userId, @planId, @status, @nextBillingDate, @stripeSubscriptionId, @cancelAtPeriodEnd, @isActive, now())
                ON CONFLICT ("userId") DO UPDATE SET
                    "planId" = COALESCE(@planId, "shadow_user_subscriptions"."planId"),
                    "status" = @status, "nextBillingDate" = @nextBillingDate,
                    "stripeSubscriptionId" = @stripeSubscriptionId, "cancelAtPeriodEnd" = @cancelAtPeriodEnd,
                    "isActive" = @isActive, "updatedAt" = now()
                """);
            AddParameter(upsert, "id", Guid.NewGuid().ToString());
            AddParameter(upsert, "userId", userId);
            AddParameter(upsert, "planId", (object?)record.PlanId ?? DBNull.Value);
            AddParameter(upsert, "status", record.Status);
            AddParameter(upsert, "nextBillingDate", (object?)record.NextBillingDate?.UtcDateTime ?? DBNull.Value);
            AddParameter(upsert, "stripeSubscriptionId", record.StripeSubscriptionId);
            AddParameter(upsert, "cancelAtPeriodEnd", record.CancelAtPeriodEnd);
            AddParameter(upsert, "isActive", record.IsActive);
            await upsert.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task<bool> MarkSubscriptionCancelledAsync(
        string eventId, string eventType, string stripeSubscriptionId, StripeSubscriptionLite subscription,
        CancellationToken cancellationToken = default)
    {
        var record = StripeSubscriptionMapper.ToRecord(subscription);
        return await RunTransactionAsync(eventId, eventType, async session =>
        {
            await using var update = Command(session, """
                UPDATE "shadow_user_subscriptions" SET
                    "status" = @status, "nextBillingDate" = @nextBillingDate,
                    "cancelAtPeriodEnd" = @cancelAtPeriodEnd, "isActive" = @isActive, "updatedAt" = now()
                WHERE "stripeSubscriptionId" = @stripeSubscriptionId
                """);
            AddParameter(update, "status", record.Status);
            AddParameter(update, "nextBillingDate", (object?)record.NextBillingDate?.UtcDateTime ?? DBNull.Value);
            AddParameter(update, "cancelAtPeriodEnd", record.CancelAtPeriodEnd);
            AddParameter(update, "isActive", record.IsActive);
            AddParameter(update, "stripeSubscriptionId", stripeSubscriptionId);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    /// <summary>Runs `write` then records the event id LAST — matches legacy's rollback-on-failure idempotency guarantee. Returns false without running `write` if eventId was already processed.</summary>
    private async Task<bool> RunTransactionAsync(string eventId, string eventType, Func<FormMapsDatabaseSession, Task> write, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(RequestContext.System(), cancellationToken);

        await using var existing = Command(session, """SELECT 1 FROM "shadow_stripe_events" WHERE "id" = @id""");
        AddParameter(existing, "id", eventId);
        if (await existing.ExecuteScalarAsync(cancellationToken) is not null)
        {
            return false;
        }

        await write(session);

        await using var recordEvent = Command(session, """
            INSERT INTO "shadow_stripe_events" ("id", "eventType") VALUES (@id, @eventType)
            """);
        AddParameter(recordEvent, "id", eventId);
        AddParameter(recordEvent, "eventType", eventType);
        await recordEvent.ExecuteNonQueryAsync(cancellationToken);

        await session.CommitAsync(cancellationToken);
        return true;
    }

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
