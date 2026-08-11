namespace FormMaps.Application.Audit;

/// <summary>
/// Filters for a cross-tenant <c>audit_events</c> query. Every filter is optional and they combine
/// with AND; an all-default query returns the newest <see cref="Limit" /> events across all schools.
/// </summary>
/// <remarks>
/// <para>
/// CROSS-TENANT IS THE POINT, and it is why this type must never be reachable from a tenant-scoped
/// endpoint. <see cref="SchoolId" /> is a FILTER, not an authorization boundary — passing it narrows
/// the result set, omitting it returns every school's events. The gate lives at the endpoint (Task 6:
/// super-admin only), because the table's RLS policy admits bypass-mode sessions only and therefore
/// enforces nothing about WHICH tenant's rows a bypassing session may see.
/// </para>
/// <para>
/// <see cref="From" />/<see cref="To" /> are INCLUSIVE on both ends. <see cref="Cursor" /> is an
/// opaque, implementation-owned token from a previous <see cref="AuditEventPage.NextCursor" /> —
/// callers must treat it as such, and a malformed one is rejected with
/// <see cref="ArgumentException" /> rather than silently ignored (silently ignoring it restarts the
/// caller at page one, which is an infinite loop, not a degraded result).
/// </para>
/// </remarks>
public sealed record AuditEventQuery(
    string? EventType = null,
    string? ActorUserId = null,
    string? SubjectType = null,
    string? SubjectId = null,
    string? SchoolId = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    int Limit = 50,
    string? Cursor = null);

/// <summary>
/// One persisted audit row. <c>MetadataJson</c> is the raw JSONB text, not a parsed object: the
/// endpoint re-serializes it verbatim and nothing in .NET needs to interpret it.
/// </summary>
public sealed record AuditEventRecord(
    string Id,
    DateTimeOffset OccurredAt,
    string EventType,
    string? ActorUserId,
    string? ActorRole,
    string? SchoolId,
    string SubjectType,
    string? SubjectId,
    string Outcome,
    string? MetadataJson);

/// <summary>
/// A page of results. <see cref="NextCursor" /> is null if and only if this page is the last one —
/// callers page until it is null.
/// </summary>
public sealed record AuditEventPage(IReadOnlyList<AuditEventRecord> Items, string? NextCursor);

/// <summary>
/// The ONLY sanctioned read path for <c>audit_events</c>, mirroring <see cref="IAuditEventWriter" />
/// on the write side. Implementations always open their database session under
/// <c>RequestContext.System()</c>; an Identity-mode session sees zero rows.
/// </summary>
public interface IAuditEventReader
{
    /// <summary>
    /// Runs a filtered, keyset-paginated query.
    /// </summary>
    /// <remarks>
    /// Unlike <see cref="IAuditEventWriter.WriteAsync" />, this is NOT fail-soft, and the asymmetry is
    /// deliberate: a swallowed write loses one audit row while the user's real action still succeeds,
    /// but a swallowed read returns an EMPTY PAGE that an auditor cannot distinguish from "nothing
    /// happened" — the worst possible failure mode for an audit trail. Database errors propagate.
    /// </remarks>
    /// <exception cref="ArgumentException">
    /// <see cref="AuditEventQuery.Cursor" /> is not a token this reader issued.
    /// </exception>
    Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default);
}
