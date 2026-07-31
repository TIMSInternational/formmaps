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

/// <summary>
/// Capturing IMessagesRealtimeNotifier double -- records every call so a test can assert
/// MessagesRepository.SendMessageAsync actually invokes the notifier (with the right recipient/payload),
/// not just that it compiles against the interface.
/// </summary>
internal sealed class CapturingRealtimeNotifier : IMessagesRealtimeNotifier
{
    public int CallCount { get; private set; }
    public string? LastRecipientUserId { get; private set; }
    public object? LastPayload { get; private set; }

    public Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default)
    {
        CallCount++;
        LastRecipientUserId = recipientUserId;
        LastPayload = payload;
        return Task.CompletedTask;
    }
}
