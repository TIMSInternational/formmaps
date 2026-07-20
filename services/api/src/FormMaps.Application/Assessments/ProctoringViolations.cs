using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace FormMaps.Application.Assessments;

/// <summary>One normalized proctoring violation (type/timestamp/details), bounded to safe lengths.</summary>
public sealed record ProctoringViolation(string Type, string Timestamp, string Details);

/// <summary>Merge outcome: the stored array (existing verbatim + bounded incoming), the new total, review flag.</summary>
public sealed record ProctoringMerge(JsonArray All, int Count, bool Flag);

/// <summary>
/// Faithful port of the live-TS lib/proctoring.ts — bounding + merge + flag logic shared by every assessment
/// runner's violation endpoint (here: the external 360/vocational evaluator flush). Pure — no DB.
/// </summary>
public static class ProctoringViolations
{
    /// <summary>A session is flagged for manual review once it accumulates this many violations.</summary>
    public const int FlagThreshold = 3;

    private const int PerRequestCap = 200;
    private const int StoredCap = 500;

    /// <summary>
    /// Normalize + bound an untrusted violations value (cap 200 per request). A non-array → empty. Per item:
    /// type = String(v.type ?? "unknown")[..50]; timestamp = String(v.timestamp ?? defaultTimestamp)[..40];
    /// details = String(v.details ?? "")[..300]. <paramref name="defaultTimestamp"/> mirrors JS
    /// <c>new Date().toISOString()</c> supplied by the caller (kept out of this pure helper for testability).
    /// </summary>
    public static List<ProctoringViolation> Bound(JsonElement rawViolations, string defaultTimestamp)
    {
        var result = new List<ProctoringViolation>();
        if (rawViolations.ValueKind != JsonValueKind.Array)
        {
            return result;
        }

        foreach (var element in rawViolations.EnumerateArray())
        {
            if (result.Count >= PerRequestCap)
            {
                break;
            }

            result.Add(new ProctoringViolation(
                Type: Slice(JsString(Prop(element, "type"), "unknown"), 50),
                Timestamp: Slice(JsString(Prop(element, "timestamp"), defaultTimestamp), 40),
                Details: Slice(JsString(Prop(element, "details"), string.Empty), 300)));
        }

        return result;
    }

    /// <summary>Merge existing (verbatim) + bounded incoming (cap 500), derive count + review flag (count ≥ 3).</summary>
    public static ProctoringMerge Merge(JsonElement? existing, IReadOnlyList<ProctoringViolation> incoming)
    {
        var all = new JsonArray();
        if (existing is { ValueKind: JsonValueKind.Array } existingArray)
        {
            foreach (var element in existingArray.EnumerateArray())
            {
                if (all.Count >= StoredCap)
                {
                    break;
                }

                all.Add(JsonNode.Parse(element.GetRawText()));
            }
        }

        foreach (var violation in incoming)
        {
            if (all.Count >= StoredCap)
            {
                break;
            }

            all.Add(new JsonObject
            {
                ["type"] = violation.Type,
                ["timestamp"] = violation.Timestamp,
                ["details"] = violation.Details,
            });
        }

        var count = all.Count;
        return new ProctoringMerge(all, count, count >= FlagThreshold);
    }

    // el?.[name] — the property value, or an undefined element when absent / el is not an object.
    private static JsonElement? Prop(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value)
            ? value
            : null;

    // JS `String(value ?? fallback)`: null/undefined → fallback; else stringify the JSON scalar.
    private static string JsString(JsonElement? value, string fallback) => value switch
    {
        null => fallback,
        { ValueKind: JsonValueKind.Null } => fallback,
        { ValueKind: JsonValueKind.String } s => s.GetString() ?? fallback,
        { ValueKind: JsonValueKind.Number } n => n.GetRawText(),
        { ValueKind: JsonValueKind.True } => "true",
        { ValueKind: JsonValueKind.False } => "false",
        { } other => other.GetRawText(),
    };

    private static string Slice(string value, int max) => value.Length > max ? value[..max] : value;

    // ToIso helper for the default timestamp (ms precision, Z suffix) — callers pass DateTimeOffset.UtcNow.
    public static string IsoZ(DateTimeOffset instant) =>
        instant.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
