using System.Text.Json;
using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-005 defect 1: the platform's canonical DISC is graph 2 (DiscMatrix.Primary = Under Pressure)
/// while legacy /careers/score — the FM-CF-013 shadow target — is fed graph 1 (Work Adaptation). The
/// three graphs below are deliberately distinct on every axis so any wrong pick is visible.
/// </summary>
public class DiscAdapterTests
{
    // Graph 1 = Work Adaptation, graph 2 = Under Pressure, graph 3 = Natural / self-image.
    private const string ThreeGraphs = """
        {"PcaD1":10,"PcaI1":20,"PcaS1":30,"PcaC1":40,
         "PcaD2":50,"PcaI2":60,"PcaS2":70,"PcaC2":80,
         "PcaD3":15,"PcaI3":25,"PcaS3":35,"PcaC3":45}
        """;

    private static JsonElement J(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Defect1_default_graph_is_WorkAdaptation_graph1_not_the_platforms_Primary_graph2()
    {
        var matrix = PcaNormalization.NormalizeDisc(J(ThreeGraphs))!;
        // The platform's canonical Primary IS graph 2 — a naive adapter that reads matrix.Primary
        // (or DiscMatrix.UnderPressure) scores a different profile from the one legacy scored.
        Assert.Equal(matrix.UnderPressure, matrix.Primary);

        var result = DiscAdapter.Adapt(matrix);

        Assert.Equal(DiscGraphChoice.WorkAdaptation, result.Graph);
        Assert.Equal(DiscGraphChoice.WorkAdaptation, DiscAdapter.DefaultGraph);
        Assert.Equal(new PcaInput(10, 20, 30, 40), result.Pca);
        Assert.NotEqual(new PcaInput(matrix.Primary.D, matrix.Primary.I, matrix.Primary.S, matrix.Primary.C), result.Pca);
    }

    [Fact]
    public void Graph_is_an_explicit_parameter_and_each_choice_selects_its_own_graph()
    {
        var raw = J(ThreeGraphs);

        Assert.Equal(new PcaInput(10, 20, 30, 40), DiscAdapter.Adapt(raw, DiscGraphChoice.WorkAdaptation).Pca);
        Assert.Equal(new PcaInput(50, 60, 70, 80), DiscAdapter.Adapt(raw, DiscGraphChoice.UnderPressure).Pca);
        Assert.Equal(new PcaInput(15, 25, 35, 45), DiscAdapter.Adapt(raw, DiscGraphChoice.Natural).Pca);

        // The enum values ARE the TIMS graph indices (Pca{D,I,S,C}{N}).
        Assert.Equal(1, (int)DiscGraphChoice.WorkAdaptation);
        Assert.Equal(2, (int)DiscGraphChoice.UnderPressure);
        Assert.Equal(3, (int)DiscGraphChoice.Natural);
    }

    [Fact]
    public void The_graph_used_is_recorded_in_the_quality_warnings()
    {
        var result = DiscAdapter.Adapt(J(ThreeGraphs), DiscGraphChoice.UnderPressure);

        Assert.Equal(DiscGraphChoice.UnderPressure, result.Graph);
        var note = Assert.Single(result.Warnings, w => w.Code == InputWarningCodes.DiscGraphSelected);
        Assert.Equal(InputInstruments.Pca, note.Instrument);
        Assert.Contains("graph 2", note.Message);
        Assert.Contains("UnderPressure", note.Message);
    }

    [Fact]
    public void An_uninitialised_zero_choice_is_rejected_not_silently_mapped()
    {
        var ex = Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(J(ThreeGraphs), (DiscGraphChoice)0));
        Assert.Equal(InputWarningCodes.DiscGraphChoiceInvalid, ex.Code);
        Assert.Equal(InputInstruments.Pca, ex.Instrument);
    }

    [Fact]
    public void camelCase_keys_are_accepted_like_PcaNormalization_does()
    {
        var raw = J("""{"pcaD1":"11","pcaI1":22,"pcaS1":33.5,"pcaC1":44}""");

        Assert.Equal(new PcaInput(11, 22, 33.5, 44), DiscAdapter.Adapt(raw).Pca);
    }

    [Fact]
    public void A_chosen_graph_absent_from_the_document_is_fail_closed_not_a_zero_profile()
    {
        // Only graph 2 present: the matrix would hand graph 1 back as zeros.
        var onlyGraph2 = J("""{"PcaD2":50,"PcaI2":60,"PcaS2":70,"PcaC2":80}""");
        var matrix = PcaNormalization.NormalizeDisc(onlyGraph2)!;
        Assert.Equal(new DiscGraph(0, 0, 0, 0), matrix.WorkAdaptation);

        var ex = Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(onlyGraph2, DiscGraphChoice.WorkAdaptation));
        Assert.Equal(InputWarningCodes.DiscGraphAbsent, ex.Code);

        // The graph that IS present adapts normally.
        Assert.Equal(new PcaInput(50, 60, 70, 80), DiscAdapter.Adapt(onlyGraph2, DiscGraphChoice.UnderPressure).Pca);
    }

    [Fact]
    public void No_DISC_at_all_is_fail_closed()
    {
        Assert.Equal(InputWarningCodes.DiscMissing, Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(J("null"))).Code);
        Assert.Equal(InputWarningCodes.DiscMissing, Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(J("{}"))).Code);
        Assert.Equal(InputWarningCodes.DiscMissing, Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(J("""{"PcaD1":null}"""))).Code);
    }

    [Fact]
    public void Factors_outside_0_100_are_clamped_with_one_warning_each_and_NaN_throws()
    {
        var matrix = new DiscMatrix(
            WorkAdaptation: new DiscGraph(-5, 100.5, 50, 0),
            UnderPressure: new DiscGraph(0, 0, 0, 0),
            SelfImage: new DiscGraph(0, 0, 0, 0),
            Primary: new DiscGraph(0, 0, 0, 0));

        var result = DiscAdapter.Adapt(matrix);

        Assert.Equal(new PcaInput(0, 100, 50, 0), result.Pca);
        var clamps = result.Warnings.Where(w => w.Code == InputWarningCodes.DiscFactorClamped).ToList();
        Assert.Equal(2, clamps.Count);
        Assert.Contains(clamps, w => w.Message.Contains("factor D was -5"));
        Assert.Contains(clamps, w => w.Message.Contains("factor I was 100.5"));
        // ValidateInputs accepts what the adapter produced.
        CareerFitFormulas.RequireRange("PCA.D", result.Pca.D, 0, 100);

        var nan = matrix with { WorkAdaptation = new DiscGraph(double.NaN, 1, 2, 3) };
        Assert.Equal(InputWarningCodes.DiscFactorNotANumber, Assert.Throws<CareerFitInputException>(() => DiscAdapter.Adapt(nan)).Code);
    }
}
