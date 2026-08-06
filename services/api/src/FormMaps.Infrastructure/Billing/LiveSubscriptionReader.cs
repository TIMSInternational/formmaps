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
    private const string SubscriptionSql = """
        SELECT "status", "isActive", "nextBillingDate", "planId", "stripeSubscriptionId"
        FROM "user_subscriptions"
        WHERE "userId" = @userId
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
            ReadNullableString(reader, "stripeSubscriptionId"));
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
