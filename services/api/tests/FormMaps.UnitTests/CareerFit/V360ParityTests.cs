using System.Reflection;
using System.Text.Json;
using FormMaps.Application.CareerFit;
using Xunit.Abstractions;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-007 / FM-CF-008 parity — the manifest's validation for both slices ("F04/F05 parity" and
/// "F06 parity"). The 40 items are not seeded (FM-CF-006 is blocked on TIMS) so there is no real 360
/// response anywhere; these cases are therefore driven by SYNTHETIC per-source scores and SYNTHETIC
/// variable aggregates, scored by the NORMATIVE
/// docs/careerfit/sources/formmaps_engine_reference.py and exported by
/// tools/careerfit/export_v360_fixture.py into CareerFit/Data/v360-parity-fixture.json. Every numeric
/// field within 1e-9, every label equal. If the C# and the fixture disagree, the C# is wrong.
///
/// These pin arithmetic that FM-CF-004 already ported (F01–F06 exist in CareerFitFormulas and were
/// parity-tested through evaluate_owner); what was never covered before is the 360 chain END TO END on
/// aggregates that actually carry a consensus and a confidence index — the parity fixture FM-CF-004
/// uses feeds every variable a bare {"score": x}, so consensus and confidence_index were null in every
/// one of its 840 comparisons and F03/F05 and F06's two weighted means never ran on a real value.
/// </summary>
public class V360ParityTests(ITestOutputHelper output)
{
    private const double Tolerance = 1e-9;

    private static readonly JsonElement Fixture = LoadFixture();

    private static JsonElement LoadFixture()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(".CareerFit.Data.v360-parity-fixture.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        return JsonDocument.Parse(stream).RootElement.Clone();
    }

    private static CareerFitRules Rules() =>
        CareerFitRulesJson.LoadEmbedded(Fixture.GetProperty("rules_version").GetString()!);

    private static double? OptDouble(JsonElement parent, string name) =>
        parent.GetProperty(name) is { ValueKind: JsonValueKind.Number } v ? v.GetDouble() : null;

    // The reference returns Confidence's string value; the port returns the enum member.
    private static string Label(Confidence confidence) => confidence switch
    {
        Confidence.High => "HIGH",
        Confidence.Medium => "MEDIUM",
        Confidence.Low => "LOW",
        _ => "NOT_DETERMINABLE",
    };

    private static void Near(double? expected, double? actual, string what)
    {
        if (expected is null || actual is null)
        {
            Assert.True(expected is null && actual is null, $"{what}: expected {expected?.ToString() ?? "null"}, got {actual?.ToString() ?? "null"}");
            return;
        }

        Assert.True(Math.Abs(expected.Value - actual.Value) <= Tolerance,
            $"{what}: expected {expected.Value:R}, got {actual.Value:R} (|Δ| {Math.Abs(expected.Value - actual.Value):R})");
    }

    [Fact]
    public void Fixture_pins_the_embedded_rule_sets_360_weights_and_thresholds()
    {
        var rules = Rules();
        Assert.Equal(Tolerance, Fixture.GetProperty("tolerance").GetDouble());

        foreach (var source in Fixture.GetProperty("source_weights").EnumerateObject())
        {
            Assert.Equal(source.Value.GetDouble(), rules.Weights.V360Sources[source.Name]);
        }

        var consensus = Fixture.GetProperty("consensus_thresholds");
        Assert.Equal(consensus.GetProperty("high_min").GetDouble(), rules.Thresholds.V360Consensus.HighMin);
        Assert.Equal(consensus.GetProperty("medium_min").GetDouble(), rules.Thresholds.V360Consensus.MediumMin);

        var confidence = Fixture.GetProperty("confidence_thresholds");
        Assert.Equal(confidence.GetProperty("consensus_weight").GetDouble(), rules.Thresholds.V360Confidence.ConsensusWeight);
        Assert.Equal(confidence.GetProperty("coverage_weight").GetDouble(), rules.Thresholds.V360Confidence.CoverageWeight);
        Assert.Equal(confidence.GetProperty("high_min").GetDouble(), rules.Thresholds.V360Confidence.HighMin);
        Assert.Equal(confidence.GetProperty("medium_min").GetDouble(), rules.Thresholds.V360Confidence.MediumMin);
    }

