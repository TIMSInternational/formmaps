using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Counselor sessions (FM-DOTNET-071 — routes/counselor.ts GET /me/sessions + PUT /me/sessions/:id/complete).
/// Permission counselor:sessions. One flag <c>FORMMAPS_ROUTE_COUNSELOR_SESSIONS_TO_DOTNET</c> with two rewrites.
/// GET lists the counselor's own active sessions (paged, optional ?status filter). complete marks a session completed
/// after an ownership check. PUT /me/sessions/:id/cancel is NOT ported (calendar-sync side-effect stays Node).
/// </summary>
public static class CounselorSessionsEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapCounselorSessionsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorSessions");
        group.MapGet("/me/sessions", GetSessionsAsync);
        group.MapPut("/me/sessions/{id}/complete", CompleteSessionAsync);
        return app;
    }

    private static async Task<IResult> GetSessionsAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorSessionsRepository repository,
        string? page,
        string? limit,
        string? status,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorSessions(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var resolvedPage = Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(page), 1));
        var resolvedLimit = Math.Min(50, Math.Max(1, FalsyOr(PcaExamPagination.JsParseInt(limit), 20)));

        // status filter applies only when present AND != "all" (the repo re-checks); empty → null.
        var result = await repository.ListAsync(
            context, context.Actor!.UserId, EmptyToNull(status), resolvedPage, resolvedLimit, cancellationToken);

        var totalPages = (int)Math.Ceiling((double)result.Total / resolvedLimit);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                data = result.Data.Select(SessionJson),
                total = result.Total,
                page = resolvedPage,
                limit = resolvedLimit,
                totalPages
            }
        });
    }

    private static async Task<IResult> CompleteSessionAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorSessionsRepository repository,
        string id,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorSessions(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        // Express parses the body BEFORE the handler → a primitive/malformed body 500s regardless of the session.
        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            return Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        var counselorNotes = ResolveNotes(body.Value);

        var result = await repository.CompleteAsync(context, context.Actor!.UserId, id, counselorNotes, cancellationToken);
        return result switch
        {
            CompleteResult.NotYourSession => Results.Json(new { success = false, message = "Not your session" }, statusCode: StatusCodes.Status403Forbidden),
            _ => Results.Ok(new { success = true }),
        };
    }

    // counselorNotes ?? notes ?? "" (JS NULLISH — null/undefined fall through, "" does NOT) → then a non-string → "".
    private static string ResolveNotes(JsonElement body)
    {
        JsonElement candidate;
        if (body.TryGetProperty("counselorNotes", out var cn) && cn.ValueKind != JsonValueKind.Null)
        {
            candidate = cn;
        }
        else if (body.TryGetProperty("notes", out var n) && n.ValueKind != JsonValueKind.Null)
        {
            candidate = n;
        }
        else
        {
            return string.Empty; // both absent/null → "" (a string) → slice → ""
        }

        if (candidate.ValueKind != JsonValueKind.String)
        {
            return string.Empty; // typeof notes !== "string" → ""
        }

        var value = candidate.GetString() ?? string.Empty;
        return value.Length <= 5000 ? value : value[..5000]; // .slice(0, 5000)
    }

    private static object SessionJson(SessionRow s) => new
    {
        id = s.Id,
        counselorId = s.CounselorId,
        studentId = s.StudentId,
        startTime = s.StartTime,
        endTime = s.EndTime,
        status = s.Status,
        topic = s.Topic,
        notes = s.Notes,
        counselorNotes = s.CounselorNotes,
        meetingLink = s.MeetingLink,
        calendarEventIds = s.CalendarEventIds,
        cancellationReason = s.CancellationReason,
        cancelledAt = s.CancelledAt,
        cancelledBy = s.CancelledBy,
        completedAt = s.CompletedAt,
        isActive = s.IsActive,
        createdBy = s.CreatedBy,
        createdDate = s.CreatedDate,
        updatedBy = s.UpdatedBy,
        updatedAt = s.UpdatedAt,
        // ...s spreads the student include; then studentName = s.student.name (raw, no fallback).
        student = new { name = s.StudentName },
        studentName = s.StudentName
    };

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var streamReader = new StreamReader(http.Request.Body);
        var raw = await streamReader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            return document.RootElement.ValueKind switch
            {
                JsonValueKind.Object => document.RootElement.Clone(),
                JsonValueKind.Array => EmptyObject,
                _ => null,
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static int FalsyOr(int? parsed, int fallback) => parsed is null or 0 ? fallback : parsed.Value;

    private static string? EmptyToNull(string? value) => string.IsNullOrEmpty(value) ? null : value;

    private static (RequestContext Context, IResult? Error) RequireCounselorSessions(
        IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;

        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode));
        }

        if (!context.Permissions.Contains(FormMapsPermissions.CounselorSessions))
        {
            return (context, Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden));
        }

        return (context, null);
    }
}
