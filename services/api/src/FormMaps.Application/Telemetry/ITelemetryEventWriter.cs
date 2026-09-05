using FormMaps.Application.Auth;

namespace FormMaps.Application.Telemetry;

/// <summary>
/// Persists a batch of accepted telemetry events for ONE caller. Ports the
/// <c>prisma.telemetryEvent.createMany</c> at formmaps-platform/api/src/routes/telemetry.ts:45-55.
/// </summary>
public interface ITelemetryEventWriter
{
    /// <summary>
    /// Insert every row for <paramref name="userId"/> in one statement, under the CALLER's RLS session.
    ///
    /// <para>LEGACY AWAITS THIS BEFORE RESPONDING (telemetry.ts:45, <c>await</c>), so telemetry ingest is
    /// NOT fire-and-forget there and must not become fire-and-forget here. The reason is in the response
    /// body: <c>eventsReceived</c> reports what was ACCEPTED, and a write that fails turns the whole
    /// request into a 500 the client retries. Backgrounding the write would make a failed insert look
    /// like a successful one, which is a contract change dressed up as a latency win.</para>
    ///
    /// <para><paramref name="userId"/> is passed explicitly rather than read back off
    /// <paramref name="context"/> so the tenant boundary is testable: TelemetryCrossTenantRlsTests calls
    /// this with a userId the caller has no right to and asserts the database refuses it, which is what
    /// proves the session is the caller's Identity session and not a bypass.</para>
    /// </summary>
    Task WriteAsync(
        RequestContext context,
        string userId,
        IReadOnlyList<TelemetryEventRow> rows,
        DateTime expiresAt,
        CancellationToken cancellationToken = default);
}