    [Fact]
    public void F01_normalize_likert_matches_the_reference_over_its_whole_domain()
    {
        foreach (var c in Fixture.GetProperty("likert_cases").EnumerateArray())
        {
            var response = c.GetProperty("response") is { ValueKind: JsonValueKind.Number } r ? r.GetInt32() : (int?)null;
            Near(OptDouble(c, "normalized"), CareerFitFormulas.NormalizeLikert(response), $"normalize_likert({response?.ToString() ?? "null"})");
        }
    }

    /// <summary>
    /// F02 score, F03 consensus, F04 coverage + valid_sources, classify_consensus and F05 confidence360,
    /// over the rule set's own source weights and thresholds — including the SELF-ONLY case V1 ships and
    /// the case where nobody answered.
    /// </summary>
    [Fact]
    public void F04_and_F05_match_the_reference_engine_for_every_source_case()
    {
        var rules = Rules();
        var weights = rules.Weights.V360Sources;
        var compared = 0;

        foreach (var c in Fixture.GetProperty("source_cases").EnumerateArray())
        {
            var name = c.GetProperty("name").GetString()!;
            // Source order is the rule set's declared order, exactly as the reference iterates its dict.
            var scores = weights.Keys
                .Select(s => new SourceScore(s, OptDouble(c.GetProperty("source_scores"), s)))
                .ToList();

            var integration = CareerFitFormulas.IntegrateSources(scores, weights);
            Near(OptDouble(c, "score"), integration.Score, $"{name}.score");
            Near(OptDouble(c, "consensus"), integration.Consensus, $"{name}.consensus");
            Near(c.GetProperty("coverage").GetDouble(), integration.Coverage, $"{name}.coverage");
            Assert.Equal(c.GetProperty("valid_sources").GetInt32(), integration.ValidSources);

            Assert.Equal(
                c.GetProperty("consensus_label").GetString(),
                CareerFitFormulas.ClassifyConsensus(integration.Consensus, rules.Thresholds.V360Consensus));

            var confidence = CareerFitFormulas.Confidence360(
                integration.Consensus, integration.Coverage, integration.ValidSources, rules.Thresholds.V360Confidence);
            Near(OptDouble(c, "confidence_index"), confidence.Index, $"{name}.confidence_index");
            Assert.Equal(c.GetProperty("confidence_label").GetString(), Label(confidence.Label));
            compared++;
        }

        Assert.Equal(9, compared);
        output.WriteLine($"F04/F05: {compared} source cases at <= {Tolerance:R}");
    }

    /// <summary>
    /// F06 over every scorable family's own v360_rules, for six synthetic aggregate maps: all variables,
    /// partial coverage, null scores / no consensus (the SELF-ONLY shape), the IND-excluded V1 map, one
    /// variable only, and empty. Asserts the score, the two relevance-weighted means, and every
    /// per-variable combined_weight — which is where FM-CF-008's "base_weight carried on the rule" is
    /// actually observable.
    /// </summary>
    [Fact]
    public void F06_matches_the_reference_engine_for_every_family_and_aggregate_set()
    {
        var rules = Rules();
        var families = rules.ScorableFamilies;
        Assert.Equal(14, families.Count);
        var comparisons = 0;
        var maxDeviation = 0.0;

        foreach (var set in Fixture.GetProperty("family_cases").EnumerateArray())
        {
            var setName = set.GetProperty("name").GetString()!;
            // The reference skips an aggregate whose score is None. V360Aggregate cannot HOLD a null score —
            // a stronger guarantee than the reference's — so the port expresses the same case by not
            // producing the aggregate at all, which CalculateCareerFit360's lookup miss handles
            // identically. Anything the fixture wrote as a null score is therefore absent here, and the two
            // must still agree.
            var aggregates = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);
            foreach (var a in set.GetProperty("aggregates").EnumerateObject())
            {
                if (OptDouble(a.Value, "score") is not double score)
                {
                    continue;
                }

                aggregates[a.Name] = new V360Aggregate(
                    score,
                    a.Value.TryGetProperty("consensus", out var cons) && cons.ValueKind == JsonValueKind.Number ? cons.GetDouble() : null,
                    a.Value.TryGetProperty("confidence_index", out var ci) && ci.ValueKind == JsonValueKind.Number ? ci.GetDouble() : null);
            }

            foreach (var family in families)
            {
                var expected = set.GetProperty("expected_by_family").GetProperty(family.FamilyId.ToString());
                var actual = CareerFitFormulas.CalculateCareerFit360(aggregates, family.V360Rules);
                var what = $"{setName}/family {family.FamilyId}";

                Near(expected.GetProperty("careerfit360").GetDouble(), actual.Score, $"{what}.careerfit360");
                Near(OptDouble(expected, "consensus"), actual.Consensus, $"{what}.consensus");
                Near(OptDouble(expected, "confidence_index"), actual.ConfidenceIndex, $"{what}.confidence_index");
                maxDeviation = Math.Max(maxDeviation, Math.Abs(expected.GetProperty("careerfit360").GetDouble() - actual.Score));

                var expectedVariables = expected.GetProperty("variables");
                Assert.Equal(expectedVariables.EnumerateObject().Count(), actual.Variables.Count);
                foreach (var v in expectedVariables.EnumerateObject())
                {
                    Assert.True(actual.Variables.ContainsKey(v.Name), $"{what}: expected variable {v.Name} in the evidence");
                    var got = actual.Variables[v.Name];
                    Near(v.Value.GetProperty("score").GetDouble(), got.Score, $"{what}.{v.Name}.score");
                    Near(v.Value.GetProperty("combined_weight").GetDouble(), got.CombinedWeight, $"{what}.{v.Name}.combined_weight");
                }

                comparisons++;
            }
        }

