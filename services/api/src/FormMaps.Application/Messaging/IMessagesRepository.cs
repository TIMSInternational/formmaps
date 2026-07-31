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

    Task<ConversationMessagesResult> GetConversationMessagesAsync(
        RequestContext context, string userId, string conversationId, int page, int limit,
        CancellationToken cancellationToken = default);

    Task<SendMessageResult> SendMessageAsync(
        RequestContext context, string userId, string conversationId, string content,
        CancellationToken cancellationToken = default);
}
