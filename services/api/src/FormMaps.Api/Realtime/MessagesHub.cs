using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using Microsoft.AspNetCore.SignalR;

namespace FormMaps.Api.Realtime;

/// <summary>
/// Push-only hub for live message-arrival notifications — no client-to-server methods, sending a
/// message still goes through POST /api/v1/messages/conversations/{id}. On connect, joins a group named
/// "user:{userId}" so SignalRMessagesNotifier can target a specific recipient without needing a custom
/// IUserIdProvider (this codebase's auth doesn't populate the standard ClaimsPrincipal Context.User).
///
/// Deliberately does NOT constructor-inject IRequestContextAccessor: SignalR resolves a hub instance
/// from a fresh DI scope per invocation (the root IServiceScopeFactory), not the scope
/// RequestContextMiddleware populated for the connection's original HTTP request -- so an injected
/// accessor would always read RequestContext.Anonymous() here, silently aborting every connection
/// regardless of auth (see RequestContextMiddleware.RequestContextItemsKey doc comment). Instead this
/// reads the RequestContext that middleware already stashed into HttpContext.Items for that same request.
/// </summary>
public sealed class MessagesHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var context = Context.GetHttpContext()?.Items[RequestContextMiddleware.RequestContextItemsKey] as RequestContext;
        if (context is null || !context.IsAuthenticated || context.Tenant is null)
        {
            Context.Abort();
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{context.Tenant.UserId}");
        await base.OnConnectedAsync();
    }
}
