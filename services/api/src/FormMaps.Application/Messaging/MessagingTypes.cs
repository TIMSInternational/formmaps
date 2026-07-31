namespace FormMaps.Application.Messaging;

public sealed record ContactRow(string Id, string? Name, string Email, string RoleName);

public sealed record ConversationSummary(
    string Id, string OtherParticipantId, string? OtherParticipantName, string OtherParticipantEmail,
    string? LastMessagePreview, DateTime? LastMessageAt, int UnreadCount);

public sealed record MessageRow(
    string Id, string ConversationId, string SenderId, string? SenderName, string Content,
    DateTime? ReadAt, DateTime CreatedDate);

public sealed record ConversationMessagesPage(
    IReadOnlyList<MessageRow> Data, int Total, int Page, int Limit, int TotalPages);

public enum CreateConversationStatus { Created, Existing, ValidationFailed, RecipientNotFound, Blocked, Forbidden }
public sealed record CreateConversationResult(CreateConversationStatus Status, ConversationSummary? Data, string? Error);

public enum ConversationMessagesStatus { Ok, NotFound }
public sealed record ConversationMessagesResult(ConversationMessagesStatus Status, ConversationMessagesPage? Page);

public enum SendMessageStatus { Sent, NotFound, Blocked }
public sealed record SendMessageResult(
    SendMessageStatus Status, MessageRow? Message, string? RecipientId, string? RecipientEmail,
    string? SenderName, string? Preview);
