// services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs
using FormMaps.Application.Auth;
using FormMaps.Application.Messaging;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Messaging (routes/messages.ts, 7 endpoints under /api/v1/messages). No RBAC permission gate —
/// RequireIdentity only, matching legacy's plain `authenticate` middleware (school-less coach<->student
/// messaging exists). Flag: FORMMAPS_ROUTE_MESSAGES_TO_DOTNET gates all 7 as one unit (see the Domain 7b
/// design spec and plan's Global Constraints for why they aren't independently flagged).
/// </summary>
public static class MessagesEndpoints
{
    public static IEndpointRouteBuilder MapMessagesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/messages").WithTags("Messages");
        group.MapGet("/unread-count", GetUnreadCountAsync);
        group.MapGet("/contacts", GetContactsAsync);
        group.MapGet("/conversations", ListConversationsAsync);
        return app;
    }

    private static async Task<IResult> GetUnreadCountAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var count = await repository.GetUnreadCountAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = new { unreadCount = count } });
    }

    private static async Task<IResult> GetContactsAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        HttpRequest request, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var role = (context.Actor!.NormalizedRole).ToLowerInvariant();
        var search = request.Query.TryGetValue("search", out var s) ? s.ToString() : null;
        var contacts = await repository.GetContactsAsync(
            context, context.Tenant!.UserId, role, context.Tenant.SchoolId, search, cancellationToken);
        return Results.Ok(new { success = true, data = contacts });
    }

    private static async Task<IResult> ListConversationsAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var results = await repository.ListConversationsAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = results.Select(c => new
            {
                id = c.Id,
                otherParticipant = new { id = c.OtherParticipantId, name = c.OtherParticipantName, email = c.OtherParticipantEmail },
                lastMessagePreview = c.LastMessagePreview,
                lastMessageAt = c.LastMessageAt,
                unreadCount = c.UnreadCount,
            }),
        });
    }

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequestResult(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
