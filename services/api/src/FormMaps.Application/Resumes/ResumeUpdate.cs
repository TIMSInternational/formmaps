using System.Text.Json;

namespace FormMaps.Application.Resumes;

/// <summary>
/// Pure port of PUT /api/resume/:resumeId's field-selection (routes/resume.ts L142-153): only body keys the
/// caller actually sent get written — no defaults, unlike POST's ResumeCreate. documentEdits is bounded
/// separately (sanitizeDocumentEdits, L125-139) — cap 1000 entries, clamp orig/text to 1000 chars, drop any entry
/// whose page/runIndex isn't a non-negative integer after JS Number() coercion (NaN/non-numeric → 0 via `|| 0`,
/// so a malformed page/runIndex silently becomes 0 rather than dropping the entry, UNLESS 0 itself still fails the
/// final Number.isInteger &amp;&amp; >= 0 check — it doesn't, 0 is valid, so `|| 0` effectively means "garbage
/// page/runIndex survives as 0", matching legacy exactly).
/// </summary>
public static class ResumeUpdate
{
    private static readonly string[] WhitelistedFields =
    [
        "name", "template", "careerField", "personalInfo", "experience",
        "education", "skills", "sections", "fieldVisibility", "customFields",
    ];

    public static IReadOnlyDictionary<string, JsonElement> ResolveFields(JsonElement body)
    {
        var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (body.ValueKind != JsonValueKind.Object)
        {
            return result;
        }

        foreach (var key in WhitelistedFields)
        {
            if (body.TryGetProperty(key, out var value))
            {
                result[key] = value.Clone();
            }
        }

        return result;
    }

    public static string? SanitizeDocumentEdits(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object || !body.TryGetProperty("documentEdits", out var raw))
        {
            return null;
        }

        var entries = new List<object>();
        if (raw.ValueKind == JsonValueKind.Array)
        {
            var count = 0;
            foreach (var element in raw.EnumerateArray())
            {
                if (count >= 1000) break;
                count++;

                if (element.ValueKind != JsonValueKind.Object) continue;

                var page = CoerceNumberOrZero(element, "page");
                var runIndex = CoerceNumberOrZero(element, "runIndex");
                var orig = CoerceStringClamped(element, "orig");
                var text = CoerceStringClamped(element, "text");

                if (page < 0 || runIndex < 0) continue; // Number.isInteger + >=0 gate; page/runIndex are always
                                                          // integers here since CoerceNumberOrZero truncates.

                entries.Add(new { page, runIndex, orig, text });
            }
        }

        return JsonSerializer.Serialize(entries);
    }

    private static int CoerceNumberOrZero(JsonElement element, string prop)
    {
        if (!element.TryGetProperty(prop, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return 0;
        }

        // Match legacy's `Number(e.page) || 0`: any JSON number token is a valid JS Number, but only
        // finite, whole-number values in int range are usable as page/runIndex. Non-canonical-but-valid
        // forms like 3.0 or 1e2 must still parse (GetDouble handles that); non-finite, fractional, or
        // out-of-range values fall through to 0, same as a garbage Number() result would.
        var d = value.GetDouble();
        if (!double.IsFinite(d) || d != Math.Truncate(d) || d < int.MinValue || d > int.MaxValue)
        {
            return 0;
        }

        return (int)d;
    }

    private static string CoerceStringClamped(JsonElement element, string prop)
    {
        if (!element.TryGetProperty(prop, out var value) || value.ValueKind != JsonValueKind.String) return "";
        var s = value.GetString() ?? "";
        return s.Length > 1000 ? s[..1000] : s;
    }
}
