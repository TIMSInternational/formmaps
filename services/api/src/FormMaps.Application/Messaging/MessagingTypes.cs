namespace FormMaps.Application.Messaging;

// Timestamps are pre-formatted ISO-8601 strings with the Z marker ("2026-01-01T00:00:00.000Z"), not
// DateTime: the columns are timestamp-without-tz so a DateTime would arrive Kind.Unspecified and
// System.Text.Json would emit a bare local time that browsers shift by the viewer's UTC offset. The
// string is the wire format legacy (Prisma DateTime -> JSON) produced; MessagesRepository formats it.
public sealed record ContactRow(string Id, string? Name, string Email, string RoleName);

public sealed record ConversationSummary(
    string Id, string OtherParticipantId, string? OtherParticipantName, string OtherParticipantEmail,
    string? LastMessagePreview, string? LastMessageAt, int UnreadCount);

public sealed record MessageRow(
    string Id, string ConversationId, string SenderId, string? SenderName, string Content,
    string? ReadAt, string CreatedDate);

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
