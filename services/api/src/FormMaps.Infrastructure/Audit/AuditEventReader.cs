using System.Data.Common;
using System.Globalization;
using System.Text;
using FormMaps.Application.Audit;
using FormMaps.Application.Auth;
using FormMaps.Application.Data;

namespace FormMaps.Infrastructure.Audit;

/// <summary>
/// Reads <c>audit_events</c>. Always opens under <see cref="RequestContext.System()" /> — the same
/// RLS-bypass rationale as <see cref="AuditEventWriter" />: the table's policy admits bypass-mode
/// sessions ONLY, so an Identity-mode session returns zero rows here regardless of the caller's
/// permissions.
/// </summary>
/// <remarks>
/// <para>
/// THE AUTHORIZATION GATE IS NOT HERE. Because this reader bypasses RLS, it can see every school's
/// events, and <see cref="AuditEventQuery.SchoolId" /> is a convenience filter rather than a
/// boundary. The only thing standing between a caller and the whole cross-tenant trail is the
/// endpoint's super-admin check (<c>AuditEndpoints</c>). Anything else that ever resolves
/// <see cref="IAuditEventReader" /> from DI inherits that responsibility.
/// </para>
/// <para>
/// KEYSET PAGINATION on <c>("occurredAt", "id") DESC</c>, matching the composite index in
/// <c>infra/aws/sql/audit-events-schema.sql</c>. Offset paging would be simpler and wrong: audit rows
/// are inserted continuously, so <c>OFFSET n</c> shifts under the reader and an auditor paging
/// through a busy window silently skips events. The <c>id</c> half of the key is not decoration
/// either — <c>occurredAt</c> defaults to <c>now()</c>, which is TRANSACTION start time, so a batch
/// of events committed together genuinely can share a timestamp; a cursor on the timestamp alone
/// would skip the rest of a tied group.
/// </para>
/// <para>
/// NOT FAIL-SOFT, unlike the writer. A swallowed read produces an empty page that is
/// indistinguishable from "nothing was audited", which is precisely the lie an audit trail exists to
/// prevent. Database errors propagate to the caller and become a 5xx.
/// </para>
/// </remarks>
public sealed class AuditEventReader(IFormMapsDatabaseSessionFactory databaseSessionFactory) : IAuditEventReader
{
    /// <summary>
    /// Ceiling on rows per page. The endpoint's <c>limit</c> comes straight off a query string, and
    /// <c>audit_events</c> is append-only and retained indefinitely, so an unclamped value is an
    /// unbounded scan on the largest table in the system.
    /// </summary>
    private const int MaxLimit = 200;

    private const char CursorSeparator = '|';

