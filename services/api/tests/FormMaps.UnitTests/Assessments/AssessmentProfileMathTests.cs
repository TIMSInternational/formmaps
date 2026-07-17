using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the JS-parity primitives that make the ported assembler byte-faithful to Node: the
/// <c>Number.prototype.toFixed(2)</c> rounding (GPA + 360 category averages) and the
/// <c>sha256(JSON.stringify({mil,disc,comp,cats})).slice(0,32)</c> fingerprint. The fingerprint
/// gold hexes are produced by the live Node implementation — any drift in key order, number
/// formatting, or UTF-8 handling flips the hash, red-if-regressed.
/// </summary>
public class AssessmentProfileMathTests
{
    [Theory]
    // Domain-representative averages (rating*weight / count, GPA) + adversarial float-tail / JS-gotcha cases.
    [InlineData(15.1, 4, 3.77)]     // double 3.77499… -> 3.77 (NOT 3.78)
    [InlineData(11.3, 3, 3.77)]     // 3.7666…
    [InlineData(7, 2, 3.5)]         // (4+3)/2
    [InlineData(11, 3, 3.67)]       // 3.6666…
    [InlineData(1.005, 1, 1)]       // famous JS gotcha: double 1.00499… -> 1.00
    [InlineData(1.015, 1, 1.01)]
    [InlineData(1.025, 1, 1.02)]
    [InlineData(2.5, 1, 2.5)]
    [InlineData(2.675, 1, 2.67)]    // double 2.67499… -> 2.67
    [InlineData(2.55, 1, 2.55)]
    [InlineData(4, 1, 4)]
    [InlineData(0, 1, 0)]
    [InlineData(100, 3, 33.33)]
    [InlineData(2000, 7, 285.71)]
    public void ToFixed2_matches_js_toFixed(double numerator, double denominator, double expected)
    {
        Assert.Equal(expected, JsNumber.ToFixed2(numerator / denominator));
    }

    [Fact]
    public void ToFixed2_handles_binary_float_error()
    {
        // (0.1 + 0.2).toFixed(2) === "0.30" -> 0.3 (the input is actually 0.30000000000000004).
        Assert.Equal(0.3, JsNumber.ToFixed2(0.1 + 0.2));
    }

    [Theory]
    [InlineData(4.0, "4")]          // integral -> no decimal point
    [InlineData(3.77, "3.77")]
    [InlineData(3.1, "3.1")]        // trailing zero dropped
    [InlineData(0.0, "0")]
    [InlineData(285.71, "285.71")]
    public void ToJsonNumber_matches_js_number_formatting(double value, string expected)
    {
        Assert.Equal(expected, JsNumber.ToJsonNumber(value));
    }

    [Fact]
    public void Fingerprint_matches_node_gold_for_full_profile()
    {
        var mil = Mil(80, 60, 50, 50, 40);
        var disc = new DiscMatrix(
            new DiscGraph(89, 18, 18, 21),
            new DiscGraph(87, 87, 26, 25),
            new DiscGraph(90, 60, 25, 25),
            new DiscGraph(87, 87, 26, 25));
        var comp = new List<CompetenceEntry> { new("COMUNICACIÓN", 1), new("MOTIVACIÓN", 4) };
        var cats = new List<KeyValuePair<string, double>>
        {
            new("Arts", 3.77),
            new("Leadership", 3.1),
            new("Science", 4),
        };

        // Node: sha256(JSON.stringify({mil,disc,comp,cats})).slice(0,32)
        Assert.Equal("3317f50d7c6008d460dd7a2cd13d5e19", ProfileFingerprint.Compute(mil, disc, comp, cats));
    }

    [Fact]
    public void Fingerprint_matches_node_gold_for_null_disc_null_comp_empty_cats()
    {
        var mil = Mil(80, 60, 50, 50, 40);
        Assert.Equal(
            "d78007d12116a92c72bb13623bc2656c",
            ProfileFingerprint.Compute(mil, disc: null, competences: null, categories: []));
    }

    [Fact]
    public void Fingerprint_matches_node_gold_for_non_ascii_category_keys()
    {
        var mil = Mil(80, 60, 50, 50, 40);
        var cats = new List<KeyValuePair<string, double>> { new("Comunicación", 4.5), new("Ciencia", 3) };
        Assert.Equal(
            "4fbe3c6eea4465e1603dce44473e727d",
            ProfileFingerprint.Compute(mil, disc: null, competences: null, categories: cats));
    }

    private static List<KeyValuePair<string, int>> Mil(int r, int d, int n, int m, int o) =>
    [
        new("milReasoning", r),
        new("milDetection", d),
        new("milNumeric", n),
        new("milMemory", m),
        new("milOrientation", o),
    ];
}
