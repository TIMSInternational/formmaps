namespace FormMaps.Application.Messaging;

/// <summary>
/// Push-only: notify a connected user of a new message. Never throws — a dropped/absent connection
/// (recipient offline) is a normal, expected case, not an error. Implemented in the Api layer
/// (SignalRMessagesNotifier) so Application/Infrastructure don't depend on SignalR directly.
/// </summary>
public interface IMessagesRealtimeNotifier
{
    Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default);
}
