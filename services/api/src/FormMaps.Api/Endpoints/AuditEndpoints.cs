using System.Text.Json;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;

namespace FormMaps.Api.Endpoints;

/// <summary>
/// GET /api/v1/audit/events — the cross-tenant audit-trail read. No legacy-Node counterpart; this is
/// new surface (see the audit-events design spec's Rollout section).
/// </summary>
/// <remarks>
/// <para>
/// THIS CHECK IS THE ONLY BOUNDARY. <see cref="IAuditEventReader" /> opens its session under
/// <c>RequestContext.System()</c> and therefore bypasses RLS: it can read every school's events, and
/// the <c>schoolId</c> query parameter is a convenience filter, not an authorization scope. The
/// database will not stop a caller who reaches the reader, so the super-admin test below must run
/// BEFORE the reader is touched — not merely before the response is written.
/// </para>
/// <para>
/// GATED ON <see cref="RequestActor.IsSuperAdmin" />, NOT A PERMISSION STRING, deliberately for v1.
/// Legacy's equivalent gate (<c>requirePermission("admin:settings")</c>) is confirmed dead code — no
/// role in <c>api/src/lib/auth.ts</c>'s ROLE_PERMISSIONS carries <c>admin:settings</c> — so porting it
/// verbatim would ship an endpoint nobody can reach. <c>FormMapsPermissions.AuditRead</c> exists as a
/// forward-compat marker and is deliberately NOT consulted here: making it live requires a cross-repo
/// change to Node's ROLE_PERMISSIONS, tracked as an Open item on the spec. Until then, granting it
/// must not grant access, and a test pins that.
/// </para>
/// </remarks>
public static class AuditEndpoints
{
    /// <summary>Rows per page when the caller does not ask. The reader clamps the upper bound.</summary>
    private const int DefaultLimit = 50;

    public static IEndpointRouteBuilder MapAuditEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/v1/audit/events", GetEventsAsync).WithTags("Audit");
        return app;
    }

    private static async Task<IResult> GetEventsAsync(
        IRequestContextAccessor requestContextAccessor,
        IProtectedRequestGuard protectedRequestGuard,
        IAuditEventReader reader,
        string? eventType,
        string? actorUserId,
        string? subjectType,
        string? subjectId,
        string? schoolId,
        DateTimeOffset? from,
        DateTimeOffset? to,
        int? limit,
        string? cursor,
        CancellationToken cancellationToken)
    {
        var context = requestContextAccessor.Current;
        var decision = protectedRequestGuard.RequireIdentity(context);
        if (!decision.Allowed)
        {
            return Results.Json(
                new { success = false, code = decision.Code, message = decision.Message },
                statusCode: decision.StatusCode);
        }

        // Actor.IsSuperAdmin normalizes the role first ("admin", "super_admin", "superadmin" and
        // "Super Admin" are all the same principal on the wire); comparing the raw string here would
        // lock the real platform admins out.
        if (context.Actor is null || !context.Actor.IsSuperAdmin)
        {
            return Results.Json(
                new { success = false, code = "missing_permission", message = "Insufficient permissions" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        // Blank is ABSENT, not a value to match on. A UI that renders a filter bar and submits every
        // key it owns sends `?eventType=&schoolId=` when the user has selected nothing; those bind to
        // "" rather than null, and "" is a perfectly valid string filter as far as the reader is
        // concerned — it would append `AND "eventType" = ''`, which no row can satisfy, and hand the
        // auditor a permanently empty page under a 200. "The trail is empty" is the one answer this
        // endpoint must never give when it isn't true, so the normalization happens HERE, at the
        // wire boundary, where "the caller did not supply this" is still knowable.
        var query = new AuditEventQuery(
            NullIfBlank(eventType),
            NullIfBlank(actorUserId),
            NullIfBlank(subjectType),
            NullIfBlank(subjectId),
            NullIfBlank(schoolId),
            from,
            to,
            limit ?? DefaultLimit,
            NullIfBlank(cursor));

        AuditEventPage page;
        try
        {
            page = await reader.QueryAsync(query, cancellationToken);
        }
        catch (ArgumentException exception) when (exception.ParamName == nameof(AuditEventQuery.Cursor))
        {
            // The cursor comes straight off the query string, so a malformed one is a client error,
            // not an outage — a 500 here would page on-call for a typo'd URL. The filter is narrow on
            // purpose: ArgumentException is a base type, and a blanket catch would relabel any
            // internal contract violation below this endpoint as "your cursor is bad". Everything
            // else, including a dead database, propagates: an auditor must never be told their query
            // was wrong when the truth is that the trail is unreachable.
            return Results.Json(
                new
                {
                    success = false,
                    code = "invalid_cursor",
                    message = "The cursor is not a token this endpoint issued. Use the nextCursor from a previous page, or omit it.",
                },
                statusCode: StatusCodes.Status400BadRequest);
        }

        return Results.Ok(new
        {
            success = true,
            items = page.Items.Select(ToResponse),
            nextCursor = page.NextCursor,
        });
    }

    /// <summary>
    /// Collapses a present-but-blank query-string value to "not supplied".
    /// </summary>
    /// <remarks>
    /// Whitespace, not just empty: <c>?schoolId=%20</c> is the same user intent as <c>?schoolId=</c>,
    /// and <c>audit_events</c> holds no identifier that is entirely whitespace, so there is no value
    /// being made unreachable here. Applied to <c>cursor</c> too — a blank cursor means "start at the
    /// newest event", whereas rejecting it as malformed would 400 the first page of a client that
    /// always emits the key.
    /// </remarks>
    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>
    /// Projects a record onto the wire shape explicitly rather than serializing
    /// <see cref="AuditEventRecord" /> directly.
    /// </summary>
    /// <remarks>
    /// Two reasons, both load-bearing. First, <c>MetadataJson</c> is raw JSONB TEXT: serialized as-is
    /// it reaches the client as an ESCAPED STRING (<c>"{\"attemptCount\":3}"</c>) under a property
    /// named <c>metadataJson</c>, which every consumer must parse a second time and which no JSON
    /// tooling can filter on. Second, it decouples the public response from an Application-layer
    /// record's property names, so renaming a field there cannot silently break a client.
    /// </remarks>
    private static object ToResponse(AuditEventRecord record) => new
    {
        id = record.Id,
        occurredAt = record.OccurredAt,
        eventType = record.EventType,
        actorUserId = record.ActorUserId,
        actorRole = record.ActorRole,
        schoolId = record.SchoolId,
        subjectType = record.SubjectType,
        subjectId = record.SubjectId,
        outcome = record.Outcome,
        metadata = ParseMetadata(record.MetadataJson),
    };

    /// <summary>
    /// Re-hydrates the JSONB text so it is emitted as real JSON.
    /// </summary>
    /// <remarks>
    /// Not defensively wrapped: the value originates from a <c>jsonb</c> column, which Postgres itself
    /// will not accept invalid JSON into, so a parse failure here means the row was written by
    /// something other than <c>AuditEventWriter</c> — a fact worth surfacing loudly rather than
    /// hiding behind a null. <c>Clone()</c> is what makes the element outlive the disposed document.
    /// </remarks>
    private static JsonElement? ParseMetadata(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        using var document = JsonDocument.Parse(metadataJson);
        return document.RootElement.Clone();
    }
}
