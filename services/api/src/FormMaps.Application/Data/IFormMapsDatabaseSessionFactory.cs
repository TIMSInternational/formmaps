using FormMaps.Application.Auth;

namespace FormMaps.Application.Data;

public interface IFormMapsDatabaseSessionFactory
{
    Task<FormMapsDatabaseSession> OpenReadOnlyAsync(
        RequestContext requestContext,
        CancellationToken cancellationToken = default);
}
