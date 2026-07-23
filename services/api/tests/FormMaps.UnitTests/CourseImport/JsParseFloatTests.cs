using FormMaps.Application.CourseImport;

namespace FormMaps.UnitTests.CourseImport;

/// <summary>
/// Pure parity for <see cref="JsParseFloat.Parse"/> (ECMAScript parseFloat, as legacy calls
/// <c>parseFloat(row.credits)</c>). RED-IF-REGRESSED gold cases: longest valid prefix, trailing-garbage truncation,
/// exponent, leading whitespace/sign, bare '.'/no-digits → NaN, Infinity, and the ECMAScript leading-whitespace set.
/// </summary>
public class JsParseFloatTests
{
    [Theory]
    [InlineData("3.5", 3.5)]
    [InlineData("3.5xyz", 3.5)]   // stops at first invalid char
    [InlineData("12abc", 12)]     // trailing garbage truncated
    [InlineData("1e2", 100)]      // exponent
    [InlineData("1e+2", 100)]
    [InlineData("0.5", 0.5)]
    [InlineData(".5", 0.5)]        // no integer part
    [InlineData("+1.5", 1.5)]      // leading plus
    [InlineData("-2.25", -2.25)]   // leading minus
    [InlineData("  3.5", 3.5)]     // leading whitespace trimmed
    [InlineData("3.5 ", 3.5)]      // trailing whitespace stops parse
    [InlineData("100", 100)]
    [InlineData("0", 0)]
    public void Parses_valid_numeric_prefix(string input, double expected)
    {
        Assert.Equal(expected, JsParseFloat.Parse(input));
    }

    [Theory]
    [InlineData("abc")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(".")]      // no digits either side of the point
    [InlineData("e5")]     // exponent with no mantissa
    [InlineData("+")]      // sign only
    [InlineData(null)]
    public void No_valid_prefix_is_nan(string? input)
    {
        Assert.True(double.IsNaN(JsParseFloat.Parse(input)));
    }

    [Fact]
    public void Parses_infinity_with_sign()
    {
        Assert.True(double.IsPositiveInfinity(JsParseFloat.Parse("Infinity")));
        Assert.True(double.IsNegativeInfinity(JsParseFloat.Parse("-Infinity")));
        Assert.True(double.IsPositiveInfinity(JsParseFloat.Parse("+Infinity")));
    }

    [Fact]
    public void Exponent_without_digits_backtracks_to_mantissa()
    {
        Assert.Equal(1, JsParseFloat.Parse("1e"));   // 'e' with no following digit → parses "1"
        Assert.Equal(1, JsParseFloat.Parse("1e+"));  // sign but no digit → parses "1"
    }

    // Gate fold (both reviewers): the leading-whitespace skip uses the EXACT ECMAScript StrWhiteSpace set, not
    // char.IsWhiteSpace. The two differ on exactly two code points — JS strips U+FEFF (ZWNBSP) and keeps U+0085 (NEL).
    // (Built via (char) so the source stays pure ASCII — a literal U+0085 is a C# source line terminator.)
    [Fact]
    public void Leading_whitespace_uses_ecmascript_set()
    {
        var bom = (char)0xFEFF;
        var nel = (char)0x0085;
        Assert.Equal(3.5, JsParseFloat.Parse(bom + "3.5"));         // U+FEFF is JS whitespace → stripped → 3.5
        Assert.True(double.IsNaN(JsParseFloat.Parse(nel + "3.5"))); // U+0085 is NOT JS whitespace → not stripped → NaN
    }
}
