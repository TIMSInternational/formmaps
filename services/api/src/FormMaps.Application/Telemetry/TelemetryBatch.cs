using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FormMaps.Application.Telemetry;

/// <summary>
/// What the batch resolved to, and therefore what the endpoint responds with. Three outcomes, matching
/// the three exits of formmaps-platform/api/src/routes/telemetry.ts:31-61.
/// </summary>
public enum TelemetryBatchStatus
{
    /// <summary>telemetry.ts:57 — 200 <c>{ success: true, data: { eventsReceived: N } }</c>.</summary>
    Ok,

    /// <summary>telemetry.ts:34-36 — 400 <c>{ success: false, message: "1-100 events required" }</c>.</summary>
    InvalidBatch,

    /// <summary>
    /// telemetry.ts:58-60 — 500 <c>{ success: false, message: "Internal server error" }</c>. Legacy gets
    /// here by THROWING, not by validating: see <see cref="TelemetryBatch.Parse"/>.
    /// </summary>
    Malformed,
}

/// <summary>
/// One row of the <c>prisma.telemetryEvent.createMany</c> at telemetry.ts:45-55, already resolved.
/// <paramref name="PropertiesJson"/> is the RAW JSON text destined for the <c>jsonb</c> column, or null
/// for legacy's <c>e.properties || null</c>.
/// </summary>
public sealed record TelemetryEventRow(string Type, DateTime Timestamp, string? PropertiesJson);

public sealed record TelemetryBatchParseResult(TelemetryBatchStatus Status, IReadOnlyList<TelemetryEventRow> Rows)
{
    public static readonly TelemetryBatchParseResult InvalidBatch = new(TelemetryBatchStatus.InvalidBatch, []);

    public static readonly TelemetryBatchParseResult Malformed = new(TelemetryBatchStatus.Malformed, []);

    public static TelemetryBatchParseResult Ok(IReadOnlyList<TelemetryEventRow> rows) =>
        new(TelemetryBatchStatus.Ok, rows);
}

/// <summary>
/// The body half of POST /api/v1/telemetry/events (formmaps-platform/api/src/routes/telemetry.ts:31),
/// as a pure function so the legacy quirks below can be pinned without a server.
///
/// <para>THE SHAPE OF LEGACY'S VALIDATION IS "ALMOST NONE". There is no Zod schema on this route. Only
/// the batch envelope is checked (<c>Array.isArray</c> + a 1..100 length window, telemetry.ts:34); every
/// element is then run through <c>VALID_EVENTS.has(e.type)</c> and whatever survives is handed to
/// Prisma. That means three DIFFERENT things happen to a bad element, and they are the contract:</para>
/// <list type="bullet">
///   <item>an element with an unknown or missing <c>type</c> is DROPPED SILENTLY and still returns 200;</item>
///   <item>an element that is a number, string, boolean or array is likewise dropped — <c>(5).type</c> is
///   <c>undefined</c> in JS, not an error;</item>
///   <item>an element that is JSON <c>null</c> THROWS (<c>null.type</c> is a TypeError), the route's
///   <c>catch</c> takes it, and the whole request is a 500 — including batches that had no valid events
///   at all, because the filter runs before the length check on the filtered list.</item>
/// </list>
///
/// <para>A 500 is not a nice answer for a telemetry ingest, and the client makes it worse: apps/web's
/// telemetryService.flush (apps/web/src/services/telemetryService.ts:462-471) puts the batch BACK on the
/// queue on any non-ok response, so a permanently-poisonous batch is retried until the 100-event cap
/// drops it. That is legacy's behaviour today, it is what the flag flip has to preserve, and it is
/// recorded here rather than quietly repaired — #40 and #151 were reverted on this project for exactly
/// that kind of tightening.</para>
/// </summary>
public static class TelemetryBatch
{
    /// <summary>telemetry.ts:34 — <c>events.length > 100</c>.</summary>
    public const int MaxEvents = 100;

