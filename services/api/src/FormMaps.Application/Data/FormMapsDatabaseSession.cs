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

    /// <summary>Commit the transaction (writable sessions). Dispose still rolls back if not committed.</summary>
    public Task CommitAsync(CancellationToken cancellationToken = default) =>
        Transaction.CommitAsync(cancellationToken);

    public async ValueTask DisposeAsync()
    {
        await Transaction.DisposeAsync();
        await Connection.DisposeAsync();
    }
}
