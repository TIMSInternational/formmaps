using FormMaps.Application.Auth;

namespace FormMaps.Application.Messaging;

public interface IMessagesRepository
{
    Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);
}
