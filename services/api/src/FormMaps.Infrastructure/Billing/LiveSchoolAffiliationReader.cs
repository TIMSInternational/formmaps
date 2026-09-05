using System.Data.Common;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Wave 3 billing-subscription-parity. Opens a read-only session via the caller's own RequestContext
/// (tenant-scoped RLS GUCs applied), the same convention as LiveCustomerReader's read of this table --
/// NOT RequestContext.System(). users is Node-owned legacy data; this is read-only. See
/// ILiveSchoolAffiliationReader's doc comment for the legacy line this ports.
/// </summary>
public sealed class LiveSchoolAffiliationReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : ILiveSchoolAffiliationReader
{
    private const string SchoolIdSql = """
        SELECT "schoolId"
        FROM "users"
        WHERE "id" = @userId
        """;

    public async Task<string?> GetSchoolIdAsync(RequestContext context, string userId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(context, cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = SchoolIdSql;
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
