using FormMaps.Application.Auth;
using Microsoft.AspNetCore.SignalR;

namespace FormMaps.Api.Realtime;

/// <summary>
/// Push-only hub for live message-arrival notifications — no client-to-server methods, sending a
/// message still goes through POST /api/v1/messages/conversations/{id}. On connect, joins a group named
/// "user:{userId}" so SignalRMessagesNotifier can target a specific recipient without needing a custom
/// IUserIdProvider (this codebase's auth doesn't populate the standard ClaimsPrincipal Context.User).
/// </summary>
public sealed class MessagesHub(IRequestContextAccessor requestContextAccessor) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var context = requestContextAccessor.Current;
        if (!context.IsAuthenticated || context.Tenant is null)
        {
            Context.Abort();
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{context.Tenant.UserId}");
        await base.OnConnectedAsync();
    }
}
