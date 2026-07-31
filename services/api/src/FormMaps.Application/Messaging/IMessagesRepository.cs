using FormMaps.Application.Auth;

namespace FormMaps.Application.Messaging;

public interface IMessagesRepository
{
    Task<int> GetUnreadCountAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ContactRow>> GetContactsAsync(
        RequestContext context, string userId, string role, string? schoolId, string? search,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ConversationSummary>> ListConversationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    Task<CreateConversationResult> CreateConversationAsync(
        RequestContext context, string userId, string role, string? schoolId, string targetId,
        CancellationToken cancellationToken = default);
}
