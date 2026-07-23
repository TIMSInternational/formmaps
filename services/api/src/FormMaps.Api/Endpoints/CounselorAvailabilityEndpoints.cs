using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Counselor;
using FormMaps.Domain.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Counselor availability (FM-DOTNET-069 — routes/counselor.ts GET+PUT /me/availability). First counselor WRITE slice.
/// GET+PUT share the exact path /me/availability → ONE flag <c>FORMMAPS_ROUTE_COUNSELOR_AVAILABILITY_TO_DOTNET</c>
/// co-flips both (Next matches path-not-method). Permission counselor:sessions. GET → the caller's row or the minimal
/// { timezone:"UTC", weeklySchedule:[] } default; PUT upserts (timezone = body.timezone || "UTC"; weeklySchedule =
/// body.weeklySchedule || body.slots || [] with JS-truthiness) and returns the full row.
/// </summary>
public static class CounselorAvailabilityEndpoints
{
    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    public static IEndpointRouteBuilder MapCounselorAvailabilityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/counselor").WithTags("CounselorAvailability");
        group.MapGet("/me/availability", GetAvailabilityAsync);
        group.MapPut("/me/availability", PutAvailabilityAsync);
        return app;
    }

    private static async Task<IResult> GetAvailabilityAsync(
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorAvailabilityRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorSessions(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var row = await repository.GetAsync(context, context.Actor!.UserId, cancellationToken);

        // No row → the minimal default shape (ONLY timezone + weeklySchedule, not the full row).
        return row is null
            ? Results.Ok(new { success = true, data = new { timezone = "UTC", weeklySchedule = Array.Empty<object>() } })
            : Results.Ok(new { success = true, data = RowJson(row) });
    }

    private static async Task<IResult> PutAvailabilityAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ICounselorAvailabilityRepository repository,
        CancellationToken cancellationToken)
    {
        var (context, error) = RequireCounselorSessions(accessor, guard);
        if (error is not null)
        {
            return error;
        }

        var body = await ReadBodyAsync(http, cancellationToken);
        if (body is null)
        {
            // primitive / malformed JSON → express strict rejects → 500.
            return Results.Json(new { success = false, message = "Internal server error" }, statusCode: StatusCodes.Status500InternalServerError);
        }

        var timezone = ResolveTimezone(body.Value);
        var weeklyScheduleJson = ResolveWeeklySchedule(body.Value);

        var row = await repository.UpsertAsync(context, context.Actor!.UserId, timezone, weeklyScheduleJson, cancellationToken);
        return Results.Ok(new { success = true, data = RowJson(row) });
    }

    // body.timezone || "UTC" — only a non-empty STRING wins; a truthy non-string (pathological) → "UTC" (safe divergence).
    private static string ResolveTimezone(JsonElement body) =>
        body.TryGetProperty("timezone", out var tz) && tz.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(tz.GetString())
            ? tz.GetString()!
            : "UTC";

    // body.weeklySchedule || body.slots || [] (JS-truthiness: an empty array [] is truthy and wins; "" / null / absent fall through).
    private static string ResolveWeeklySchedule(JsonElement body)
    {
        if (body.TryGetProperty("weeklySchedule", out var ws) && IsJsTruthy(ws))
        {
            return ws.GetRawText();
        }

        if (body.TryGetProperty("slots", out var slots) && IsJsTruthy(slots))
        {
            return slots.GetRawText();
        }

        return "[]";
    }

    private static object RowJson(AvailabilityRow r) => new
    {
        id = r.Id,
        userId = r.UserId,
        timezone = r.Timezone,
        weeklySchedule = r.WeeklySchedule,
        isActive = r.IsActive,
        createdBy = r.CreatedBy,
        createdDate = r.CreatedDate,
        updatedBy = r.UpdatedBy,
        updatedAt = r.UpdatedAt
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
                JsonValueKind.Array => EmptyObject, // arrays carry no named props → all defaults
                _ => null,                          // primitive → express strict → 500
            };
        }
        catch (JsonException)
        {
            return null; // malformed → 500
        }
    }

    // JS truthiness: falsy only for false / 0 / "" / null; objects and arrays (incl. []) are truthy.
    private static bool IsJsTruthy(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.String => !string.IsNullOrEmpty(el.GetString()),
        JsonValueKind.Number => !(el.TryGetDouble(out var n) && n == 0),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => false,
        _ => true,
    };

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
