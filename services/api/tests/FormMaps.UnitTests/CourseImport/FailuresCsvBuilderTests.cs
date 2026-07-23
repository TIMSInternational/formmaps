using System.Text.Json;
using FormMaps.Application.CourseImport;

namespace FormMaps.UnitTests.CourseImport;

/// <summary>
/// Pure parity for <see cref="FailuresCsvBuilder"/> (FM-DOTNET-060 — getImportFailuresCsv). The load-bearing case is
/// <see cref="FailuresCsvBuilder.JsStringify"/> reproducing JS <c>JSON.stringify(rawRow)</c> — pinned against Node gold
/// (captured via <c>JSON.stringify</c> in node): compact, object keys in element order, JS string escaping (only " \
/// and control chars via \b \f \n \r \t / \u00XX are escaped; &lt; &gt; &amp; + and non-ASCII stay literal). Plus
/// csvSafe (formula-injection guard) and the DataLine csvSafe→quote-doubling composition.
/// </summary>
public class FailuresCsvBuilderTests
{
    // Each string is EXACTLY what Node's JSON.stringify produces (canonical compact form); JsStringify(Parse(x)) == x.
    [Theory]
    [InlineData("{\"code\":\"MATH1\",\"name\":\"Algebra I\"}")]
    [InlineData("{\"a\":\"x\",\"nested\":{\"b\":\"y\",\"arr\":[\"1\",\"2\"]}}")]
    [InlineData("{\"q\":\"has \\\"quotes\\\" and \\\\ backslash\"}")]
    [InlineData("{\"tab\":\"a\\tb\",\"nl\":\"c\\nd\",\"ret\":\"e\\rf\"}")] // \t \n \r short forms
    [InlineData("{\"sym\":\"<a>&+b\"}")]                                  // JS does NOT escape < > & +
    [InlineData("{\"uni\":\"café ñ 日本\"}")]                              // non-ASCII stays literal
    [InlineData("{}")]
    [InlineData("{\"empty\":\"\"}")]
    [InlineData("{\"n\":3.5,\"i\":10}")]                                  // numbers: shortest round-trip (unreachable via CSV)
    public void JsStringify_matches_node_json_stringify(string canonical)
    {
        using var doc = JsonDocument.Parse(canonical);
        Assert.Equal(canonical, FailuresCsvBuilder.JsStringify(doc.RootElement));
    }

    [Theory]
    [InlineData("=SUM(A1)", "'=SUM(A1)")] // leading = → prefixed '
    [InlineData("+1", "'+1")]
    [InlineData("-1", "'-1")]
    [InlineData("@x", "'@x")]
    [InlineData("\tx", "'\tx")]
    [InlineData("\rx", "'\rx")]
    [InlineData("safe", "safe")]          // no dangerous leading char → unchanged
    [InlineData(null, "")]                // null → ""
    public void CsvSafe_prefixes_formula_leaders(string? input, string expected)
    {
        Assert.Equal(expected, FailuresCsvBuilder.CsvSafe(input));
    }

    [Fact]
    public void DataLine_csvsafe_then_quote_doubles()
    {
        using var raw = JsonDocument.Parse("{\"code\":\"A\\\"B\"}"); // rawRow value contains a quote
        var line = FailuresCsvBuilder.DataLine(3, ["error \"one\"", "two"], raw.RootElement);

        // errors join "; " → csvSafe (no leader) → quote-double; rawRow JSON.stringify → quote-double; both CSV-quoted.
        Assert.Equal("3,\"error \"\"one\"\"; two\",\"{\"\"code\"\":\"\"A\\\"\"B\"\"}\"", line);
    }
}
