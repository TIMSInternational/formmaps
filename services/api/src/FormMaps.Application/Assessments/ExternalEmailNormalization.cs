using System.Text.RegularExpressions;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Faithful port of the live-TS lib/emailNormalize.ts. Shared by every invitation flow; here it backs the
/// external 360 submit-feedback email-match guard. Canonicalize BEFORE comparison so a pasted
/// "mailto:andres@gmail.com" / "&lt;x&gt;" / "  X  " all collapse to the same address the group stored.
/// </summary>
public static partial class ExternalEmailNormalization
{
    /// <summary>Canonicalize a raw email: trim → strip leading mailto: → strip angle brackets → trim → lowercase.</summary>
    public static string NormalizeEmail(string? raw)
    {
        if (string.IsNullOrEmpty(raw))
        {
            return string.Empty;
        }

        var value = raw.Trim();
        value = LeadingMailto().Replace(value, string.Empty);
        value = LeadingAngles().Replace(value, string.Empty);
        value = TrailingAngles().Replace(value, string.Empty);
        return value.Trim().ToLowerInvariant();
    }

    /// <summary>
    /// Faithful port of zod v3's <c>z.string().email()</c> regex (zod 3.25.76, the version the live TS pins;
    /// verbatim from node_modules/zod/v3/types.js line 384). Used to validate the RAW incoming evaluatorEmail
    /// BEFORE normalization (feedbackSchema, evaluation.ts) — a value like "mailto:&lt;X&gt;" must 400, not slip
    /// through to normalizeEmail. On failure the route returns zod's default message ("Invalid email").
    /// </summary>
    public static bool IsValidZodEmail(string? raw) => !string.IsNullOrEmpty(raw) && ZodEmail().IsMatch(raw);

    // zod v3 emailRegex: /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i
    [GeneratedRegex(@"^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$", RegexOptions.IgnoreCase)]
    private static partial Regex ZodEmail();

    // /^mailto:/i
    [GeneratedRegex("^mailto:", RegexOptions.IgnoreCase)]
    private static partial Regex LeadingMailto();

    // /^<+/
    [GeneratedRegex("^<+")]
    private static partial Regex LeadingAngles();

    // />+$/
    [GeneratedRegex(">+$")]
    private static partial Regex TrailingAngles();
}
