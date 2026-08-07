using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a Task 7. Opens a read-only session via the caller's own RequestContext (tenant-scoped RLS
/// GUCs applied), mirroring SubscriptionGuard's read of the same table -- NOT RequestContext.System(),
/// which the shadow-table repository/reconciliation worker use since shadow_* tables are .NET-internal
/// and not tenant-scoped. user_subscriptions is Node-owned legacy data; this class is read-only. (The
/// one .NET write to that table lives in LiveSubscriptionWriter, added by formmaps#30 for
/// POST /cancel-subscription — see ILiveSubscriptionWriter for why.)
/// </summary>
public sealed class LiveSubscriptionReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiveSubscriptionReader
{
    /// <summary>
    /// formmaps#108. ORDER BY + LIMIT 1 are load-bearing, not cosmetic. schema.prisma's
    /// <c>@@unique([userId])</c> on user_subscriptions exists in NO migration (api/prisma/migrations
    /// creates only the PK, the NON-unique "user_subscriptions_userId_idx" and the FKs), so production
    /// may hold several rows for one user. Without an ORDER BY this SELECT returned whichever row the
    /// scan reached first -- heap order, which changes under VACUUM/UPDATE -- so GET /status could report
    /// a stale cancelled row while an active one existed. <c>createdDate DESC</c> mirrors legacy
    /// api/src/routes/user.ts:314 (<c>findFirst orderBy: { createdDate: "desc" }</c>); <c>"id"</c> is the
    /// tie-break that makes same-millisecond rows deterministic too, since createdDate alone is not unique.
    /// </summary>
    private const string SubscriptionSql = """
        SELECT "id", "status", "isActive", "nextBillingDate", "planId", "stripeSubscriptionId"
        FROM "user_subscriptions"
        WHERE "userId" = @userId
        ORDER BY "createdDate" DESC, "id"
        LIMIT 1
        """;

    public async Task<LiveSubscriptionRow?> GetForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SubscriptionSql;
        AddUserId(command, userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new LiveSubscriptionRow(
            ReadNullableString(reader, "status"),
            reader.GetBoolean(reader.GetOrdinal("isActive")),
            ReadNullableDateTimeOffsetUtc(reader, "nextBillingDate"),
            ReadNullableString(reader, "planId"),
            ReadNullableString(reader, "stripeSubscriptionId"),
            reader.GetString(reader.GetOrdinal("id")));
    }

    private static void AddUserId(DbCommand command, string userId)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = "userId";
        parameter.Value = userId;
        command.Parameters.Add(parameter);
    }

    private static string? ReadNullableString(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
    }

    private static DateTimeOffset? ReadNullableDateTimeOffsetUtc(DbDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        if (reader.IsDBNull(ordinal))
        {
            return null;
        }

        var value = reader.GetDateTime(ordinal);
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }
}
