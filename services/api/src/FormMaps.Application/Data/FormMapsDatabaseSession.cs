using System.Data.Common;
using FormMaps.Application.Auth;

namespace FormMaps.Application.Data;

public sealed class FormMapsDatabaseSession(
    DbConnection connection,
    DbTransaction transaction,
    TenantGucPlan tenantGucPlan,
    bool isReadOnly) : IAsyncDisposable
{
    public DbConnection Connection { get; } = connection;

    public DbTransaction Transaction { get; } = transaction;

    public TenantGucPlan TenantGucPlan { get; } = tenantGucPlan;

    public bool IsReadOnly { get; } = isReadOnly;

    public async ValueTask DisposeAsync()
    {
        await Transaction.DisposeAsync();
        await Connection.DisposeAsync();
    }
}
