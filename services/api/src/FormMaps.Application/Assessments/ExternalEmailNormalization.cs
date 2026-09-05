using System.Diagnostics.CodeAnalysis;
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
    /// source: node_modules/zod/v3/types.js line 384). Used to validate the RAW incoming value BEFORE
    /// normalization, exactly where legacy runs zod: the external 360 evaluatorEmail (feedbackSchema,
    /// evaluation.ts), community-service supervisorEmail, and the /authapi signup / change-email /
    /// forgot-password bodies (routes/auth-admin.ts signupSchema, routes/auth.ts changeEmailSchema and
    /// forgotPasswordSchema) — a value like "mailto:&lt;X&gt;" or "  x@y.com  " must 400, not slip through
    /// to normalizeEmail. On failure the routes return zod's default message ("Invalid email").
    ///
    /// Acceptance set is zod's, quirks included, and is pinned by
    /// ExternalEmailNormalizationIsValidZodEmailTests against zod itself: ASCII-only (no unicode local
    /// parts or IDN labels — punycode only), no whitespace anywhere, exactly one '@', no leading dot, no
    /// consecutive dots, local part may not end in '.' or '\'', each domain label starts with [A-Za-z0-9]
    /// (but MAY end in '-'), and the TLD is 2+ letters.
    /// </summary>
    public static bool IsValidZodEmail([NotNullWhen(true)] string? raw) => !string.IsNullOrEmpty(raw) && ZodEmail().IsMatch(raw);

    // zod v3 emailRegex: /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i
    //
    // Spelled out for .NET rather than copied verbatim, because the two engines disagree on three things
    // the JS source relies on: (1) JS `$` (no /m) is end-of-input, .NET `$` also matches before a final
    // '\n' — hence `\z`; (2) JS /i without /u only folds ASCII letters onto [A-Z], while .NET IgnoreCase
    // also folds e.g. the Kelvin sign U+212A onto 'k' — hence explicit [A-Za-z] with no IgnoreCase;
    // (3) JS `[0-9]` is ASCII-only, as written here, whereas a `\d` shortcut in .NET would admit every
    // Unicode digit.
    [GeneratedRegex(@"^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\z")]
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
