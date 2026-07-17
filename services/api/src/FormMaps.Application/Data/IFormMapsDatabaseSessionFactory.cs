using FormMaps.Application.Auth;

namespace FormMaps.Application.Data;

public interface IFormMapsDatabaseSessionFactory
{
    Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default);

    /// <summary>Open a WRITABLE RLS session (same Identity GUCs, no SET TRANSACTION READ ONLY). Caller must CommitAsync.</summary>
    Task<FormMapsDatabaseSession> OpenWritableAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default);
}
