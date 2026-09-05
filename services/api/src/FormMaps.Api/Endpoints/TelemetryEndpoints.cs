// services/api/src/FormMaps.Api/Endpoints/TelemetryEndpoints.cs
using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.Telemetry;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// Product telemetry ingest (routes/telemetry.ts, ONE endpoint under /api/v1/telemetry), formmaps#65.
/// Flag: FORMMAPS_ROUTE_TELEMETRY_TO_DOTNET (new, default OFF).
///
/// <para>PORTS: POST /api/v1/telemetry/events — formmaps-platform/api/src/routes/telemetry.ts:31,
/// mounted at formmaps-platform/api/src/index.ts:333 as
/// <c>app.use("/api/v1/telemetry", authenticate, tenantContext, telemetryRoutes)</c>. That is the whole
/// router; there is no second route.</para>
///
/// <para>THIS IS NOT DEAD CODE. The "nothing calls this, retire it" reading is false and was checked:
/// apps/web/src/services/telemetryService.ts:59 posts to this exact path and
/// apps/web/src/lib/webVitals.ts:16 documents the dependency. It is a port.</para>
///
/// <para>AUTH. Legacy applies <c>authenticate</c> twice — once at the mount and again as the router's
/// own <c>router.use(authenticate)</c> (telemetry.ts:8) — plus <c>tenantContext</c>, and nothing else:
/// no <c>requirePermission</c>, no <c>requireSubscription</c>, no role check, no rate limiter (verified
/// by reading the whole 64-line file). So <see cref="IProtectedRequestGuard.RequireIdentity"/> is the
/// entire gate and every authenticated role may post. A consequence worth restating because
/// webVitals.ts:16 already does: vitals are collected for SIGNED-IN users only, so the login and
/// marketing pages — plausibly the worst LCP in the app, being the cold first load — are invisible.
/// Opening that up is a rate-limiting and abuse decision, not a port.</para>
///
/// <para>THE WRITE IS AWAITED, deliberately (telemetry.ts:45). Telemetry ingest is not fire-and-forget
/// in legacy because the response body reports what was accepted, and apps/web retries any non-ok
/// response (telemetryService.ts:462-471). Backgrounding it here would report acceptance for rows that
/// never landed. See <see cref="ITelemetryEventWriter"/>.</para>
///
/// <para>THE SILENT DROP IS THE CONTRACT. An unknown event type is filtered out and the request still
/// answers 200 with a smaller <c>eventsReceived</c> — never a 400. See
/// <see cref="TelemetryEventTypes"/> for what that costs and why it is pinned by test rather than left
/// as folklore.</para>
/// </summary>
public static class TelemetryEndpoints
{
    public static IEndpointRouteBuilder MapTelemetryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/telemetry").WithTags("Telemetry");
        group.MapPost("/events", IngestAsync);
        return app;
    }

    // =========================================================================================
    // POST /api/v1/telemetry/events (telemetry.ts:31)
    // =========================================================================================
    private static async Task<IResult> IngestAsync(
        HttpContext http,
        IRequestContextAccessor accessor,
        IProtectedRequestGuard guard,
        ITelemetryEventWriter writer,
        CancellationToken cancellationToken)
    {
        var context = accessor.Current;
        var decision = guard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode);
        }

        // ORDERING NOTE, and it is a real divergence rather than an oversight: legacy parses the body in
        // app-level express.json() BEFORE authenticate, so malformed JSON is a 500 even with no token,
        // while here the 401 wins. Reproducing legacy's order would mean answering 500 to an anonymous
        // request, i.e. leaking that a parse ran at all; every other .NET port in this repo authenticates
        // first. Recorded, not reproduced.
        var body = await ReadBodyAsync(http, cancellationToken);

        var now = DateTime.UtcNow;
        var batch = TelemetryBatch.Parse(body, now);

        switch (batch.Status)
        {
            case TelemetryBatchStatus.InvalidBatch:
                return Results.Json(
                    new { success = false, message = TelemetryBatch.InvalidBatchMessage },
                    statusCode: StatusCodes.Status400BadRequest);

            case TelemetryBatchStatus.Malformed:
                return InternalServerError();
        }

        // `if (validEvents.length > 0)` (telemetry.ts:44). No rows means NO write at all — not an empty
        // INSERT, not an opened transaction. Pinned, because an unconditional write would turn legacy's
        // 200/0 for an all-unknown batch into a 500 the moment the DB is unhappy.
        if (batch.Rows.Count > 0)
        {
            try
            {
                await writer.WriteAsync(
                    context,
                    context.Tenant!.UserId,
                    batch.Rows,
                    now.Add(TelemetryBatch.Retention),
                    cancellationToken);
            }
            catch (Exception) when (!cancellationToken.IsCancellationRequested)
            {
                // telemetry.ts:58-60 — the route's own catch. A failed createMany is a 500 with this exact
                // body, NOT a 200 with a count the client would trust.
                return InternalServerError();
            }
        }

        return Results.Ok(new { success = true, data = new { eventsReceived = batch.Rows.Count } });
    }

    /// <summary>
    /// Returns the parsed root for valid JSON, the empty-object sentinel for an empty/whitespace body
    /// (<c>express.json()</c> yields <c>{}</c>, whose <c>.events</c> is undefined → the 400), and null
    /// ONLY for a body express could not parse — a JSON syntax error, or a bare primitive, which
    /// express's strict mode rejects. Null maps to legacy's 500. Same shape as
    /// SchoolStudentsWriteEndpoints.ReadBodyAsync, which ports the identical express behaviour.
    ///
    /// <para>An ARRAY root is NOT malformed: express accepts it, <c>req.body.events</c> is undefined, and
    /// the route answers 400. It is handed through as-is and <see cref="TelemetryBatch.Parse"/> treats a
    /// non-object root as "events absent".</para>
    /// </summary>
    private static async Task<JsonElement?> ReadBodyAsync(HttpContext http, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(http.Request.Body);
        var raw = await reader.ReadToEndAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return EmptyObject;
        }

        try
        {
            using var document = JsonDocument.Parse(raw);
            var root = document.RootElement;
            return root.ValueKind switch
            {
                JsonValueKind.Object or JsonValueKind.Array => root.Clone(),
                _ => null,
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static readonly JsonElement EmptyObject = JsonDocument.Parse("{}").RootElement.Clone();

    /// <summary>index.ts:434 and telemetry.ts:60 agree on this body, so both 500 paths share it.</summary>
    private static IResult InternalServerError() =>
        Results.Json(
            new { success = false, message = "Internal server error" },
            statusCode: StatusCodes.Status500InternalServerError);
}
