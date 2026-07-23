namespace FormMaps.Application.Assessments;

/// <summary>
/// JavaScript string-primitive parity helpers shared across the ported assessment engines.
/// </summary>
public static class JsString
{
    // The exact ECMAScript String.prototype.trim() strip set (the WhiteSpace + LineTerminator
    // productions), so a ported trim matches JS `.trim()` byte-for-byte. This differs from .NET's default
    // Trim() (char.IsWhiteSpace) in two code points: JS strips U+FEFF (ZWNBSP/BOM) which .NET keeps, and
    // .NET strips U+0085 (NEL) which JS keeps. Both verified against node + .NET.
    private static readonly char[] Whitespace =
    [
        '\u0009', '\u000A', '\u000B', '\u000C', '\u000D', '\u0020', '\u00A0', '\u1680',
        '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007',
        '\u2008', '\u2009', '\u200A', '\u2028', '\u2029', '\u202F', '\u205F', '\u3000',
        '\uFEFF',
    ];

    /// <summary>Trim leading/trailing whitespace using the exact JS String.prototype.trim() strip set.</summary>
    public static string JsTrim(string value) => value.Trim(Whitespace);

    /// <summary>True when <paramref name="c"/> is in the exact ECMAScript whitespace/line-terminator set (the same set
    /// JS <c>parseFloat</c> skips as leading whitespace). Differs from <see cref="char.IsWhiteSpace(char)"/> in two code
    /// points — includes U+FEFF (ZWNBSP), excludes U+0085 (NEL).</summary>
    public static bool IsWhitespace(char c) => Array.IndexOf(Whitespace, c) >= 0;
}