    /// <summary>telemetry.ts:35, verbatim. It IS the response body.</summary>
    public const string InvalidBatchMessage = "1-100 events required";

    /// <summary>telemetry.ts:40 — <c>Date.now() + 90 * 24 * 60 * 60 * 1000</c>.</summary>
    public static readonly TimeSpan Retention = TimeSpan.FromDays(90);

    /// <summary>Max |ms| for a valid JS Date (TimeClip = ±8.64e15). Beyond that <c>new Date(n)</c> is Invalid.</summary>
    private const long JsMaxTimeMs = 8_640_000_000_000_000L;

    /// <summary>
    /// telemetry.ts:39 — <c>crypto.createHash("sha256").update(req.userId).digest("hex")</c>. LOWERCASE
    /// hex, 64 characters: the legacy suite asserts <c>/^[0-9a-f]{64}$/</c> on the stored column
    /// (telemetry-web-vital.route.test.ts:68), so an upper-case rendering here would be a visible change.
    ///
    /// <para>Note what this hash is and is not. The row ALSO carries the bare <c>userId</c>
    /// (telemetry.ts:47), so this is not anonymisation — it is a stable join key for analytics that do
    /// not need the identifier. Legacy stores both; so does this port.</para>
    /// </summary>
    public static string HashUserId(string userId) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(userId)));

    /// <summary>
    /// Resolve the request body into the rows legacy would have written.
    /// </summary>
    /// <param name="body">
    /// The parsed body, or <c>null</c> for a body <c>express.json()</c> could not parse. Legacy mounts
    /// <c>express.json({ limit: "10mb" })</c> app-wide at index.ts:159, BEFORE the route's
    /// <c>authenticate</c>, and its SyntaxError reaches the global handler at index.ts:434, which
    /// answers 500 regardless of <c>err.status</c> — so malformed JSON is a 500 even for an anonymous
    /// caller. Hence <see cref="TelemetryBatchStatus.Malformed"/>, not a 400.
    /// </param>
    /// <param name="now">
    /// One instant for the whole batch: the row default (telemetry.ts:50) and <c>expiresAt</c>
    /// (telemetry.ts:40). Legacy re-evaluates <c>new Date()</c> per row inside the map, so rows without a
    /// client timestamp can differ from each other by under a millisecond there and cannot here. Recorded
    /// as an accepted divergence; nothing reads these columns at sub-millisecond resolution.
    /// </param>
    public static TelemetryBatchParseResult Parse(JsonElement? body, DateTime now)
    {
        if (body is not { } root)
        {
            return TelemetryBatchParseResult.Malformed;
        }

        // `req.body.events` on a non-object (an array root, say) is undefined -> !Array.isArray -> 400.
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("events", out var events) ||
            events.ValueKind != JsonValueKind.Array)
        {
            return TelemetryBatchParseResult.InvalidBatch;
        }

        var length = events.GetArrayLength();
        if (length == 0 || length > MaxEvents)
        {
            return TelemetryBatchParseResult.InvalidBatch;
        }

        var rows = new List<TelemetryEventRow>();
        foreach (var element in events.EnumerateArray())
        {
            // `null.type` -> TypeError -> the route's catch -> 500. This is checked BEFORE the allow-list
            // because legacy's filter runs over every element regardless of how many survive it: a batch
            // of nothing but unknown types plus one null is still a 500, not a 200/0.
            if (element.ValueKind == JsonValueKind.Null)
            {
                return TelemetryBatchParseResult.Malformed;
            }

            var type = ReadType(element);
            if (!TelemetryEventTypes.IsAllowed(type))
            {
                continue;
            }

            if (!TryResolveTimestamp(element, now, out var timestamp))
            {
                // `new Date(<garbage>)` is an Invalid Date, which Prisma rejects on the createMany -> 500.
                return TelemetryBatchParseResult.Malformed;
            }

            rows.Add(new TelemetryEventRow(type!, timestamp, ReadProperties(element)));
        }

        return TelemetryBatchParseResult.Ok(rows);
    }

    /// <summary>
    /// <c>e.type</c> as legacy's <c>Set.has</c> would see it. A non-string (number, object, ...) is a
    /// value the set cannot contain, so it is indistinguishable from absent here — both mean "dropped".
    /// </summary>
    private static string? ReadType(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object ||
            !element.TryGetProperty("type", out var type) ||
            type.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return type.GetString();
    }

    /// <summary>
    /// telemetry.ts:50 — <c>e.timestamp ? new Date(e.timestamp) : new Date()</c>. The ternary is JS
    /// truthiness, so absent / null / false / 0 / "" all fall through to <paramref name="now"/>; anything
    /// else is coerced by the Date constructor. Returns false only for a truthy value that yields an
    /// Invalid Date, which is legacy's 500.
    ///
    /// <para>DOCUMENTED DIVERGENCE (low): the string branch uses .NET's parser, whose accept/reject set
    /// differs from JS <c>new Date(string)</c> on pathological non-ISO input, and the array branch is
    /// treated as always-Invalid where JS would coerce <c>[2020]</c> to the string "2020" and accept it.
    /// The only producer is apps/web/src/services/telemetryService.ts:216, which sends
    /// <c>new Date().toISOString()</c> — ISO-8601 UTC, on which the two parsers agree. Same call the
    /// SchoolStudentsWriteEndpoints deadline port makes, and recorded for the same reason.</para>
    /// </summary>
    private static bool TryResolveTimestamp(JsonElement element, DateTime now, out DateTime timestamp)
    {
        timestamp = now;

        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("timestamp", out var raw))
        {
            return true;
        }

        switch (raw.ValueKind)
        {
            case JsonValueKind.Null:
            case JsonValueKind.False:
                return true; // JS-falsy -> new Date()

            case JsonValueKind.String:
                var text = raw.GetString();
                if (string.IsNullOrEmpty(text))
                {
                    return true; // "" is falsy -> new Date()
                }

                if (!DateTimeOffset.TryParse(
                        text,
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                        out var parsed))
                {
                    return false;
                }

                timestamp = parsed.UtcDateTime;
                return true;

            case JsonValueKind.Number:
                if (!raw.TryGetDouble(out var ms))
                {
                    return false;
                }

                if (ms == 0)
                {
                    return true; // 0 is falsy -> new Date()
                }

                if (double.IsNaN(ms) || Math.Abs(ms) > JsMaxTimeMs)
                {
                    return false; // outside TimeClip -> Invalid Date
                }

                timestamp = DateTimeOffset.FromUnixTimeMilliseconds((long)ms).UtcDateTime;
                return true;

            case JsonValueKind.True:
                timestamp = DateTimeOffset.FromUnixTimeMilliseconds(1).UtcDateTime; // new Date(true) === new Date(1)
                return true;

            default:
                return false; // object/array -> Invalid Date
        }
    }

    /// <summary>
    /// telemetry.ts:51 — <c>e.properties || null</c>. JS truthiness again, so <c>false</c>, <c>0</c> and
    /// <c>""</c> become SQL NULL while <c>true</c>, a non-zero number and a non-empty string are stored
    /// as-is: the column is <c>jsonb</c> (Prisma <c>Json?</c>), not an object column, and legacy never
    /// asserts the value is an object. Ported literally, quirk included.
    /// </summary>
    private static string? ReadProperties(JsonElement element)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("properties", out var properties))
        {
            return null;
        }

        return properties.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined or JsonValueKind.False => null,
            JsonValueKind.String => properties.GetString() is { Length: > 0 } ? properties.GetRawText() : null,
            JsonValueKind.Number => properties.TryGetDouble(out var n) && n == 0 ? null : properties.GetRawText(),
            _ => properties.GetRawText(),
        };
    }
}
