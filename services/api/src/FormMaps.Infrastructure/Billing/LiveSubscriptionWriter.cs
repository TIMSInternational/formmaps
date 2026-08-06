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
    /// Legacy's <c>status: { in: ["active","trialing","past_due"] }, isActive: true</c> filter, as SQL.
    /// Scoped by an explicit userId — never by RLS visibility alone (the tenant_isolation policy on this
    /// table also admits same-school users).
    /// </summary>
    private const string CancellableWhere = """
        WHERE "userId" = @userId
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
