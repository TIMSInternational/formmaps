using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the legacy /all-results pagination clamp incl. JS parseInt + `||` falsiness so the .NET
/// query parsing cannot silently diverge from Express (parseInt("5abc")=5, 0/NaN -> default, etc.).
/// </summary>
public class PcaExamPaginationTests
{
    [Theory]
    [InlineData(null, null)]      // missing -> NaN
    [InlineData("", null)]        // empty -> NaN
    [InlineData("abc", null)]     // no digits -> NaN
    [InlineData("0", 0)]
    [InlineData("3", 3)]
    [InlineData("3abc", 3)]       // leading integer scan
    [InlineData("2.9", 2)]        // stops at '.'
    [InlineData(" 7 ", 7)]        // leading whitespace skipped
    [InlineData("-5", -5)]
    [InlineData("+8", 8)]
    public void JsParseInt_matches_js(string? input, int? expected)
    {
        Assert.Equal(expected, PcaExamPagination.JsParseInt(input));
    }

    [Theory]
    // pageRaw, limitRaw -> page, limit, skip
    [InlineData(null, null, 1, 20, 0)]      // defaults
    [InlineData("1", "20", 1, 20, 0)]
    [InlineData("3", "50", 3, 50, 100)]     // skip = (3-1)*50
    [InlineData("0", "0", 1, 20, 0)]        // 0 is falsy -> defaults
    [InlineData("abc", "abc", 1, 20, 0)]    // NaN -> defaults
    [InlineData("-5", "-5", 1, 1, 0)]       // page clamps to >=1; limit -5 truthy -> max(1,-5)=1
    [InlineData("2", "150", 2, 100, 100)]   // limit capped at 100; skip = (2-1)*100
    [InlineData("2", "2.9", 2, 2, 2)]       // limit parseInt("2.9")=2
    public void Resolve_matches_legacy_clamp(string? pageRaw, string? limitRaw, int page, int limit, int skip)
    {
        var p = PcaExamPagination.Resolve(pageRaw, limitRaw);
        Assert.Equal(page, p.Page);
        Assert.Equal(limit, p.Limit);
        Assert.Equal(skip, p.Skip);
    }

    [Fact]
    public void Skip_uses_64bit_multiply_no_int_overflow()
    {
        // page*limit that would overflow int32 (page-1)*limit and wrap to a small OFFSET.
        var p = PcaExamPagination.Resolve("67108865", "64"); // (67108865-1)*64 = 2^32
        Assert.Equal(67108865, p.Page);
        Assert.Equal(64, p.Limit);
        Assert.Equal(4294967296L, p.Skip); // exact 64-bit product, not a wrapped 0
    }
}
