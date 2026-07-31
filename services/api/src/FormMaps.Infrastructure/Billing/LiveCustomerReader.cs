using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a Task 8 fix round 1. Opens a read-only session via the caller's own RequestContext
/// (tenant-scoped RLS GUCs applied), mirroring LiveSubscriptionReader's convention for reading legacy
/// Node-owned live data -- NOT RequestContext.System(). users is Node-owned legacy data; this is
/// read-only. See ILiveCustomerReader's doc comment for where the "stripeCustomerId" column comes from.
/// </summary>
public sealed class LiveCustomerReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiveCustomerReader
{
    private const string CustomerSql = """
        SELECT "stripeCustomerId"
        FROM "users"
        WHERE "id" = @userId
        """;

    public async Task<string?> GetStripeCustomerIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = CustomerSql;
        AddUserId(command, userId);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return reader.IsDBNull(0) ? null : reader.GetString(0);
    }

    private static void AddUserId(DbCommand command, string userId)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = "userId";
        parameter.Value = userId;
        command.Parameters.Add(parameter);
    }
}
