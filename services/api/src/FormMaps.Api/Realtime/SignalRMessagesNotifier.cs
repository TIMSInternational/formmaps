using FormMaps.Application.Messaging;
using Microsoft.AspNetCore.SignalR;

namespace FormMaps.Api.Realtime;

public sealed class SignalRMessagesNotifier(
    IHubContext<MessagesHub> hubContext, ILogger<SignalRMessagesNotifier> logger) : IMessagesRealtimeNotifier
{
    public async Task NotifyMessageReceivedAsync(string recipientUserId, object payload, CancellationToken cancellationToken = default)
    {
        try
        {
            await hubContext.Clients.Group($"user:{recipientUserId}").SendAsync("messageReceived", payload, cancellationToken);
        }
        catch (Exception ex)
        {
            // Never let a push failure affect the send-message REST response — recipient offline or a
            // transient hub error is a normal case, not something the sender should see fail.
            logger.LogWarning(ex, "messages.hub.push_failed recipientUserId={RecipientUserId}", recipientUserId);
        }
    }
}
