using System.Globalization;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CourseImport;

/// <summary>
/// Pure port of ECMAScript <c>parseFloat</c> as legacy calls it (<c>credits: parseFloat(row.credits)</c>). Trims
/// leading whitespace, parses the LONGEST valid decimal-float prefix (optional sign, digits with one '.', optional
/// e/E±digits exponent) or a leading "Infinity"/"-Infinity", and returns the parsed double — or NaN when no valid
/// prefix exists. Stops at the first invalid char ("3.5xyz" → 3.5, "12abc" → 12, "abc" → NaN, "1e2" → 100, "" → NaN).
/// The caller maps NaN/Infinity to a per-row FAILURE (a Decimal write is impossible), matching legacy's
/// Prisma-throws-then-caught outcome; the message string diverges but the outcome (row counted failed) matches.
/// </summary>
public static class JsParseFloat
{
    public static double Parse(string? s)
    {
        if (s is null)
        {
            return double.NaN;
        }

        var n = s.Length;
        var i = 0;
        // ECMAScript parseFloat skips the exact StrWhiteSpace set (incl U+FEFF, excl U+0085) — NOT char.IsWhiteSpace.
        while (i < n && JsString.IsWhitespace(s[i]))
        {
            i++;
        }

        var start = i;
        var negative = false;
        if (i < n && (s[i] == '+' || s[i] == '-'))
        {
            negative = s[i] == '-';
            i++;
        }

        // Leading "Infinity" (case-sensitive, as ECMAScript).
        if (i < n && s[i] == 'I')
        {
            if (i + 8 <= n && string.CompareOrdinal(s, i, "Infinity", 0, 8) == 0)
            {
                return negative ? double.NegativeInfinity : double.PositiveInfinity;
            }

            return double.NaN;
        }

        var intDigits = 0;
        while (i < n && IsDigit(s[i]))
        {
            i++;
            intDigits++;
        }

        var fracDigits = 0;
        if (i < n && s[i] == '.')
        {
            i++;
            while (i < n && IsDigit(s[i]))
            {
                i++;
                fracDigits++;
            }
        }

        if (intDigits == 0 && fracDigits == 0)
        {
            return double.NaN; // no mantissa digits → NaN
        }

        // Optional exponent — only consumed when it carries at least one digit (else backtrack to the mantissa end).
        var mantissaEnd = i;
        if (i < n && (s[i] == 'e' || s[i] == 'E'))
        {
            var j = i + 1;
            if (j < n && (s[j] == '+' || s[j] == '-'))
            {
                j++;
            }

            var expDigits = 0;
            while (j < n && IsDigit(s[j]))
            {
                j++;
                expDigits++;
            }

            i = expDigits > 0 ? j : mantissaEnd;
        }

        var slice = s.Substring(start, i - start);
        return double.Parse(slice, NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    private static bool IsDigit(char c) => c is >= '0' and <= '9';
}
