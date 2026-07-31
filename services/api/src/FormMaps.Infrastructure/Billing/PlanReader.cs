using FormMaps.Application.Auth;
using FormMaps.Application.Billing;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Billing;

/// <summary>
/// Domain 9a Task 8. subscription_plans is a plan catalog, not tenant/user-scoped data, so this reads
/// under RequestContext.System() (GUC bypass) -- same convention as the shadow-table repository/reader
/// in this namespace, unlike ILiveSubscriptionReader which reads the caller's own user_subscriptions
/// row under their tenant-scoped RLS session.
/// </summary>
public sealed class PlanReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IPlanReader
{
    public async Task<PlanRow?> GetActiveByIdAsync(string planId, CancellationToken cancellationToken = default)
    {
        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(RequestContext.System(), cancellationToken);
        await using var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = """SELECT "id", "stripePriceId", "isActive" FROM "subscription_plans" WHERE "id" = @id AND "isActive" = true""";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "id";
        parameter.Value = planId;
        command.Parameters.Add(parameter);

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new PlanRow(
            reader.GetString(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetBoolean(2));
    }
}