    public async Task<AuditEventPage> QueryAsync(AuditEventQuery query, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Clamped, not validated-and-rejected: limit is a presentation concern, and a caller asking
        // for 0 or 10_000 wants "a page", not an error. Decoding happens BEFORE the connection is
        // opened so a malformed cursor costs nothing.
        var limit = Math.Clamp(query.Limit, 1, MaxLimit);
        var cursor = DecodeCursor(query.Cursor);

        var sql = new StringBuilder("""
            SELECT "id", "occurredAt", "eventType", "actorUserId", "actorRole", "schoolId",
                   "subjectType", "subjectId", "outcome", "metadata"::text
            FROM "audit_events"
            WHERE 1 = 1
            """);
        var parameters = new List<(string Name, object Value)>();

        // A BLANK STRING FILTER IS NO FILTER. Every string field on AuditEventQuery is nullable, so
        // "" can only arrive from a caller that turned an absent value into an empty one — a query
        // string that carries the key with no value is the common case (see AuditEndpoints, which
        // normalizes there as well). Appending `AND "eventType" = ''` for that is not a narrower
        // search, it is an unsatisfiable one: no audit row has a blank identifier in any of these
        // columns, so the caller gets an empty page and a 200 and no way to tell that apart from an
        // empty trail. Both layers normalize on purpose — the endpoint is not the only thing that can
        // resolve IAuditEventReader from DI, and this is the layer that owns the SQL.
        void AddFilter(string sqlFragment, string parameterName, object? value)
        {
            if (value is null || (value is string text && string.IsNullOrWhiteSpace(text)))
            {
                return;
            }

            sql.Append(sqlFragment);
            parameters.Add((parameterName, value));
        }

        AddFilter(""" AND "eventType" = @eventType""", "eventType", query.EventType);
        AddFilter(""" AND "actorUserId" = @actorUserId""", "actorUserId", query.ActorUserId);
        AddFilter(""" AND "subjectType" = @subjectType""", "subjectType", query.SubjectType);
        AddFilter(""" AND "subjectId" = @subjectId""", "subjectId", query.SubjectId);
        AddFilter(""" AND "schoolId" = @schoolId""", "schoolId", query.SchoolId);
        AddFilter(""" AND "occurredAt" >= @from""", "from", query.From?.UtcDateTime);
        AddFilter(""" AND "occurredAt" <= @to""", "to", query.To?.UtcDateTime);

        if (cursor is { } keyset)
        {
            // Row comparison, not "occurredAt" < @t OR ("occurredAt" = @t AND "id" < @id): identical
            // semantics, but the row form is what Postgres can answer as a single index scan on
            // audit_events_occurredAt_id_idx.
            sql.Append(""" AND ("occurredAt", "id") < (@cursorOccurredAt, @cursorId)""");
            parameters.Add(("cursorOccurredAt", keyset.OccurredAt));
            parameters.Add(("cursorId", keyset.Id));
        }

        // limit + 1: one row past the page is how "is there a next page?" is answered without a
        // second COUNT query. It is trimmed before the page is returned.
        sql.Append(""" ORDER BY "occurredAt" DESC, "id" DESC LIMIT @limit""");
        parameters.Add(("limit", limit + 1));

        await using var session = await databaseSessionFactory.OpenReadOnlyAsync(
            RequestContext.System(), cancellationToken);

        await using var command = Command(session, sql.ToString());
        foreach (var (name, value) in parameters)
        {
            AddParameter(command, name, value);
        }

        var items = new List<AuditEventRecord>(limit + 1);
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                items.Add(new AuditEventRecord(
                    reader.GetString(0),
                    // timestamptz comes back as a UTC DateTime; SpecifyKind is belt-and-braces so the
                    // DateTimeOffset can never inherit the SERVER's local offset.
                    new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(1), DateTimeKind.Utc)),
                    reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.GetString(6),
                    reader.IsDBNull(7) ? null : reader.GetString(7),
                    reader.GetString(8),
                    reader.IsDBNull(9) ? null : reader.GetString(9)));
            }
        }

        string? nextCursor = null;
        if (items.Count > limit)
        {
            // Strictly greater, not >=: at exactly `limit` rows there is no further page, and
            // emitting a cursor there is an endless paging loop for any caller that pages until the
            // cursor is null.
            items.RemoveAt(items.Count - 1);
            var last = items[^1];
            nextCursor = EncodeCursor(last.OccurredAt.UtcDateTime, last.Id);
        }

        return new AuditEventPage(items, nextCursor);
    }

    /// <summary>
    /// Opaque to callers, deliberately: base64 discourages hand-crafting one, and the fact that it
    /// happens to contain a timestamp and an id is an implementation detail that must stay changeable.
    /// It is NOT a security boundary and carries nothing sensitive — audit ids are GUIDs, and a caller
    /// who can read this page can read the timestamp on it anyway.
    /// </summary>
    private static string EncodeCursor(DateTime occurredAtUtc, string id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(
            $"{occurredAtUtc.ToString("O", CultureInfo.InvariantCulture)}{CursorSeparator}{id}"));

    /// <summary>
    /// Decodes a cursor, or throws <see cref="ArgumentException" />.
    /// </summary>
    /// <remarks>
    /// The cursor arrives straight off a query string, and it can be malformed in three independent
    /// ways that raise three unrelated exception types (<c>FormatException</c> from base64,
    /// <c>IndexOutOfRangeException</c> from a missing separator, <c>FormatException</c> again from the
    /// timestamp). Normalising them to one documented type is what lets the endpoint answer 400
    /// instead of 500 without resorting to <c>catch (Exception)</c>.
    /// <para>
    /// Rejecting is the right behaviour rather than ignoring: a silently-dropped cursor restarts the
    /// caller at page one, so a client paging to exhaustion loops forever instead of failing.
    /// </para>
    /// <para>
    /// The offending value is never echoed into the message. It is attacker-controlled, and error
    /// messages end up in logs.
    /// </para>
    /// </remarks>
    private static (DateTime OccurredAt, string Id)? DecodeCursor(string? cursor)
    {
        // Whitespace counts as absent, same reasoning as AddFilter above: `?cursor=` (or `?cursor=%20`)
        // from a client that always emits the key means "first page", and answering it with a 400
        // would break the very first request of an otherwise correct caller. This does NOT soften the
        // rejection of a cursor that has content — a token this reader did not issue still throws.
        if (string.IsNullOrWhiteSpace(cursor))
        {
            return null;
        }

        string decoded;
        try
        {
            decoded = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
        }
        catch (FormatException)
        {
            throw InvalidCursor();
        }

        var parts = decoded.Split(CursorSeparator, 2);
        if (parts.Length != 2 || parts[1].Length == 0)
        {
            throw InvalidCursor();
        }

        if (!DateTime.TryParse(
                parts[0],
                CultureInfo.InvariantCulture,
                DateTimeStyles.RoundtripKind,
                out var occurredAt))
        {
            throw InvalidCursor();
        }

        return (occurredAt.ToUniversalTime(), parts[1]);
    }

    private static ArgumentException InvalidCursor() => new(
        "The supplied audit-event cursor is not a token this reader issued. Pass a value from a previous page's NextCursor, or omit it to start from the newest event.",
        nameof(AuditEventQuery.Cursor));

    private static DbCommand Command(FormMapsDatabaseSession session, string sql)
    {
        var command = session.Connection.CreateCommand();
        command.Transaction = session.Transaction;
        command.CommandText = sql;
        return command;
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
