// services/api/src/FormMaps.Api/Endpoints/VideoEndpoints.cs
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Video;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Video calling (FM-091..097 — routes/video.ts, 7 of 9 endpoints under /api/v1/video). No RBAC
/// permission gate — RequireIdentity only, matching legacy's plain `authenticate` middleware. Flags:
/// FORMMAPS_ROUTE_VIDEO_ENABLED_TO_DOTNET (GET /enabled), FORMMAPS_ROUTE_VIDEO_SESSIONS_TO_DOTNET
/// (GET+POST /sessions — forced co-flip, same literal rewrite path), FORMMAPS_ROUTE_VIDEO_SESSION_DETAIL_TO_DOTNET
/// (GET /sessions/:id), FORMMAPS_ROUTE_VIDEO_SIGNATURE_TO_DOTNET (POST /signature),
/// FORMMAPS_ROUTE_VIDEO_SESSION_LIFECYCLE_TO_DOTNET (POST /sessions/:id/end + /start).
/// POST /sessions/schedule and POST /sessions/:id/cancel are NOT ported (calendar-sync side effect stays
/// Node — see the Domain 7a design spec).
/// </summary>
public static class VideoEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();
    private static readonly string[] StaffRoles = ["counselor", "school_admin", "Super Admin"];

    public static IEndpointRouteBuilder MapVideoEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/video").WithTags("Video");
        group.MapGet("/enabled", GetEnabledAsync);
        group.MapGet("/sessions", ListSessionsAsync);
        group.MapGet("/sessions/{id}", GetSessionAsync);
        group.MapPost("/signature", CreateSignatureAsync);
        group.MapPost("/sessions", CreateSessionAsync);
        group.MapPost("/sessions/{id}/end", EndSessionAsync);
        group.MapPost("/sessions/{id}/start", StartSessionAsync);
        return app;
    }

    private static async Task<IResult> GetEnabledAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var schoolId = context.Tenant?.SchoolId;
        var enabled = schoolId is not null && await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken);
        return Results.Ok(new { success = true, data = new { enabled } });
    }

    private static async Task<IResult> ListSessionsAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var rows = await repository.ListForUserAsync(context, context.Tenant!.UserId, cancellationToken);
        return Results.Ok(new { success = true, data = rows.Select(ListJson) });
    }

    private static async Task<IResult> GetSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var row = await repository.GetByIdAsync(context, id, cancellationToken);
        if (row is null) return NotFound("Session not found");
        if (!IsParticipant(row, context.Tenant!.UserId)) return Forbidden("Access denied");

        return Results.Ok(new { success = true, data = DetailJson(row) });
    }

    private static async Task<IResult> CreateSignatureAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IVideoSessionsRepository repository, IDailyClient dailyClient, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        if (!dailyClient.IsConfigured)
        {
            return Results.Json(new { success = false, message = "Video calling is not configured" }, statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return BadRequest("Invalid request body");

        var sessionName = GetTrimmedString(body.Value, "sessionName");
        if (sessionName is null or { Length: 0 } or { Length: > 200 })
        {
            return BadRequest("sessionName is required");
        }

        var schoolId = context.Tenant?.SchoolId;
        if (schoolId is not null && !await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken))
        {
            return Forbidden("Video calls are not enabled for your school");
        }

        var videoSession = await repository.FindByRoomNameAsync(context, sessionName, cancellationToken);
        if (videoSession is null) return NotFound("Session not found");

        var userId = context.Tenant!.UserId;
        if (!IsParticipant(videoSession, userId)) return Forbidden("Access denied");

        var isOwner = videoSession.CounselorId == userId;
        var roomUrl = await dailyClient.EnsureRoomUrlAsync(sessionName, cancellationToken);
        var token = await dailyClient.CreateMeetingTokenAsync(
            sessionName, userId, context.Actor?.Name ?? "Participant", isOwner, cancellationToken);

        if (token is null)
        {
            return Results.Json(new { success = false, message = "Failed to generate video token" }, statusCode: StatusCodes.Status502BadGateway);
        }

        return Results.Ok(new { success = true, data = new { signature = token, roomUrl, roomName = sessionName } });
    }

    private static async Task<IResult> CreateSessionAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        IVideoSessionsRepository repository, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null) return BadRequest("Invalid request body");

        var participantId = GetTrimmedString(body.Value, "participantId");
        if (string.IsNullOrEmpty(participantId)) return BadRequest("participantId is required");

        var schoolId = context.Tenant?.SchoolId;
        if (schoolId is not null && !await repository.IsVideoEnabledForSchoolAsync(context, schoolId, cancellationToken))
        {
            return Forbidden("Video calls are not enabled for your school");
        }

        var participant = await repository.FindParticipantCandidateAsync(context, participantId, cancellationToken);
        if (participant is null) return NotFound("Participant not found");

        // NormalizedRole (not the raw role string) is deliberate — platform-wide role-normalization
        // convention used elsewhere in this codebase. It's a strict superset of legacy's raw-string gate
        // (exactly "counselor"/"school_admin"/"super admin"): variants like "admin", "super_admin",
        // "superadmin", "schooladmin" also normalize into these buckets. Intentional, not a bug.
        var role = context.Actor?.NormalizedRole ?? "student";
        if (!StaffRoles.Contains(role))
        {
            return Forbidden("Only staff can initiate video calls");
        }

        var isSuperAdmin = role == "Super Admin";
        if (!isSuperAdmin && (schoolId is null || participant.SchoolId != schoolId))
        {
            return NotFound("Participant not found");
        }

        if (role == "counselor" && !await repository.HasActiveCounselorAssignmentAsync(context, context.Tenant!.UserId, participantId, cancellationToken))
        {
            return NotFound("Not found");
        }

        var callerId = context.Tenant!.UserId;
        var created = await repository.CreateAsync(context, callerId, participantId, cancellationToken);

        return Results.Json(new
        {
            success = true,
            data = new
            {
                id = created.Id,
                sessionName = created.SessionName,
                participant = new { id = participant.Id, name = participant.Name },
                caller = new { id = callerId, name = context.Actor?.Name },
                startTime = created.StartTime,
            },
        }, statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> EndSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var outcome = await repository.EndAsync(context, id, context.Tenant!.UserId, cancellationToken);
        return outcome switch
        {
            SessionMutationOutcomeKind.NotFound => NotFound("Session not found"),
            SessionMutationOutcomeKind.Forbidden => Forbidden("Access denied"),
            _ => Results.Ok(new { success = true, data = new { id, status = "completed" } }),
        };
    }

    private static async Task<IResult> StartSessionAsync(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard, IVideoSessionsRepository repository,
        string id, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var (kind, sessionName) = await repository.StartAsync(context, id, context.Tenant!.UserId, cancellationToken);
        return kind switch
        {
            SessionMutationOutcomeKind.NotFound => NotFound("Session not found"),
            SessionMutationOutcomeKind.Forbidden => Forbidden("Access denied"),
            SessionMutationOutcomeKind.NotScheduled => BadRequest("Session is not in scheduled state"),
            _ => Results.Ok(new { success = true, data = new { id, status = "video_active", sessionName } }),
        };
    }

    // ---- shared helpers ----

    private static bool IsParticipant(VideoSessionRow row, string userId) =>
        row.CounselorId == userId || row.StudentId == userId;

    private static object ListJson(VideoSessionRow s) => new
    {
        id = s.Id,
        sessionName = s.SessionName,
        status = s.Status,
        caller = new { id = s.CounselorId, name = s.CounselorName, email = s.CounselorEmail },
        participant = new { id = s.StudentId, name = s.StudentName, email = s.StudentEmail },
        startTime = s.StartTime,
        endTime = s.EndTime,
        completedAt = s.CompletedAt,
        topic = s.Topic,
        notes = s.Notes,
    };

    private static object DetailJson(VideoSessionRow s) => new
    {
        id = s.Id,
        sessionName = s.SessionName,
        status = s.Status,
        caller = new { id = s.CounselorId, name = s.CounselorName, email = s.CounselorEmail },
        participant = new { id = s.StudentId, name = s.StudentName, email = s.StudentEmail },
        startTime = s.StartTime,
        endTime = s.EndTime,
    };

    private static string? GetTrimmedString(JsonElement body, string property) =>
        body.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw)) return EmptyObject;

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static (RequestContext Context, IResult? Error) Authorize(IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        return decision.Allowed
            ? (context, null)
            : (context, Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode));
    }

    private static IResult NotFound(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status404NotFound);
    private static IResult Forbidden(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status403Forbidden);
    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
