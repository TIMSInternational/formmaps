using System.Data;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Npgsql;

namespace FormMaps.Infrastructure.Data;

public sealed class NpgsqlFormMapsDatabaseSessionFactory(
    NpgsqlDataSource dataSource,
    RlsSessionContextApplier rlsSessionContextApplier) : IFormMapsDatabaseSessionFactory
{
    public async Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default)
    {
        var tenantGucPlan = TenantGucPlanResolver.Resolve(requestContext);
        var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        var transaction = await connection.BeginTransactionAsync(
            IsolationLevel.ReadCommitted,
            cancellationToken);

        try
        {
            await rlsSessionContextApplier.ApplyAsync(
                connection,
                transaction,
                tenantGucPlan,
                readOnly: true,
                cancellationToken);

            return new FormMapsDatabaseSession(
                connection,
                transaction,
                tenantGucPlan,
                isReadOnly: true);
        }
        catch
        {
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }
}
