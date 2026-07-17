using System.Data;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;
using Npgsql;

namespace FormMaps.Infrastructure.Data;

public sealed class NpgsqlFormMapsDatabaseSessionFactory(
    NpgsqlDataSource dataSource,
    RlsSessionContextApplier rlsSessionContextApplier) : IFormMapsDatabaseSessionFactory
{
    public Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default) =>
        OpenAsync(requestContext, readOnly: true, cancellationToken);

    public Task<FormMapsDatabaseSession> OpenWritableAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default) =>
        OpenAsync(requestContext, readOnly: false, cancellationToken);

    private async Task<FormMapsDatabaseSession> OpenAsync(
        RequestContext requestContext,
        bool readOnly,
        CancellationToken cancellationToken)
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
                readOnly,
                cancellationToken);

            return new FormMapsDatabaseSession(
                connection,
                transaction,
                tenantGucPlan,
                isReadOnly: readOnly);
        }
        catch
        {
            await transaction.DisposeAsync();
            await connection.DisposeAsync();
            throw;
        }
    }
}
