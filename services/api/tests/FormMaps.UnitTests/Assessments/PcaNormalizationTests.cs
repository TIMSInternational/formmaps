using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Pins the PCA jsonb normalizers (legacy normalizeDisc / graphAt / normalizeCompetences): the three
/// TIMS DISC graphs with primary = graph 2 (Under Pressure), PascalCase/camelCase key fallback, numeric
/// string coercion, and the null/absent degradations.
/// </summary>
public class PcaNormalizationTests
{
    private static JsonElement J(string json) => JsonDocument.Parse(json).RootElement;

    [Fact]
    public void NormalizeDisc_maps_three_graphs_with_primary_under_pressure()
    {
        var disc = J("""
            {"PcaD1":89,"PcaI1":18,"PcaS1":18,"PcaC1":21,
             "PcaD2":87,"PcaI2":87,"PcaS2":26,"PcaC2":25,
             "PcaD3":90,"PcaI3":60,"PcaS3":25,"PcaC3":25}
            """);

        var result = PcaNormalization.NormalizeDisc(disc);

        Assert.NotNull(result);
        Assert.Equal(new DiscGraph(89, 18, 18, 21), result!.WorkAdaptation);
        Assert.Equal(new DiscGraph(87, 87, 26, 25), result.UnderPressure);
        Assert.Equal(new DiscGraph(90, 60, 25, 25), result.SelfImage);
        Assert.Equal(new DiscGraph(87, 87, 26, 25), result.Primary); // = graph 2
    }

    [Fact]
    public void NormalizeDisc_accepts_camelCase_keys_and_numeric_strings()
    {
        var disc = J("""
            {"pcaD1":"1","pcaI1":2,"pcaS1":3,"pcaC1":4,
             "pcaD2":5,"pcaI2":6,"pcaS2":7,"pcaC2":8,
             "pcaD3":9,"pcaI3":10,"pcaS3":11,"pcaC3":12}
            """);

        var result = PcaNormalization.NormalizeDisc(disc);

        Assert.NotNull(result);
        Assert.Equal(new DiscGraph(1, 2, 3, 4), result!.WorkAdaptation); // "1" coerced
        Assert.Equal(new DiscGraph(5, 6, 7, 8), result.Primary);
    }

    [Fact]
    public void NormalizeDisc_is_null_when_no_graphs_present()
    {
        Assert.Null(PcaNormalization.NormalizeDisc(J("""{"unrelated":1}""")));
        Assert.Null(PcaNormalization.NormalizeDisc(J("null")));
    }

    [Fact]
    public void NormalizeDisc_zero_fills_a_missing_graph_but_keeps_present_ones()
    {
        // Only graph 1 present -> underPressure/selfImage zero-filled; primary falls back to graph 1.
        var disc = J("""{"PcaD1":10,"PcaI1":20,"PcaS1":30,"PcaC1":40}""");

        var result = PcaNormalization.NormalizeDisc(disc);

        Assert.NotNull(result);
        Assert.Equal(new DiscGraph(10, 20, 30, 40), result!.WorkAdaptation);
        Assert.Equal(new DiscGraph(0, 0, 0, 0), result.UnderPressure);
        Assert.Equal(new DiscGraph(10, 20, 30, 40), result.Primary); // core = underPressure ?? workAdaptation
    }

    [Fact]
    public void NormalizeCompetences_extracts_name_and_level()
    {
        var comp = J("""{"PcaCmps":[{"CmpNom":" COMUNICACIÓN ","Level":1},{"CmpNom":"MOTIVACIÓN","Level":4}]}""");

        var result = PcaNormalization.NormalizeCompetences(comp);

        Assert.NotNull(result);
        Assert.Equal(2, result!.Count);
        Assert.Equal(new CompetenceEntry("COMUNICACIÓN", 1), result[0]); // trimmed
        Assert.Equal(new CompetenceEntry("MOTIVACIÓN", 4), result[1]);
    }

    [Fact]
    public void NormalizeCompetences_drops_empty_name_and_keeps_numeric_level()
    {
        // Legacy `name ? ... : null`: an empty-string name is dropped; level stays a number.
        var comp = J("""{"PcaCmps":[{"CmpNom":"","Level":3},{"CmpNom":"LIDERAZGO","Level":2}]}""");

        var result = PcaNormalization.NormalizeCompetences(comp);

        Assert.NotNull(result);
        Assert.Equal(new CompetenceEntry("LIDERAZGO", 2), Assert.Single(result!));
    }

    [Fact]
    public void NormalizeCompetences_is_null_when_empty_or_absent()
    {
        Assert.Null(PcaNormalization.NormalizeCompetences(J("""{"PcaCmps":[]}""")));
        Assert.Null(PcaNormalization.NormalizeCompetences(J("""{"other":1}""")));
        Assert.Null(PcaNormalization.NormalizeCompetences(J("null")));
    }
}
