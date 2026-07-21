using System.Text.Json;
using FormMaps.Application.SchoolUsers;

namespace FormMaps.UnitTests.SchoolUsers;

/// <summary>
/// Pins the legacy grade-level coercion <c>parseInt(gradeLevel) || null</c> (schoolService.ts:144), where the
/// argument is the RAW req.body.gradeLevel JS value. Critical parity edges: <c>"0"</c> and number <c>0</c> both fold
/// to null (0 is JS-falsy); leading-integer scan ("11abc"→11); non-numeric strings, booleans, JSON null,
/// object/array → null. This is the DB write value; the response echoes the raw token (endpoint-level, not here).
/// </summary>
public class GradeLevelParserTests
{
    [Theory]
    [InlineData("\"11\"", 11)]        // string "11" → 11
    [InlineData("\"11abc\"", 11)]     // leading-integer scan → 11
    [InlineData("\"0\"", null)]       // "0" → 0 → falsy → NULL
    [InlineData("\"\"", null)]        // "" → NaN → null
    [InlineData("\" 9 \"", 9)]        // leading whitespace skipped
    [InlineData("\"-5\"", -5)]        // negative preserved (not folded — only 0 is falsy)
    [InlineData("11", 11)]            // number 11 → "11" → 11
    [InlineData("0", null)]           // number 0 → "0" → 0 → NULL
    [InlineData("12.9", 12)]          // number token stops at '.'
    [InlineData("true", null)]        // boolean → "true" → NaN → null
    [InlineData("false", null)]       // boolean → "false" → NaN → null
    [InlineData("null", null)]        // JSON null → "null" → NaN → null
    [InlineData("{}", null)]          // object → non-numeric → null
    [InlineData("[]", null)]          // array → non-numeric → null
    [InlineData("\"abc\"", null)]     // no digits → null
    [InlineData("\"-2147483648\"", -2147483648)] // int4 MIN is valid (not overflow) — stored, not folded
    [InlineData("\"0x10\"", 16)]      // JS parseInt hex auto-detect ("0x" → radix 16) → 16
    [InlineData("1000", 1000)]        // plain number token
    [InlineData("1e3", 1000)]         // number 1e3 → JS String(1000)="1000" → 1000 (NOT the raw "1e3"→1)
    [InlineData("\"1e3\"", 1)]        // STRING "1e3" → parseInt scans "1", stops at 'e' → 1
    public void ParseDbValue_matches_legacy(string json, int? expected)
    {
        var element = JsonDocument.Parse(json).RootElement;
        Assert.Equal(expected, GradeLevelParser.ParseDbValue(element));
    }

    [Theory]
    [InlineData("\"2147483648\"")]                  // int4 MAX + 1 → Postgres int4 write fails → legacy 500
    [InlineData("2147483648")]                       // same, as a JSON number
    [InlineData("\"99999999999999999999999\"")]      // absurdly large leading integer → overflow → 500
    [InlineData("\"-2147483649\"")]                  // int4 MIN - 1 → overflow → 500
    public void ParseDbValue_overflows_int4_throws(string json)
    {
        var element = JsonDocument.Parse(json).RootElement;
        // Legacy: parseInt yields a JS number Prisma cannot store in int4 → Postgres error → route 500. We throw
        // (→ global handler 500) rather than silently clamp/saturate to a WRONG grade.
        Assert.Throws<OverflowException>(() => GradeLevelParser.ParseDbValue(element));
    }
}
