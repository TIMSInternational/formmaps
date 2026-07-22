using System.Globalization;
using System.Text.Json;

namespace FormMaps.Application.SchoolUsers;

/// <summary>
/// Pure port of the legacy grade-level coercion <c>data: { gradeLevel: parseInt(gradeLevel) || null }</c>
/// (schoolService.ts:144), where <c>gradeLevel</c> is the RAW <c>req.body.gradeLevel</c> JS value written into the
/// Postgres <c>int4</c> column. JS <c>parseInt(x)</c> does <c>String(x)</c> first, then the bare-radix leading-integer
/// scan (leading ECMAScript whitespace, optional sign, <c>0x</c>→radix 16 else radix 10, digit run); <c>|| null</c>
/// then folds a falsy result (NaN OR 0) to null. The value is then written to a Prisma <c>Int</c> (Postgres int4).
/// <list type="bullet">
/// <item>"11" → 11, "11abc" → 11, "  12 " → 12, "-5" → -5, "0x10" → 16 (JS hex auto-detect)</item>
/// <item>"0" → 0 → <b>null</b>, "" → NaN → null (the <c>|| null</c> fold: NaN AND 0 both → null)</item>
/// <item>number 11 → "11" → 11, number 0 → null, number <c>1e3</c> → JS <c>String(1000)</c>="1000" → <b>1000</b></item>
/// <item>true/false/JSON-null/object/array → non-numeric → NaN → null</item>
/// <item><b>int4 overflow → 500:</b> "2147483648" (or any leading integer outside Int32) → legacy parseInt yields a
/// JS number Prisma cannot store in int4 → Postgres write error → route catch → uniform 500. We <see cref="OverflowException"/>
/// (→ global handler 500). "-2147483648" (= int4 min) is VALID and stored. We do NOT saturate/clamp — a clamped
/// grade would be a SILENTLY WRONG write (the pre-fix bug this method now closes).</item>
/// </list>
/// This is the DB write value ONLY. The response echoes the RAW body token verbatim (endpoint concern).
/// <para>DOCUMENTED out-of-surface residual (ratified as exotic-for-a-grade-level, never emitted by the frontend):
/// a JSON <b>number</b> ≥ 1e21 stringifies exponential in V8 (<c>String(1e21)</c>="1e+21" → parseInt → 1), whereas we
/// keep the raw token for that regime. Reachable grade inputs are strings "1".."13" or small integers.</para>
/// </summary>
public static class GradeLevelParser
{
    /// <summary>Coerce the raw JSON gradeLevel value to the integer written to the column (null when parseInt-falsy).
    /// Throws <see cref="OverflowException"/> when the leading integer is outside Int32 (int4) range → endpoint 500.</summary>
    public static int? ParseDbValue(JsonElement gradeLevel)
    {
        var (hasDigits, overflow, value) = ScanJsParseInt(Stringify(gradeLevel));
        if (!hasDigits)
        {
            return null; // no digits → NaN → || null
        }

        if (overflow)
        {
            // parseInt produced a JS number outside int4; Prisma/Postgres would reject the Int write → legacy 500.
            throw new OverflowException("gradeLevel is outside Int32 (int4) range");
        }

        // JS `|| null`: a 0 result is falsy → null. Otherwise the parsed int (incl. negatives).
        return value == 0 ? null : (int)value;
    }

    // String(x) as JS would produce it for the JSON body value kinds. Numbers use the raw token on the fast path
    // (plain integer/decimal tokens already equal JS String()); only exponential integral tokens (1e3) are
    // re-expanded to plain decimal so parseInt sees "1000" not "1e3", matching V8 for the reachable-ish range.
    private static string Stringify(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.String => el.GetString() ?? string.Empty,
        JsonValueKind.Number => NumberToParseString(el),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Null => "null",
        _ => el.GetRawText(),
    };

    private static string NumberToParseString(JsonElement el)
    {
        var raw = el.GetRawText();
        if (raw.IndexOf('e') < 0 && raw.IndexOf('E') < 0)
        {
            return raw; // plain token — equals JS String() for parseInt purposes ("11", "1.5", "0")
        }

        // Exponential token: expand to plain decimal when integral and below V8's 1e21 exponential threshold,
        // so String(1e3) → "1000". Non-integral or ≥1e21 keep the raw token (documented out-of-surface residual).
        if (el.TryGetDouble(out var d) && d == Math.Truncate(d) && Math.Abs(d) < 1e21)
        {
            return d.ToString("0", CultureInfo.InvariantCulture);
        }

        return raw;
    }

    // ECMAScript parseInt leading-integer scan (whitespace, sign, 0x-hex, radix digits) — mirrors
    // PcaExamPagination.JsParseInt but reports overflow instead of saturating (a saturated grade = silent corruption).
    private static (bool HasDigits, bool Overflow, long Value) ScanJsParseInt(string s)
    {
        var i = 0;
        var n = s.Length;
        while (i < n && char.IsWhiteSpace(s[i]))
        {
            i++;
        }

        long sign = 1;
        if (i < n && (s[i] == '+' || s[i] == '-'))
        {
            if (s[i] == '-')
            {
                sign = -1;
            }

            i++;
        }

        var radix = 10;
        if (i + 1 < n && s[i] == '0' && (s[i + 1] == 'x' || s[i + 1] == 'X'))
        {
            radix = 16;
            i += 2;
        }

        var start = i;
        long magnitude = 0;
        var tooBig = false;
        while (i < n)
        {
            var digit = DigitValue(s[i]);
            if (digit < 0 || digit >= radix)
            {
                break;
            }

            if (!tooBig)
            {
                magnitude = (magnitude * radix) + digit;
                if (magnitude > 4_000_000_000L) // safely past int4 max magnitude (2_147_483_648); stop accumulating
                {
                    tooBig = true;
                }
            }

            i++;
        }

        if (i == start)
        {
            return (false, false, 0); // no digits → NaN
        }

        if (tooBig)
        {
            return (true, true, 0);
        }

        var signed = sign * magnitude;
        var overflow = signed > int.MaxValue || signed < int.MinValue;
        return (true, overflow, signed);
    }

    private static int DigitValue(char c) => c switch
    {
        >= '0' and <= '9' => c - '0',
        >= 'a' and <= 'f' => c - 'a' + 10,
        >= 'A' and <= 'F' => c - 'A' + 10,
        _ => -1,
    };
}
