// services/api/src/FormMaps.Api/Endpoints/MessagesEndpoints.cs
using FormMaps.Api.Auth;
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
        group.MapPost("/conversations", CreateConversationAsync);
        group.MapGet("/conversations/{id}", GetConversationMessagesAsync);
        group.MapPost("/conversations/{id}", SendMessageAsync);
        group.MapPost("/broadcast", BroadcastAsync);
        group.MapPost("/realtime-ticket", CreateRealtimeTicketAsync);
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

    public sealed record CreateConversationRequest(string? RecipientId, string? CounselorId);

    private static async Task<IResult> CreateConversationAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        CreateConversationRequest? body, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var targetId = body?.RecipientId ?? body?.CounselorId;
        if (string.IsNullOrWhiteSpace(targetId)) return BadRequestResult("recipientId is required");

        var role = context.Actor!.NormalizedRole.ToLowerInvariant();
        var result = await repository.CreateConversationAsync(
            context, context.Tenant!.UserId, role, context.Tenant.SchoolId, targetId, cancellationToken);

        return result.Status switch
        {
            CreateConversationStatus.Created => Results.Json(new { success = true, data = ToJson(result.Data!) }, statusCode: StatusCodes.Status201Created),
            CreateConversationStatus.Existing => Results.Ok(new { success = true, data = ToJson(result.Data!) }),
            CreateConversationStatus.Blocked => Forbidden(result.Error!),
            CreateConversationStatus.Forbidden => Forbidden(result.Error!),
            CreateConversationStatus.RecipientNotFound => BadRequestResult(result.Error!),
            _ => BadRequestResult(result.Error ?? "Invalid request"),
        };
    }

    private static async Task<IResult> GetConversationMessagesAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        string id, HttpRequest request, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var page = Math.Max(1, int.TryParse(request.Query["page"], out var p) ? p : 1);
        var limit = Math.Min(100, Math.Max(1, int.TryParse(request.Query["limit"], out var l) ? l : 50));

        var result = await repository.GetConversationMessagesAsync(context, context.Tenant!.UserId, id, page, limit, cancellationToken);
        if (result.Status == ConversationMessagesStatus.NotFound) return NotFound("Conversation not found");

        var pg = result.Page!;
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = pg.Data.Select(m => new { id = m.Id, conversationId = m.ConversationId, senderId = m.SenderId, sender = new { id = m.SenderId, name = m.SenderName }, content = m.Content, readAt = m.ReadAt, createdDate = m.CreatedDate }),
                total = pg.Total, page = pg.Page, limit = pg.Limit, totalPages = pg.TotalPages,
            },
        });
    }

    public sealed record SendMessageRequest(string Content);

    private static async Task<IResult> SendMessageAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        string id, SendMessageRequest? body, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        if (string.IsNullOrWhiteSpace(body?.Content) || body.Content.Length > 5000)
            return BadRequestResult("content: required, max 5000 characters");

        var result = await repository.SendMessageAsync(context, context.Tenant!.UserId, id, body.Content, cancellationToken);
        return result.Status switch
        {
            SendMessageStatus.NotFound => NotFound("Conversation not found"),
            SendMessageStatus.Blocked => Forbidden("You cannot message this user"),
            _ => Results.Json(new
            {
                success = true,
                data = new
                {
                    id = result.Message!.Id, conversationId = result.Message.ConversationId, senderId = result.Message.SenderId,
                    sender = new { id = result.Message.SenderId, name = result.Message.SenderName },
                    content = result.Message.Content, readAt = result.Message.ReadAt, createdDate = result.Message.CreatedDate,
                },
            }, statusCode: StatusCodes.Status201Created),
        };
    }

    public sealed record BroadcastRequest(string RecipientGroup, string Content);
    private static readonly string[] BroadcastGroups = ["students", "parents", "counselors", "staff"];

    private static async Task<IResult> BroadcastAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IMessagesRepository repository,
        BroadcastRequest? body, CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var role = context.Actor!.NormalizedRole.ToLowerInvariant();
        if (role is not ("school_admin" or "super admin" or "counselor"))
            return Forbidden("Only school admins and counselors can broadcast");

        if (body is null || !BroadcastGroups.Contains(body.RecipientGroup) || string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 5000)
            return BadRequestResult("Invalid broadcast request");

        if (string.IsNullOrWhiteSpace(context.Tenant!.SchoolId))
            return BadRequestResult("No school linked");

        var count = await repository.BroadcastAsync(
            context, context.Tenant.UserId, role, context.Tenant.SchoolId, body.RecipientGroup, body.Content, cancellationToken);
        return Results.Ok(new { success = true, data = new { recipientCount = count } });
    }

    private static IResult CreateRealtimeTicketAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, RealtimeTicketFactory ticketFactory)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed) return Deny(decision);

        var ticket = ticketFactory.CreateTicket(context.Actor!);
        if (ticket is null) return Results.Json(new { success = false, message = "Realtime unavailable" }, statusCode: StatusCodes.Status503ServiceUnavailable);

        return Results.Ok(new { success = true, data = new { ticket, expiresIn = 60 } });
    }

    private static object ToJson(ConversationSummary c) => new
    {
        id = c.Id,
        otherParticipant = new { id = c.OtherParticipantId, name = c.OtherParticipantName, email = c.OtherParticipantEmail },
        lastMessagePreview = c.LastMessagePreview,
        lastMessageAt = c.LastMessageAt,
        unreadCount = c.UnreadCount,
    };

    private static IResult Deny(GuardDecision decision) =>
        Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode);

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequestResult(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
