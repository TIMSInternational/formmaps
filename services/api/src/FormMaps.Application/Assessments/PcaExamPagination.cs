namespace FormMaps.Application.Assessments;

/// <summary>
/// Pure port of the legacy /all-results pagination clamp (assessment.ts):
/// <c>page = Math.max(1, parseInt(qs(page)) || 1)</c>,
/// <c>limit = Math.min(100, Math.max(1, parseInt(qs(limit)) || 20))</c>,
/// <c>skip = (page - 1) * limit</c>. Reproduces JS <c>parseInt</c> (leading-integer scan, NOT
/// int.TryParse) and JS <c>||</c> falsiness (NaN AND 0 fall through to the default).
/// </summary>
public sealed record PcaExamPagination(int Page, int Limit, long Skip)
{
    public static PcaExamPagination Resolve(string? pageRaw, string? limitRaw)
    {
        var page = Math.Max(1, FalsyOr(JsParseInt(pageRaw), 1));
        var limit = Math.Min(100, Math.Max(1, FalsyOr(JsParseInt(limitRaw), 20)));
        // 64-bit multiply: page can saturate to int.MaxValue, so an int32 (page-1)*limit could
        // overflow and wrap to a small OFFSET, silently serving wrong rows. OFFSET is bigint.
        return new PcaExamPagination(page, limit, (long)(page - 1) * limit);
    }

    // JS `x || default`: default when x is NaN (null here) OR 0; otherwise x (incl. negatives).
    private static int FalsyOr(int? parsed, int fallback) =>
        parsed is null or 0 ? fallback : parsed.Value;

    /// <summary>
    /// JS <c>parseInt(s, 10)</c>: skip leading whitespace, optional sign, consume decimal digits until
    /// a non-digit; no digits =&gt; NaN (null). Saturates at int range instead of overflowing.
    /// </summary>
    public static int? JsParseInt(string? s)
    {
        if (s is null)
        {
            return null;
        }

        var i = 0;
        var n = s.Length;
        while (i < n && char.IsWhiteSpace(s[i]))
        {
            i++;
        }

        var sign = 1;
        if (i < n && (s[i] == '+' || s[i] == '-'))
        {
            if (s[i] == '-')
            {
                sign = -1;
            }

            i++;
        }

        var start = i;
        long value = 0;
        var saturated = false;
        while (i < n && s[i] >= '0' && s[i] <= '9')
        {
            if (!saturated)
            {
                value = (value * 10) + (s[i] - '0');
                if (value > int.MaxValue)
                {
                    value = int.MaxValue;
                    saturated = true;
                }
            }

            i++;
        }

        if (i == start)
        {
            return null; // no digits -> NaN
        }

        return (int)(sign * value);
    }
}
