using System.Text.Json;
using FormMaps.Api.Auth;
using FormMaps.Application.Auth;
using FormMaps.Application.Billing.Payouts;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Manual monthly coach payouts (audit 2026-10-09, decision D3) — twin of the three formmaps-platform
/// routes/admin.ts routes: GET /payouts/monthly, POST /payouts/generate, POST /payouts/:id/approve ("Mark as
/// paid"). Not routed in production yet (/api/v1/admin is served by Node); kept in step so the cut-over is
/// behaviour-neutral.
///
/// <para>AUTH. Node mounts the whole admin router behind <c>requirePermission("admin:dashboard")</c>, and only the
/// Super Admin role carries that permission (lib/auth.ts ROLE_PERMISSIONS), so the gate here is
/// <see cref="RequestActor.IsSuperAdmin"/>. The repository runs on the caller's session, which is the RLS bypass
/// plan for a Super Admin — so this check must run before the repository is touched.</para>
/// </summary>
public static class AdminPayoutsEndpoints
{
    public static IEndpointRouteBuilder MapAdminPayoutsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/admin/payouts").WithTags("AdminPayouts");
        group.MapGet("/monthly", GetMonthlyAsync);
        group.MapPost("/generate", GenerateAsync);
        group.MapPost("/{id}/approve", MarkPaidAsync);
        return app;
    }

    private static async Task<IResult> GetMonthlyAsync(
        string? month, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ICoachPayoutRepository repository,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var parsed = CoachPayoutCalculator.ParseMonth(month);
        if (parsed is null) return BadRequest("month must be YYYY-MM");

        var data = await repository.GetMonthlyAsync(context, parsed, clock.GetUtcNow().UtcDateTime, cancellationToken);
        return Results.Ok(new { success = true, data = ToResponse(data) });
    }

    private static async Task<IResult> GenerateAsync(
        HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard, ICoachPayoutRepository repository,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        var monthText = body is { ValueKind: JsonValueKind.Object } b && b.TryGetProperty("month", out var m) && m.ValueKind == JsonValueKind.String
            ? m.GetString()
            : null;
        var month = CoachPayoutCalculator.ParseMonth(monthText);
        if (month is null) return BadRequest("month must be YYYY-MM");

        var now = clock.GetUtcNow().UtcDateTime;
        if (!CoachPayoutCalculator.MonthHasEnded(month, now))
        {
            return Results.Json(
                new { success = false, code = "MONTH_NOT_ENDED", message = "Payouts can only be generated for a month that has ended" },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var outcome = await repository.GenerateAsync(context, month, Actor(context, http), now, cancellationToken);
        return Results.Ok(new
        {
            success = true,
            data = new
            {
                month = month.Month,
                created = outcome.Created,
                updated = outcome.Updated,
                unchanged = outcome.Unchanged,
                locked = outcome.Locked,
                payouts = ToResponse(outcome.Payouts),
            },
        });
    }

    private static async Task<IResult> MarkPaidAsync(
        string id, HttpContext http, IRequestContextAccessor accessor, IProtectedRequestGuard guard,
        ICoachPayoutRepository repository, TimeProvider clock, CancellationToken cancellationToken)
    {
        var (context, error) = Authorize(accessor, guard);
        if (error is not null) return error;

        var body = await ReadBodyAsync(http, cancellationToken);
        string? paidAt = null, reference = null;
        bool paidAtPresent = false, referenceIsText = true, paidAtIsText = true;
        if (body is { ValueKind: JsonValueKind.Object } obj)
        {
            if (obj.TryGetProperty("paidAt", out var p) && p.ValueKind != JsonValueKind.Null)
            {
                paidAtPresent = true;
                paidAtIsText = p.ValueKind == JsonValueKind.String;
                paidAt = paidAtIsText ? p.GetString() : null;
            }

            if (obj.TryGetProperty("reference", out var r) && r.ValueKind != JsonValueKind.Null)
            {
                referenceIsText = r.ValueKind == JsonValueKind.String;
                reference = referenceIsText ? r.GetString() : null;
            }
        }

        var parsed = CoachPayoutCalculator.ParseMarkPaid(paidAt, paidAtPresent, reference, referenceIsText, clock.GetUtcNow().UtcDateTime);
        // Node: a present non-string paidAt is "paidAt must be a date" (checked after the reference).
        if (parsed.Error is null && paidAtPresent && !paidAtIsText) parsed = MarkPaidParse.Fail("paidAt must be a date");
        if (parsed.Error is not null) return BadRequest(parsed.Error);

        var outcome = await repository.MarkPaidAsync(context, id, parsed.PaidAt, parsed.Reference, Actor(context, http), cancellationToken);
        if (outcome.Status == MarkPaidStatus.NotPending) return BadRequest("Payout not found or not pending");

        return Results.Ok(new { success = true, data = new { payoutId = id, status = "completed", paidAt = parsed.PaidAt, reference = parsed.Reference } });
    }

    private static object ToResponse(MonthlyPayouts data) => new
    {
        month = data.Month,
        periodStart = data.PeriodStart,
        periodEnd = data.PeriodEnd,
        monthEnded = data.MonthEnded,
        rows = data.Rows.Select(r => new
        {
            coachId = r.CoachId,
            coachName = r.CoachName,
            coachEmail = r.CoachEmail,
            currency = r.Currency,
            sessions = r.Sessions,
            grossCents = r.GrossCents,
            commissionPercent = r.CommissionPercent,
            commissionCents = r.CommissionCents,
            netCents = r.NetCents,
            payout = r.Payout is null ? null : new
            {
                id = r.Payout.Id,
                status = r.Payout.Status,
                grossCents = r.Payout.GrossCents,
                commissionCents = r.Payout.CommissionCents,
                netCents = r.Payout.NetCents,
                requestedAt = r.Payout.RequestedAt,
                paidAt = r.Payout.PaidAt,
                reference = r.Payout.Reference,
            },
            differenceCents = r.DifferenceCents,
        }),
        totals = new
        {
            grossCents = data.Totals.GrossCents,
            commissionCents = data.Totals.CommissionCents,
            netCents = data.Totals.NetCents,
            sessions = data.Totals.Sessions,
        },
    };

    private static PayoutAuditActor Actor(RequestContext context, HttpContext http) =>
        new(context.Actor!.UserId, context.Actor.Email ?? string.Empty, AuthCookieWriter.GetClientIp(http.Request));

    private static (RequestContext Context, IResult? Error) Authorize(IRequestContextAccessor accessor, IProtectedRequestGuard guard)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return (context, Results.Json(new { success = false, code = decision.Code, message = decision.Message }, statusCode: decision.StatusCode));
        }

        return context.Actor is { IsSuperAdmin: true }
            ? (context, null)
            : (context, Results.Json(new { success = false, code = "missing_permission", message = "Insufficient permissions" }, statusCode: StatusCodes.Status403Forbidden));
    }

    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        if (http.Request.ContentLength is 0) return null;
        try
        {
            using var document = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: cancellationToken);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IResult BadRequest(string message) => Results.Json(new { success = false, message }, statusCode: StatusCodes.Status400BadRequest);
}
