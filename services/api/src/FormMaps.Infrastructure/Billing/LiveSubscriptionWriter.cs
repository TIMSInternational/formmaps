using System.Data;
using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// formmaps#30. Writes the LIVE user_subscriptions row for POST /api/v1/billing/cancel-subscription,
/// under the caller's OWN tenant-scoped RLS session (OpenWritableAsync + Commit) -- the same convention
/// as <see cref="LiveSubscriptionReader" />'s read, and as every other live-table writer in this
/// assembly. See <see cref="ILiveSubscriptionWriter" /> for why this table is no longer read-only from
/// .NET and for the GRANT that must be re-applied first.
/// </summary>
/// <remarks>
/// The cancellable predicate is repeated in SQL rather than inherited from the endpoint's earlier read:
/// the read and the write are separate transactions, so a concurrent Node-side webhook can land between
/// them. Repeating it makes the write a no-op (0 rows) instead of resurrecting an already-cancelled row
/// or double-cancelling. "updatedAt" is always set because the column is NOT NULL with no DB default and
/// Prisma's @updatedAt bumps it on every update() -- omitting it is the exact bind that was missed four
/// times in Domain 7b.
/// </remarks>
public sealed class LiveSubscriptionWriter(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiveSubscriptionWriter
{
    /// <summary>
    /// Legacy's <c>status: { in: ["active","trialing","past_due"] }, isActive: true</c> filter, as SQL,
    /// pinned to ONE row id.
    ///
    /// <para>formmaps#108: this used to be <c>WHERE "userId" = @userId AND ...</c> with no row scope at
    /// all. schema.prisma's <c>@@unique([userId])</c> on user_subscriptions was never emitted by any
    /// migration (api/prisma/migrations has only the PK, the NON-unique "user_subscriptions_userId_idx"
    /// and the FKs), so a user may own several rows in production -- and a userId-only UPDATE silently
    /// cancelled EVERY one of them, while the reader that decided the request was cancellable had looked
    /// at exactly one arbitrary row. Legacy api/src/routes/stripe.ts:321 never had this problem: it scopes
    /// its updateMany by <c>{ id: sub.id, userId }</c>, the id of the row it actually read.</para>
    ///
    /// <para>The subselect reproduces <see cref="LiveSubscriptionReader" />'s SELECT exactly -- same
    /// predicate, same <c>ORDER BY "createdDate" DESC, "id"</c>, same LIMIT 1 -- so it resolves the SAME
    /// row that endpoint read, without needing the caller to thread the id through (which would change
    /// <see cref="ILiveSubscriptionWriter" />'s signature and therefore BillingEndpoints.cs). The
    /// cancellable predicate stays in the OUTER where, applied to that one row: keeping it out of the
    /// subselect is what preserves the row-identity guarantee (a filtered subselect could resolve an
    /// older row when the newest one is not cancellable), and keeping it in the outer clause preserves
    /// the concurrency semantics documented below -- a webhook that cancelled the row between the read
    /// and the write turns this into a 0-row no-op instead of resurrecting it. The redundant outer
    /// <c>"userId" = @userId</c> mirrors legacy's <c>{ id, userId }</c> scope: never trust an id alone,
    /// and never fall back on RLS visibility (the tenant_isolation policy on this table also admits
    /// same-school users).</para>
    /// </summary>
    private const string CancellableWhere = """
        WHERE "id" = (
            SELECT "id"
            FROM "user_subscriptions"
            WHERE "userId" = @userId
            ORDER BY "createdDate" DESC, "id"
            LIMIT 1
        )
          AND "userId" = @userId
          AND "isActive" = true
          AND "status" IN ('active', 'trialing', 'past_due')
        """;

    private const string MarkCancelledSql = $"""
        UPDATE "user_subscriptions"
        SET "status" = 'cancelled', "isActive" = false, "updatedAt" = @now
        {CancellableWhere}
        """;

    private const string MarkCancelAtPeriodEndSql = $"""
        UPDATE "user_subscriptions"
        SET "cancelAtPeriodEnd" = true, "updatedAt" = @now
        {CancellableWhere}
        """;

    public Task<int> MarkCancelledAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
        ExecuteAsync(context, MarkCancelledSql, userId, cancellationToken);

    public Task<int> MarkCancelAtPeriodEndAsync(RequestContext context, string userId, CancellationToken cancellationToken = default) =>
        ExecuteAsync(context, MarkCancelAtPeriodEndSql, userId, cancellationToken);

    private async Task<int> ExecuteAsync(RequestContext context, string sql, string userId, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        AddParameter(command, "userId", userId);
        AddTimestamp(command, "now", Now());

        var affected = await command.ExecuteNonQueryAsync(cancellationToken);
        await session.CommitAsync(cancellationToken);
        return affected;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static void AddTimestamp(DbCommand command, string name, DateTime value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.DbType = DbType.DateTime2;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DateTime Now()
    {
        var utc = DateTime.SpecifyKind(DateTimeOffset.UtcNow.UtcDateTime, DateTimeKind.Unspecified);
        return new DateTime(utc.Ticks - (utc.Ticks % TimeSpan.TicksPerMillisecond), DateTimeKind.Unspecified);
    }
}
