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
    /// all. CORRECTED 2026-08-10 -- an earlier version of this comment justified the row scope by claiming
    /// <c>@@unique([userId])</c> "was never emitted by any migration, so a user may own several rows in
    /// production". That premise is REFUTED and must not be repeated: production is BELIEVED to carry
    /// <c>user_subscriptions_userId_key</c> -- inferred from prod having been built by
    /// <c>prisma db push</c> from schema.prisma:534, plus a <c>\d</c> reading recorded in a 2026-08-07
    /// comment on formmaps#108. That is not a committed measurement and has not been re-confirmed; see
    /// LiveSubscriptionReader for the full provenance note. (An earlier revision here cited a
    /// "20260808000000_user_subscriptions_userid_unique" migration as having reconciled the history; no
    /// such migration exists -- the unique index is emitted by legacy 0_init/migration.sql:2779, see the
    /// reader.) A user is believed to own at most one row, so the multi-row cancel this scope was
    /// introduced to prevent is not believed reachable in prod.</para>
    ///
    /// <para>The row scope is KEPT as defence in depth, and it is not merely decorative: it removes the
    /// writer's dependency on an index it does not control, so a database where the index is dropped
    /// during maintenance -- or a legacy row pair that pre-dates it -- cannot turn a single cancel into an
    /// UPDATE across every row the user owns while the reader's cancellable decision was based on exactly
    /// one of them. It also matches legacy api/src/routes/stripe.ts:321, which scopes its updateMany by
    /// <c>{ id: sub.id, userId }</c> -- the id of the row it actually read -- and so never depended on the
    /// invariant either.</para>
    ///
    /// <para>The row is pinned by the id the endpoint READ (<c>LiveSubscriptionRow.Id</c>, threaded through
    /// <see cref="ILiveSubscriptionWriter" />), exactly as legacy stripe.ts:321's
    /// <c>{ id: sub.id, userId }</c>. Wave 3 billing-subscription-parity review (security/important):
    /// this used to be a subselect that RE-RESOLVED the row from the reader's own predicate
    /// (<c>userId + isActive ORDER BY createdDate DESC, id LIMIT 1</c>) so the id would not have to be
    /// threaded through. That is only "the same row the endpoint read" while nothing changes between the
    /// two transactions -- and the concurrency case this whole clause exists for is precisely something
    /// changing between them. A webhook that flips the read row's isActive between the read and the write
    /// made the subselect skip it and resolve the user's next older active row, which the outer predicate
    /// then happily cancelled: a row the caller's cancellable decision was never based on (pinned by
    /// LiveSubscriptionDuplicateRowTests.MarkCancelled_ReadRowDeactivatedBetweenReadAndWrite_...). With
    /// the id pinned, that race is the 0-row no-op the remarks below promise, as it is in legacy.</para>
    ///
    /// <para>The outer <c>"isActive" = true</c> and status set are legacy's cancellable filter, kept on the
    /// write for the concurrency semantics documented below -- a webhook that cancelled the row between
    /// the read and the write turns this into a 0-row no-op instead of resurrecting it. The
    /// <c>"userId" = @userId</c> alongside the id mirrors legacy's <c>{ id, userId }</c> scope: never trust
    /// an id alone, and never fall back on RLS visibility (the tenant_isolation policy on this table also
    /// admits same-school users).</para>
    /// </summary>
    private const string CancellableWhere = """
        WHERE "id" = @rowId
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

    public Task<int> MarkCancelledAsync(RequestContext context, string userId, string rowId, CancellationToken cancellationToken = default) =>
        ExecuteAsync(context, MarkCancelledSql, userId, rowId, cancellationToken);

    public Task<int> MarkCancelAtPeriodEndAsync(RequestContext context, string userId, string rowId, CancellationToken cancellationToken = default) =>
        ExecuteAsync(context, MarkCancelAtPeriodEndSql, userId, rowId, cancellationToken);

    private async Task<int> ExecuteAsync(RequestContext context, string sql, string userId, string rowId, CancellationToken cancellationToken)
    {
        await using var session = await databaseSessionFactory.OpenWritableAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        AddParameter(command, "rowId", rowId);
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