        Assert.Equal(6 * 14, comparisons);
        output.WriteLine($"F06: {comparisons} family x aggregate-set comparisons, max |Δ| {maxDeviation:R}");
    }

    /// <summary>
    /// FM-CF-008: the weight F06 applies is base_weight × relevance READ OFF THE RULE. Not the catalogue's
    /// rules.v360_variables[].base_weight, and not a schema gap filled in by the engine — the rule carries
    /// its own copy and that is the one that scores. Proven by perturbing the rule and watching the
    /// combined weight follow it while the catalogue entry stays put.
    /// </summary>
    [Fact]
    public void F06_takes_base_weight_from_the_rule_not_from_the_variable_catalogue()
    {
        var rules = Rules();
        var family = rules.Family(1);
        var rule = family.V360Rules.First(r => r.Code == "AN");
        var catalogue = rules.V360Variables.Single(v => v.Code == "AN");
        Assert.Equal(catalogue.BaseWeight, rule.BaseWeight); // they agree in 1.0.0-draft.1 ...

        var aggregates = new Dictionary<string, V360Aggregate> { ["AN"] = new(80.0) };
        var doubled = new V360Rule(rule.Code, rule.UseMode, rule.Relevance, rule.BaseWeight * 2);
        var scored = CareerFitFormulas.CalculateCareerFit360(aggregates, [doubled]);

        // ... and when they disagree, the RULE wins: the evidence weight is the rule's, doubled.
        Assert.Equal(doubled.BaseWeight * doubled.Relevance, scored.Variables["AN"].CombinedWeight);
        Assert.NotEqual(catalogue.BaseWeight * rule.Relevance, scored.Variables["AN"].CombinedWeight);
        // A single variable's weighted mean is its own score whatever the weight — the weight only ever
        // matters RELATIVE to the family's other variables, which is what makes relevance meaningful.
        Assert.Equal(80.0, scored.Score);
    }

    /// <summary>
    /// FM-CF-008: relevance is per family. The same variable, the same aggregate, a different family's
    /// relevance → a different combined weight. IND is relevance 3 in family 4 (Administración) and 2 in
    /// family 1 (Ingeniería) in 1.0.0-draft.1; that difference must survive into F06's evidence.
    /// </summary>
    [Fact]
    public void F06_relevance_is_per_family()
    {
        var rules = Rules();
        var ingenieria = rules.Family(1).V360Rules.Single(r => r.Code == "IND");
        var administracion = rules.Family(4).V360Rules.Single(r => r.Code == "IND");

        Assert.Equal(2.0, ingenieria.Relevance);
        Assert.Equal(3.0, administracion.Relevance);
        Assert.Equal(ingenieria.BaseWeight, administracion.BaseWeight);

        var aggregates = new Dictionary<string, V360Aggregate> { ["IND"] = new(50.0) };
        Assert.Equal(
            administracion.BaseWeight * 3.0,
            CareerFitFormulas.CalculateCareerFit360(aggregates, [administracion]).Variables["IND"].CombinedWeight);
        Assert.Equal(
            ingenieria.BaseWeight * 2.0,
            CareerFitFormulas.CalculateCareerFit360(aggregates, [ingenieria]).Variables["IND"].CombinedWeight);
    }
}
