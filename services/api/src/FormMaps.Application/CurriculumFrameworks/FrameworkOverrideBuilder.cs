using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.CurriculumFrameworks;

/// <summary>
/// Pure parser for the customize-course body (PUT /curriculum/frameworks/:type/courses/:courseId), the create-vs-
/// update UNDEFINED ASYMMETRY guard. Mirrors the route's field extraction:
/// <list type="bullet">
///   <item><c>credits = req.body.credits</c> — PRESENT iff the body has the key. A present JSON number → decimal;
///     a present JSON null → present-with-null (writes SQL NULL). Absent → not written on update.</item>
///   <item><c>gradeLevels = req.body.gradeLevel || req.body.gradeLevels || []</c> — JS truthiness: the FIRST value
///     that is truthy wins. An array (even <c>[]</c>) is truthy in JS, so a present <c>gradeLevel</c> array is used
///     even when empty; a null/absent <c>gradeLevel</c> falls through to <c>gradeLevels</c>, then to <c>[]</c>.
///     ALWAYS resolves to an array → ALWAYS written (on both create and update).</item>
///   <item><c>localName = req.body.localName</c> — same present/absent rule as credits (string value or null).</item>
/// </list>
/// Divergence (documented, house-rule-safe): legacy passes a wrong-typed credits/localName/gradeLevel straight to
/// Prisma, which 500s. To avoid a destructive write we treat a present-but-wrong-typed credits/localName as ABSENT
/// (not written → keeps existing on update, NULL on create), and a non-array gradeLevel as falsy (falls through).
/// No parity test exercises those types; the number/string/null/array paths are byte-exact.
/// </summary>
public static class FrameworkOverrideBuilder
{
    public static FrameworkOverrideInput Build(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return new FrameworkOverrideInput(HasCredits: false, Credits: null, GradeLevels: [], HasLocalName: false, LocalName: null);
        }

        // credits: present number → decimal; present NUMERIC STRING → decimal (Prisma Decimal coerces "0.5"→0.5, FM-054
        // gate parity); present null → present-with-null; present other → treated absent (a non-numeric string / bool /
        // object legacy-500s at Prisma — treated absent here, non-destructive; NOT thrown up front so the writer's
        // 404/wrong-type checks, which run BEFORE the upsert in legacy, still take precedence over a would-be 500).
        var hasCredits = false;
        decimal? credits = null;
        if (body.TryGetProperty("credits", out var creditsEl))
        {
            switch (creditsEl.ValueKind)
            {
                case JsonValueKind.Number when creditsEl.TryGetDecimal(out var value):
                    hasCredits = true;
                    credits = value;
                    break;
                case JsonValueKind.String when decimal.TryParse(
                    creditsEl.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed):
                    hasCredits = true;
                    credits = parsed;
                    break;
                case JsonValueKind.Null:
                    hasCredits = true;
                    credits = null;
                    break;
                // other kinds (non-numeric string/bool/object/array): legacy 500s at Prisma; treated as absent here.
            }
        }

        // localName: present string → value; present null → present-with-null; present other → treated absent.
        var hasLocalName = false;
        string? localName = null;
        if (body.TryGetProperty("localName", out var localNameEl))
        {
            switch (localNameEl.ValueKind)
            {
                case JsonValueKind.String:
                    hasLocalName = true;
                    localName = localNameEl.GetString();
                    break;
                case JsonValueKind.Null:
                    hasLocalName = true;
                    localName = null;
                    break;
                // other kinds: treated as absent.
            }
        }

        // gradeLevels: `gradeLevel || gradeLevels || []` (JS truthiness — an array, even empty, is truthy).
        var gradeLevels = ReadIntArray(body, "gradeLevel") ?? ReadIntArray(body, "gradeLevels") ?? [];

        return new FrameworkOverrideInput(hasCredits, credits, gradeLevels, hasLocalName, localName);
    }

    // Returns the int[] when the key is present AND a JSON array (truthy, incl. empty); otherwise null (falsy → fall
    // through). Non-integer numeric elements are floored via GetInt32 like the frontend int payloads.
    private static int[]? ReadIntArray(JsonElement body, string key)
    {
        if (!body.TryGetProperty(key, out var element) || element.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        var values = new List<int>(element.GetArrayLength());
        foreach (var item in element.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var number))
            {
                values.Add(number);
            }
        }

        return [.. values];
    }
}
