using FormMaps.Application.Messaging;

namespace FormMaps.IntegrationTests.Messaging;

/// <summary>
/// Shared no-op IMessagesRealtimeNotifier for MessagesRepository's Repo() test helpers -- these tests
/// exercise repository/SQL behavior, not the realtime push, so a stub that does nothing is sufficient
/// (SignalRMessagesNotifierTests covers the real notifier's push/never-throws behavior directly).
/// </summary>
internal sealed class NoopRealtimeNotifier : IMessagesRealtimeNotifier
{
    public Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
