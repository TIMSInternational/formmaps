namespace FormMaps.Application.Auth;

public interface IUserAccessGuard
{
    Task<bool> CanAccessUserAsync(
        RequestContext caller,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
