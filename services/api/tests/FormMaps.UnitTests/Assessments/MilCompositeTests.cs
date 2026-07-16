using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Golden tests for the ported TIMS 300-point weighted composite (api/src/lib/lia/scoring.ts:
/// weightedComposite / classifyBand / DOMAIN_WEIGHTS / BAND_TABLE). Pins the deliberate
/// band-boundary correctness measure: the composite band is classified on the EXACT (unrounded)
/// percent so a value just over a cut-off is not misclassified by display rounding.
/// </summary>
public class MilCompositeTests
{
    [Theory]
    // Boundary belongs to the LOWER band: <=20 Insuficiente, <=40 Bajo, <=60 Adecuado, <=80 Excede, <=100 Excepcional.
    [InlineData(0, "Insuficiente", "Insufficient")]
    [InlineData(20, "Insuficiente", "Insufficient")]
    [InlineData(20.01, "Bajo", "Low")]
    [InlineData(40, "Bajo", "Low")]
    [InlineData(40.01, "Adecuado", "Adequate")]
    [InlineData(60, "Adecuado", "Adequate")]
    [InlineData(60.01, "Excede", "Exceeds")]
    [InlineData(80, "Excede", "Exceeds")]
    [InlineData(80.01, "Excepcional", "Exceptional")]
    [InlineData(100, "Excepcional", "Exceptional")]
    [InlineData(150, "Excepcional", "Exceptional")]  // >100 defensive -> top band
    [InlineData(-5, "Insuficiente", "Insufficient")]
    public void ClassifyBand_matches_legacy_quintiles(double percent, string band, string labelEn)
    {
        var info = MilComposite.ClassifyBand(percent);
        Assert.Equal(band, info.Band);
        Assert.Equal(labelEn, info.LabelEn);
    }

    [Fact]
    public void Compute_all_zeros_is_insuficiente()
    {
        var result = MilComposite.Compute(Percents(0, 0, 0, 0, 0));
        Assert.Equal(0, result.Raw);
        Assert.Equal(0, result.Percent);
        Assert.Equal("Insuficiente", result.Band);
        Assert.Equal("#dc2626", result.Color);
    }

    [Fact]
    public void Compute_all_perfect_is_excepcional_raw_300()
    {
        var result = MilComposite.Compute(Percents(100, 100, 100, 100, 100));
        Assert.Equal(300, result.Raw);
        Assert.Equal(100, result.Percent);
        Assert.Equal("Excepcional", result.Band);
    }

    [Fact]
    public void PerDomain_is_in_DOMAIN_WEIGHTS_order_with_weights()
    {
        var result = MilComposite.Compute(Percents(10, 20, 30, 40, 50));
        // DOMAIN_WEIGHTS order: PatternRecognition(20), VisualRotation(100), NumericVelocity(60),
        // WorkingMemory(80), VerbalReasoning(40).
        Assert.Equal(
            new[] { "PatternRecognition", "VisualRotation", "NumericVelocity", "WorkingMemory", "VerbalReasoning" },
            result.PerDomain.Select(d => d.Type).ToArray());
        Assert.Equal(new[] { 20, 100, 60, 80, 40 }, result.PerDomain.Select(d => d.Weight).ToArray());
        // percent echoes the per-domain input (VisualRotation got 20 here).
        Assert.Equal(20, result.PerDomain[1].Percent);
    }

    [Fact]
    public void Compute_single_domain_raw_and_rounded_percent()
    {
        // Only VisualRotation (weight 100) = 63. raw = 63; exactPercent = 63/300*100 = 21 -> Bajo.
        var result = MilComposite.Compute(new Dictionary<string, double> { ["VisualRotation"] = 63 });
        Assert.Equal(63, result.Raw);
        Assert.Equal(21, result.Percent);
        Assert.Equal("Bajo", result.Band);
    }

    [Fact]
    public void Compute_classifies_on_unrounded_percent_not_display_rounded()
    {
        // VisualRotation = 61.2 -> raw 61.2 (rounds to 61); exactPercent = 20.4 -> percent rounds to 20,
        // but classifyBand(20.4) = Bajo. If it classified on the rounded 20 it would wrongly be Insuficiente.
        var result = MilComposite.Compute(new Dictionary<string, double> { ["VisualRotation"] = 61.2 });
        Assert.Equal(61, result.Raw);
        Assert.Equal(20, result.Percent);
        Assert.Equal("Bajo", result.Band);
    }

    private static Dictionary<string, double> Percents(
        double pattern, double visual, double numeric, double memory, double verbal) =>
        new()
        {
            ["PatternRecognition"] = pattern,
            ["VisualRotation"] = visual,
            ["NumericVelocity"] = numeric,
            ["WorkingMemory"] = memory,
            ["VerbalReasoning"] = verbal,
        };
}
