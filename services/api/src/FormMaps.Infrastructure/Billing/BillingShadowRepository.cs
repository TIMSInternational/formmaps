using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Shadow-table writer for Domain 9a. Ports the subscription-only paths of legacy
/// applyStripeWebhookEvent (stripeService.ts) — checkout.session.completed (subscription mode),
/// customer.subscription.updated/deleted, and (as of the final-review fix wave, Important 3)
/// invoice.payment_failed via <see cref="MarkSubscriptionPastDueAsync" />. Booking/payment-intent paths
/// are Domain 9b, out of scope here. Idempotency: event row written LAST in the same transaction,
/// exactly matching legacy's DB-based dedup (see stripe.ts:344-390). Shadow tables have no RLS
/// policies (.NET-internal, not tenant-scoped legacy tables), so writes run under
/// RequestContext.System() -> TenantGucPlanResolver's IsSystem branch -> bypass-RLS mode.
/// </summary>
public sealed class BillingShadowRepository(
    IFormMapsDatabaseSessionFactory databaseSessionFactory,
    ILogger<BillingShadowRepository> logger) : IBillingShadowRepository
{
    /// <summary>Names the subtransaction that makes conflict classification possible without a second connection.</summary>
    private const string BeforeWriteSavepoint = "before_shadow_write";

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
            var affected = await update.ExecuteNonQueryAsync(cancellationToken);
            WarnIfNoShadowRowMatched(affected, eventId, eventType, stripeSubscriptionId);
        }, cancellationToken);
    }

    /// <inheritdoc cref="IBillingShadowRepository.MarkSubscriptionPastDueAsync" />
    public async Task<bool> MarkSubscriptionPastDueAsync(
        string eventId, string eventType, string stripeSubscriptionId, CancellationToken cancellationToken = default)
    {
        return await RunTransactionAsync(eventId, eventType, async session =>
        {
            // Exactly legacy's `data: { status: "past_due" }` — no other column is touched, because the
            // invoice event carries no subscription object to derive one from.
            await using var update = Command(session, """
                UPDATE "shadow_user_subscriptions" SET "status" = 'past_due', "updatedAt" = now()
                WHERE "stripeSubscriptionId" = @stripeSubscriptionId
                """);
            AddParameter(update, "stripeSubscriptionId", stripeSubscriptionId);
            var affected = await update.ExecuteNonQueryAsync(cancellationToken);
            WarnIfNoShadowRowMatched(affected, eventId, eventType, stripeSubscriptionId);
        }, cancellationToken);
    }

    /// <summary>
    /// Both by-subscription-id updates are <c>UPDATE ... WHERE "stripeSubscriptionId" = ...</c>, which
    /// affects 0 rows when no shadow row exists for that subscription yet. The event is still recorded as
    /// processed (correctly — the update genuinely had nothing to apply, and re-running it on redelivery
    /// would not change that), so without this the outcome is completely invisible.
    /// </summary>
    /// <remarks>
    /// Domain 9a final-review fix wave (Important 6). Warning, not Error, and explicitly not a failure:
    /// the shadow table starts empty, so EVERY pre-existing subscriber's first
    /// customer.subscription.updated lands here. That is the expected steady state during shadow-mode
    /// backfill, and it is exactly what legacy stripeService.ts logs too
    /// ("Subscription event for unknown local sub" when updateMany's count is 0). What would NOT be
    /// expected is this continuing to fire for a subscription the shadow table has already seen — hence
    /// the subscription id in the structured payload.
    /// </remarks>
    private void WarnIfNoShadowRowMatched(int affectedRows, string eventId, string eventType, string stripeSubscriptionId)
    {
        if (affectedRows > 0)
        {
            return;
        }

        logger.LogWarning(
            "billing.shadow.subscription-event matched 0 shadow rows (unknown local sub) eventId={EventId} eventType={EventType} stripeSubscriptionId={StripeSubscriptionId}",
            eventId, eventType, stripeSubscriptionId);
    }

    /// <summary>
    /// Runs `write` then records the event id LAST — matches legacy's rollback-on-failure idempotency guarantee.
    /// Returns false without running `write` if eventId was already processed. The leading SELECT is a fast-path
    /// dedup check only, not the source of truth: it's a plain read under ReadCommitted (not Serializable), so two
    /// truly concurrent deliveries of the same eventId can both pass it. The real guarantee is that the LOSER's
    /// transaction cannot commit: it hits a unique violation on whichever index the winner's committed rows reach
    /// first — "id" being PRIMARY KEY on shadow_stripe_events, or (formmaps#188) one of the unique indexes on
    /// shadow_user_subscriptions that `write` itself touches on the way there. Either way the transaction is never
    /// committed, so `write`'s state change rolls back too (DisposeAsync rolls back any transaction that wasn't
    /// committed) — no partial/duplicate write survives.
    /// </summary>
    /// <remarks>
    /// formmaps#188: the catch covers `write` as well as the event insert, and it decides "documented loser" vs
    /// "genuine conflict" on ONE fact rather than on which constraint fired — did another delivery of THIS event
    /// commit? A constraint-name allowlist cannot make that call: shadow_user_subscriptions."stripeSubscriptionId"
    /// fires for a redelivery race AND for a real conflict (the same Stripe subscription arriving for a different
    /// user), and only the second must surface. The re-check is exact because Postgres blocks a conflicting insert
    /// until the other transaction ends, and raises 23505 only if that transaction COMMITTED — so by the time the
    /// loser sees 23505 in a race, the winner's event row is committed and a fresh read sees it.
    /// <para>That re-check runs on THIS session, behind a savepoint, and deliberately not on a second one. The
    /// first cut of this fix opened another session for it, which is correct in isolation and unsafe in
    /// production: <c>MaxPoolSize</c> is 10 (<c>FormMapsDatabaseOptions</c>) and shared by the whole process, so a
    /// nested acquisition on the failure path competes with every other in-flight request at exactly the moment
    /// Stripe is redelivering in bulk — the fix would have amplified the storm it exists to damp.</para>
    /// <para>What is left after classification is a permanent conflict, raised as
    /// <see cref="BillingShadowConflictException" /> so the caller can tell it from a transient fault without
    /// touching Npgsql error codes. Before all this, a loser that raced on the subscription index escaped as a raw
    /// unhandled 23505 -> a 500 to Stripe -> MORE retries, during the very observation window meant to be clean.</para>
    /// </remarks>
    private async Task<bool> RunTransactionAsync(string eventId, string eventType, Func<FormMapsDatabaseSession, Task> write, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(RequestContext.System(), cancellationToken);

        if (await IsEventRecordedAsync(session, eventId, cancellationToken))
        {
            return false;
        }

        // Taken BEFORE `write` so a unique violation aborts only this subtransaction, leaving the session
        // usable for the classification below. The RLS GUCs were applied when the session opened, i.e.
        // before this savepoint, so rolling back to it does not disturb them.
        await session.Transaction.SaveAsync(BeforeWriteSavepoint, cancellationToken);

        try
        {
            await write(session);

            await using var recordEvent = Command(session, """
                INSERT INTO "shadow_stripe_events" ("id", "eventType") VALUES (@id, @eventType)
                """);
            AddParameter(recordEvent, "id", eventId);
            AddParameter(recordEvent, "eventType", eventType);
            await recordEvent.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (PostgresException violation) when (violation.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Nothing is committed on either branch; session.DisposeAsync() rolls the transaction back,
            // including `write`.
            if (await LostRedeliveryRaceAsync(session, eventId, eventType, violation, cancellationToken))
            {
                return false;
            }

            throw new BillingShadowConflictException(eventId, eventType, violation.ConstraintName, violation);
        }

        await session.CommitAsync(cancellationToken);
        return true;
    }

    /// <summary>
    /// True when the unique violation is explained by another delivery of the SAME event having committed —
    /// the documented <c>false</c> path. False means nobody else processed this event, so the violation is a
    /// genuine conflict and belongs to the caller.
    /// </summary>
    private async Task<bool> LostRedeliveryRaceAsync(
        FormMapsDatabaseSession session, string eventId, string eventType,
        PostgresException violation, CancellationToken cancellationToken)
    {
        bool eventRecorded;
        try
        {
            // The violation aborted the subtransaction the savepoint opened, not the whole transaction, so
            // this restores a usable session on the connection already in hand.
            await session.Transaction.RollbackAsync(BeforeWriteSavepoint, cancellationToken);
            eventRecorded = await IsEventRecordedAsync(session, eventId, cancellationToken);
        }
        catch (Exception classificationFailure)
        {
            // Could not tell a race from a conflict. Say so loudly and let the ORIGINAL violation stand:
            // its constraint name is the diagnostic fact, and letting a secondary failure replace it would
            // leave an operator with nothing to go on.
            logger.LogError(
                classificationFailure,
                "billing.shadow.conflict-classification-failed treating the violation as a genuine conflict eventId={EventId} eventType={EventType} constraint={ConstraintName}",
                eventId, eventType, violation.ConstraintName);
            return false;
        }

        if (!eventRecorded)
        {
            return false;
        }

        logger.LogInformation(
            "billing.shadow.redelivery-race lost to a concurrent delivery of the same event eventId={EventId} eventType={EventType} constraint={ConstraintName}",
            eventId, eventType, violation.ConstraintName);
        return true;
    }

    private static async Task<bool> IsEventRecordedAsync(FormMapsDatabaseSession session, string eventId, CancellationToken cancellationToken)
    {
        await using var existing = Command(session, """SELECT 1 FROM "shadow_stripe_events" WHERE "id" = @id""");
        AddParameter(existing, "id", eventId);
        return await existing.ExecuteScalarAsync(cancellationToken) is not null;
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
