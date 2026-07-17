using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Vocational integration parity (FM-DOTNET-028). Mirrors legacy vocationalIntegrationService.test.ts:
/// competence/MIL channel derivations, weight renormalization, the weighted composite, and the ordered
/// readiness gate (missing [360, pca, mil]).
/// </summary>
public class VocationalIntegrationTests
{
    private static readonly IntegrationConfig Config = new(
        InstrumentVersion: "v1",
        IntegrationWeights: new IntegrationWeights(ThreeSixty: 40, Pca: 30, Mil: 30),
        Bands: new ScoringBands(80, 60, 40));

    [Fact]
    public void CompetencesToScore_maps_mean_level_1to4_onto_0_100()
    {
        Assert.Equal(0, VocationalIntegration.CompetencesToScore([new("a", 1), new("b", 1)])!.Value, 9);
        Assert.Equal(100, VocationalIntegration.CompetencesToScore([new("a", 4)])!.Value, 9);
        Assert.Equal(50, VocationalIntegration.CompetencesToScore([new("a", 1), new("b", 4)])!.Value, 9);
        Assert.Null(VocationalIntegration.CompetencesToScore([]));
    }

    [Fact]
    public void MilToScore_averages_the_five_domains()
    {
        var mil = new MilDomains(MilReasoning: 80, MilDetection: 60, MilNumeric: 40, MilMemory: 20, MilOrientation: 0);
        Assert.Equal(40, VocationalIntegration.MilToScore(mil), 9);
    }

    [Fact]
    public void NormalizeIntegrationWeights_scales_to_fractions_summing_to_one()
    {
        var w = VocationalIntegration.NormalizeIntegrationWeights(new IntegrationWeights(40, 30, 30));
        Assert.Equal(0.4, w.ThreeSixty, 9);
        Assert.Equal(0.3, w.Pca, 9);
        Assert.Equal(0.3, w.Mil, 9);
    }

    [Fact]
    public void Integrate_weights_the_three_components()
    {
        // 0.4*80 + 0.3*60 + 0.3*50 = 65
        Assert.Equal(65, VocationalIntegration.Integrate(80, 60, 50, new IntegrationWeights(0.4, 0.3, 0.3)), 9);
    }

    [Fact]
    public void ComputeIntegratedResult_is_not_ready_with_ordered_missing_channels()
    {
        var one = VocationalIntegration.ComputeIntegratedResult(Config, new IntegrationInputs(80, null, 50));
        Assert.Equal(new[] { "pca" }, Assert.IsType<IntegrationNotReady>(one).Missing.ToArray());

        var all = VocationalIntegration.ComputeIntegratedResult(Config, new IntegrationInputs(null, null, null));
        Assert.Equal(new[] { "360", "pca", "mil" }, Assert.IsType<IntegrationNotReady>(all).Missing.ToArray());
    }

    [Fact]
    public void ComputeIntegratedResult_ready_with_all_three_present()
    {
        var outcome = VocationalIntegration.ComputeIntegratedResult(Config, new IntegrationInputs(80, 60, 50));

        var ready = Assert.IsType<IntegratedResultPayload>(outcome);
        Assert.Equal(65, ready.IntegratedComposite, 9);
        Assert.Equal("moderateHigh", ready.Band); // 65 >= 60
        Assert.Equal(80, ready.ThreeSixtyScore, 9);
        Assert.Equal(60, ready.PcaScore, 9);
        Assert.Equal(50, ready.MilScore, 9);
        Assert.Equal(new IntegrationWeights(0.4, 0.3, 0.3), ready.WeightsApplied);
    }
}
