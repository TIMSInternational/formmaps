using System.Text.Json;
using FormMaps.Application.CareerFit;

namespace FormMaps.UnitTests.CareerFit;

/// <summary>
/// FM-CF-004 boundary behaviour the parity fixture rarely or never hits (the generator draws competency
/// levels 1–4 and MIL percentiles near 50): gate transitions on their exact cut points, the NEUTRAL
/// midpoint, OPEN factors and routes, the 360 confidence downgrade, the convergence ladder, per-instrument
/// thresholds, the throwing paths, and ValidateInputs' messages. Every expected number below was produced
/// by running docs/careerfit/sources/formmaps_engine_reference.py on the same inputs, not by hand.
/// </summary>
public class CareerFitFormulasBoundaryTests
{
    // The reference's hard-coded role weights and the spec's bands/thresholds, as the rule set carries them.
    private static readonly IReadOnlyDictionary<string, double> CompetencyRoleWeights =
        new Dictionary<string, double>(StringComparer.Ordinal) { ["CRITICAL"] = 3.0, ["IMPORTANT"] = 2.0, ["COMPLEMENTARY"] = 0.0 };

    private static readonly IReadOnlyDictionary<string, double> MilRoleWeights =
        new Dictionary<string, double>(StringComparer.Ordinal) { ["CRITICAL"] = 3.0, ["IMPORTANT"] = 2.0, ["COMPLEMENTARY"] = 1.0, ["NOT_USED"] = 0.0 };

    private static readonly IReadOnlyList<MilBandRule> Bands =
    [
        new("INSUFFICIENT", 1, 17),
        new("LOW", 18, 37),
        new("ADEQUATE", 38, 56),
        new("EXCEEDS", 57, 81),
        new("EXCEPTIONAL", 82, 99),
    ];

    private static readonly ConvergenceThresholds SpecPair = new(70.0, 55.0, null);
    private static readonly V360ConsensusThresholds ConsensusThresholds = new(70.0, 40.0);
    private static readonly V360ConfidenceThresholds ConfidenceThresholds = new(0.7, 0.3, 75.0, 55.0);

    private static MilRules Mil(string dc = "CRITICAL", double? dcWeight = 3) => new(
    [
        new MilSubtestRule("DC", dc, dcWeight, null, null, null),
        new MilSubtestRule("RZ", "IMPORTANT", 2, null, null, null),
        new MilSubtestRule("VN", "IMPORTANT", 2, null, null, null),
        new MilSubtestRule("MT", "COMPLEMENTARY", 1, null, null, null),
        new MilSubtestRule("OR", "NOT_USED", 0, null, null, null),
    ]);

    private static PcaRouteRules Route(string id, params (string Factor, string Direction, double Weight)[] factors) =>
        new(id, factors.Select(f => new PcaFactorRule(f.Factor, f.Direction, f.Weight, null)).ToList());

    // ---------------------------------------------------------------- PythonSum (the bit-parity kernel)

    [Fact]
    public void PythonSum_is_CPython_compensated_summation_not_naive_addition()
    {
        // Python 3.12+: sum([0.1, 0.2, 0.3]) == 0.6, whereas (0.1 + 0.2) + 0.3 == 0.6000000000000001.
        Assert.Equal(0.6, CareerFitFormulas.PythonSum([0.1, 0.2, 0.3]));
        Assert.NotEqual(0.6, 0.1 + 0.2 + 0.3);
        // sum([1e16, 1.0, -1e16]) == 1.0 (the compensation recovers the swallowed 1); naive gives 0.0.
        Assert.Equal(1.0, CareerFitFormulas.PythonSum([1e16, 1.0, -1e16]));
        Assert.Equal(0.0, 1e16 + 1.0 - 1e16);
        Assert.Equal(0.0, CareerFitFormulas.PythonSum([]));
        Assert.Equal(2.5, CareerFitFormulas.PythonSum([2.5]));
        // weighted_mean([(0.1,1),(0.2,1),(0.3,1)]) == 0.19999999999999998 in the reference.
        Assert.Equal(0.19999999999999998, CareerFitFormulas.WeightedMean([new(0.1, 1.0), new(0.2, 1.0), new(0.3, 1.0)]));
    }

    [Fact]
    public void WeightedMean_drops_nulls_and_non_positive_weights_and_is_null_when_nothing_remains()
    {
        Assert.Null(CareerFitFormulas.WeightedMean([]));
        Assert.Null(CareerFitFormulas.WeightedMean([new(null, 3.0), new(50.0, 0.0), new(50.0, -1.0)]));
        Assert.Equal(80.0, CareerFitFormulas.WeightedMean([new(80.0, 3.0), new(null, 2.0), new(10.0, 0.0)]));
    }

    // ---------------------------------------------------------------- MIL gate transitions

    [Theory]
    [InlineData(17, Gate.Critical, 43.875, "INSUFFICIENT")]
    [InlineData(18, Gate.Conditioned, 44.25, "LOW")]
    [InlineData(37, Gate.Conditioned, 51.375, "LOW")]
    [InlineData(38, Gate.Satisfied, 51.75, "ADEQUATE")]
    public void Mil_gate_transitions_at_17_18_and_37_38_on_a_critical_subtest(int dc, Gate gate, double fit, string band)
    {
        var r = CareerFitFormulas.CalculateMil(new MilInput(dc, 60, 60, 60, 60), Mil(), MilRoleWeights, Bands);

        Assert.Equal(gate, r.Gate);
        Assert.Equal(fit, r.Score);
        Assert.Equal(band, r.Components["DC"].Band);
        Assert.Equal(band, r.LearningCapacityIndicator);
        Assert.Equal(100.0, r.RelativeStrengths["RZ"]);
        Assert.Equal(new[] { "DC", "RZ", "VN", "MT", "OR" }, r.Components.Keys.ToArray());
    }

    [Fact]
    public void Mil_low_percentiles_on_a_non_critical_subtest_do_not_gate()
    {
        var r = CareerFitFormulas.CalculateMil(new MilInput(60, 1, 60, 60, 60), Mil(), MilRoleWeights, Bands);
        Assert.Equal(Gate.Satisfied, r.Gate);
        Assert.Equal("INSUFFICIENT", r.Components["RZ"].Band);
    }

    [Fact]
    public void Mil_weight_zero_subtest_is_excluded_and_relative_strengths_divide_by_the_max()
    {
        var r = CareerFitFormulas.CalculateMil(new MilInput(50, 60, 70, 80, 99), Mil(), MilRoleWeights, Bands);

        Assert.Equal(61.25, r.Score); // (50*3 + 60*2 + 70*2 + 80*1) / 8; OR (NOT_USED, weight 0) excluded
        Assert.Equal(0.0, r.Components["OR"].Weight);
        Assert.Equal(50.505050505050505, r.RelativeStrengths["DC"]);
        Assert.Equal(60.60606060606061, r.RelativeStrengths["RZ"]);
        Assert.Equal(70.70707070707071, r.RelativeStrengths["VN"]);
        Assert.Equal(80.8080808080808, r.RelativeStrengths["MT"]);
        Assert.Equal(100.0, r.RelativeStrengths["OR"]);
        Assert.Equal("ADEQUATE", r.LearningCapacityIndicator);
    }

    [Fact]
    public void Mil_rule_weight_absent_falls_back_to_the_role_weight()
    {
        var withWeight = CareerFitFormulas.CalculateMil(new MilInput(50, 60, 70, 80, 99), Mil(), MilRoleWeights, Bands);
        var withoutWeight = CareerFitFormulas.CalculateMil(new MilInput(50, 60, 70, 80, 99), Mil(dcWeight: null), MilRoleWeights, Bands);
        Assert.Equal(withWeight.Score, withoutWeight.Score);
        Assert.Equal(3.0, withoutWeight.Components["DC"].Weight);
    }

    [Theory]
    [InlineData(1, "INSUFFICIENT")]
    [InlineData(17, "INSUFFICIENT")]
    [InlineData(18, "LOW")]
    [InlineData(37, "LOW")]
    [InlineData(38, "ADEQUATE")]
    [InlineData(56, "ADEQUATE")]
    [InlineData(57, "EXCEEDS")]
    [InlineData(81, "EXCEEDS")]
    [InlineData(82, "EXCEPTIONAL")]
    [InlineData(99, "EXCEPTIONAL")]
    public void MilBand_ladder_matches_the_reference(int percentile, string band) =>
        Assert.Equal(band, CareerFitFormulas.MilBand(percentile, Bands));

    [Theory]
    [InlineData(0, "MIL percentile must be between 1 and 99; got 0")]
    [InlineData(100, "MIL percentile must be between 1 and 99; got 100")]
    public void MilBand_rejects_out_of_range_with_the_reference_message(int percentile, string message)
    {
        var ex = Assert.Throws<ArgumentException>(() => CareerFitFormulas.MilBand(percentile, Bands));
        Assert.Equal(message, ex.Message);
    }

    // ---------------------------------------------------------------- Competency gate

    [Theory]
    [InlineData(0, Gate.Critical, 40.0, true)]
    [InlineData(1, Gate.Conditioned, 70.0, true)]
    [InlineData(2, Gate.Satisfied, 100.0, false)]
    [InlineData(3, Gate.Satisfied, 100.0, false)]
    public void Competency_gate_is_critical_at_level_0_and_conditioned_at_level_1(int criticalLevel, Gate gate, double fit, bool gap)
    {
        IReadOnlyList<CompetencyRule> rules =
        [
            new(1, "CRITICAL", 2, null),
            new(2, "IMPORTANT", 1, null),
            new(3, "DIFFERENTIATOR", null, null),
            new(4, "COMPLEMENTARY", null, null),
        ];
        var levels = new Dictionary<int, int> { [1] = criticalLevel, [2] = 1, [3] = 3, [4] = 4 };

        var r = CareerFitFormulas.CalculateCompetencies(levels, rules, CompetencyRoleWeights);

        Assert.Equal(gate, r.Gate);
        Assert.Equal(fit, r.Score); // (att1*3 + 100*2) / 5; COMPLEMENTARY (role weight 0) and DIFFERENTIATOR excluded
        Assert.Equal(gap ? 1 : 0, r.CriticalGaps.Count);
        if (gap)
        {
            Assert.Equal(new CriticalGap(1, criticalLevel, 2), r.CriticalGaps[0]);
        }

        Assert.Equal(new Differentiator(3, 3), Assert.Single(r.Differentiators));
    }

    [Theory]
    [InlineData(0, "CRITICAL", null, 0.0)]
    [InlineData(1, "CRITICAL", null, 50.0)]
    [InlineData(2, "CRITICAL", null, 100.0)]
    [InlineData(4, "CRITICAL", null, 100.0)]
    [InlineData(0, "IMPORTANT", null, 0.0)]
    [InlineData(1, "IMPORTANT", null, 100.0)]
    [InlineData(1, "CRITICAL", 3, 33.33333333333333)]
    [InlineData(2, "CRITICAL", 3, 66.66666666666666)]
    [InlineData(0, "CRITICAL", 0, 100.0)]
    [InlineData(0, "DIFFERENTIATOR", null, 100.0)]
    public void CompetencyAttainment_F12_F13(int level, string role, int? minimum, double expected) =>
        Assert.Equal(expected, CareerFitFormulas.CompetencyAttainment(level, role, minimum));

    [Fact]
    public void Competency_rule_for_a_missing_level_throws_like_the_reference_KeyError()
    {
        IReadOnlyList<CompetencyRule> rules = [new(7, "CRITICAL", 2, null)];
        Assert.Throws<KeyNotFoundException>(() =>
            CareerFitFormulas.CalculateCompetencies(new Dictionary<int, int> { [1] = 2 }, rules, CompetencyRoleWeights));
    }

    // ---------------------------------------------------------------- PCA factors and routes

    [Fact]
    public void Factor_score_of_exactly_50_is_NEUTRAL_state_and_NEUTRAL_match_100()
    {
        Assert.Equal("NEUTRAL", CareerFitFormulas.PcaState(50.0));
        Assert.Equal("ACTIVE", CareerFitFormulas.PcaState(50.000001));
        Assert.Equal("PASSIVE", CareerFitFormulas.PcaState(49.999999));
        Assert.Equal(100.0, CareerFitFormulas.PcaFactorMatch(50.0, "NEUTRAL"));
        Assert.Equal(0.0, CareerFitFormulas.PcaFactorMatch(0.0, "NEUTRAL"));
        Assert.Equal(0.0, CareerFitFormulas.PcaFactorMatch(100.0, "NEUTRAL"));
        Assert.Equal(50.0, CareerFitFormulas.PcaFactorMatch(75.0, "NEUTRAL"));
        Assert.Equal(75.0, CareerFitFormulas.PcaFactorMatch(75.0, "ACTIVE"));
        Assert.Equal(25.0, CareerFitFormulas.PcaFactorMatch(75.0, "PASSIVE"));
        Assert.Null(CareerFitFormulas.PcaFactorMatch(75.0, "OPEN"));
        Assert.Equal(0.0, CareerFitFormulas.PcaIntensity(50.0));
        Assert.Equal(50.0, CareerFitFormulas.PcaIntensity(75.0));
    }

    [Fact]
    public void Unknown_direction_throws_with_the_reference_message()
    {
        var ex = Assert.Throws<ArgumentException>(() => CareerFitFormulas.PcaFactorMatch(10.0, "SIDEWAYS"));
        Assert.Equal("Unknown PCA direction: SIDEWAYS", ex.Message);
    }

    [Fact]
    public void OPEN_direction_is_excluded_from_the_denominator()
    {
        var pca = new PcaInput(80.0, 30.0, 50.0, 60.0);
        var withOpen = CareerFitFormulas.CalculatePcaRouteFit(pca, Route("R1", ("D", "ACTIVE", 3), ("I", "PASSIVE", 2), ("S", "NEUTRAL", 1), ("C", "OPEN", 2)));
        var withoutC = CareerFitFormulas.CalculatePcaRouteFit(pca, Route("R2", ("D", "ACTIVE", 3), ("I", "PASSIVE", 2), ("S", "NEUTRAL", 1)));

        Assert.Equal(80.0, withOpen.Score); // (80*3 + 70*2 + 100*1) / 6, C's weight 2 NOT in the denominator
        Assert.Equal(80.0, withoutC.Score); // a factor the route omits reads as OPEN
        Assert.Equal(new[] { "D", "I", "S" }, withOpen.Components.Keys.ToArray());
        Assert.Equal(70.0, withOpen.Components["I"]);
        Assert.Equal(100.0, withOpen.Components["S"]);
    }

    [Fact]
    public void Route_with_all_OPEN_factors_scores_0_with_no_components()
    {
        var pca = new PcaInput(80.0, 30.0, 50.0, 60.0);
        var r = CareerFitFormulas.CalculatePcaRouteFit(pca, Route("R3", ("D", "OPEN", 0), ("I", "OPEN", 0), ("S", "OPEN", 0), ("C", "OPEN", 0)));
        Assert.Equal(0.0, r.Score);
        Assert.Empty(r.Components);
        Assert.Equal("R3", r.RouteId);

        // A weight of 0 on a non-OPEN factor drops it too.
        Assert.Equal(70.0, CareerFitFormulas.CalculatePcaRouteFit(pca, Route("R4", ("D", "ACTIVE", 0), ("I", "PASSIVE", 2))).Score);
    }

    [Fact]
    public void Empty_route_list_throws_and_a_tie_goes_to_the_first_route()
    {
        var ex = Assert.Throws<ArgumentException>(() => CareerFitFormulas.SelectBestRoute([]));
        Assert.Equal("At least one route is required", ex.Message);

        var empty = new Dictionary<string, double>();
        var best = CareerFitFormulas.SelectBestRoute([new("A", 5.0, empty), new("B", 5.0, empty), new("C", 4.0, empty)]);
        Assert.Equal("A", best.RouteId);
        Assert.Equal("C", CareerFitFormulas.SelectBestRoute([new("A", 4.0, empty), new("B", 4.5, empty), new("C", 5.0, empty)]).RouteId);
    }

    // ---------------------------------------------------------------- Personality

    [Fact]
    public void Personality_routes_skip_OPEN_dimensions_default_weight_1_and_all_OPEN_scores_0()
    {
        var p = new PersonalityInput(70.0, 30.0, 40.0, 60.0, 55.0, 45.0, 20.0, 80.0);
        IReadOnlyList<PersonalityRoute> routes =
        [
            new("P1",
            [
                new("EI", "OPEN", null, null),
                new("SN", "POLE", "N", 2),
                new("TF", "POLE", "T", 3),
                new("JP", null, "P", null), // rule_type defaults to POLE, weight to 1.0
            ]),
            new("P2", [new("EI", "OPEN", null, null), new("SN", "OPEN", null, null), new("TF", "OPEN", null, null), new("JP", "OPEN", null, null)]),
        ];

        var r = CareerFitFormulas.CalculatePersonality(p, routes);

        Assert.Equal(60.833333333333336, r.Score); // (60*2 + 55*3 + 80*1) / 6
        Assert.Equal("P1", r.WinningRoute);
        Assert.Equal(2, r.AllRoutes.Count);
        Assert.Equal(new[] { "SN", "TF", "JP" }, r.AllRoutes[0].Components.Keys.ToArray());
        Assert.Equal(0.0, r.AllRoutes[1].Score);
        Assert.Empty(r.AllRoutes[1].Components);

        var allOpen = CareerFitFormulas.CalculatePersonality(p, [routes[1]]);
        Assert.Equal(0.0, allOpen.Score);
        Assert.Equal("P2", allOpen.WinningRoute);

        Assert.Throws<ArgumentException>(() => CareerFitFormulas.CalculatePersonality(p, []));
    }

    [Fact]
    public void PersonalityDimensionMatch_reads_the_preferred_pole_and_rejects_an_unknown_one()
    {
        var p = new PersonalityInput(70.0, 30.0, 40.0, 60.0, 55.0, 45.0, 20.0, 80.0);
        Assert.Equal(70.0, CareerFitFormulas.PersonalityDimensionMatch(p, "EI", "E"));
        Assert.Equal(80.0, CareerFitFormulas.PersonalityDimensionMatch(p, "JP", "P"));
        Assert.Null(CareerFitFormulas.PersonalityDimensionMatch(p, "EI", null));
        Assert.Null(CareerFitFormulas.PersonalityDimensionMatch(p, "EI", "OPEN"));
        Assert.Throws<ArgumentException>(() => CareerFitFormulas.PersonalityDimensionMatch(p, "EI", "X"));
    }

    // ---------------------------------------------------------------- 360

    [Fact]
    public void NormalizeLikert_F01()
    {
        Assert.Null(CareerFitFormulas.NormalizeLikert(null));
        Assert.Equal(0.0, CareerFitFormulas.NormalizeLikert(1));
        Assert.Equal(25.0, CareerFitFormulas.NormalizeLikert(2));
        Assert.Equal(50.0, CareerFitFormulas.NormalizeLikert(3));
        Assert.Equal(75.0, CareerFitFormulas.NormalizeLikert(4));
        Assert.Equal(100.0, CareerFitFormulas.NormalizeLikert(5));
        var ex = Assert.Throws<ArgumentException>(() => CareerFitFormulas.NormalizeLikert(6));
        Assert.Equal("Likert response must be between 1 and 5; got 6", ex.Message);
    }

    [Fact]
    public void IntegrateSources_F02_F03_F04()
    {
        var weights = new Dictionary<string, double>(StringComparer.Ordinal) { ["SELF"] = 0.35, ["PARENT"] = 0.25, ["TEACHER"] = 0.25, ["PEER"] = 0.15 };

        var three = CareerFitFormulas.IntegrateSources(
            [new("SELF", 75.0), new("PARENT", null), new("TEACHER", 50.0), new("PEER", 100.0)], weights);
        Assert.Equal(71.66666666666667, three.Score);
        Assert.Equal(50.0, three.Consensus);
        Assert.Equal(0.75, three.Coverage);
        Assert.Equal(3, three.ValidSources);
        Assert.Equal(new[] { "SELF", "TEACHER", "PEER" }, three.SourceScores!.Keys.ToArray());

        var none = CareerFitFormulas.IntegrateSources([new("SELF", null), new("PARENT", null)], weights);
        Assert.Equal(new SourceIntegration(null, null, 0.0, 0, null), none);

        var single = CareerFitFormulas.IntegrateSources([new("SELF", 75.0)], weights);
        Assert.Equal(75.0, single.Score);
        Assert.Null(single.Consensus);
        Assert.Equal(0.35, single.Coverage);
        Assert.Equal(1, single.ValidSources);

        Assert.Throws<ArgumentException>(() => CareerFitFormulas.IntegrateSources([new("SELF", 1.0), new("SELF", 2.0)], weights));
        Assert.Throws<KeyNotFoundException>(() => CareerFitFormulas.IntegrateSources([new("SIBLING", 1.0)], weights));
    }

    [Theory]
    [InlineData(null, "NOT_DETERMINABLE")]
    [InlineData(70.0, "HIGH")]
    [InlineData(69.9, "MEDIUM")]
    [InlineData(40.0, "MEDIUM")]
    [InlineData(39.9, "LOW")]
    public void ClassifyConsensus_ladder(double? consensus, string label) =>
        Assert.Equal(label, CareerFitFormulas.ClassifyConsensus(consensus, ConsensusThresholds));

    [Fact]
    public void Confidence360_F05()
    {
        Assert.Equal(new ConfidenceResult(78.5, Confidence.High), CareerFitFormulas.Confidence360(80.0, 0.75, 3, ConfidenceThresholds));
        Assert.Equal(new ConfidenceResult(57.0, Confidence.Medium), CareerFitFormulas.Confidence360(60.0, 0.5, 2, ConfidenceThresholds));
        Assert.Equal(new ConfidenceResult(29.0, Confidence.Low), CareerFitFormulas.Confidence360(20.0, 0.5, 2, ConfidenceThresholds));
        Assert.Equal(new ConfidenceResult(null, Confidence.NotDeterminable), CareerFitFormulas.Confidence360(80.0, 1.0, 1, ConfidenceThresholds));
        Assert.Equal(new ConfidenceResult(null, Confidence.NotDeterminable), CareerFitFormulas.Confidence360(null, 1.0, 4, ConfidenceThresholds));
    }

    [Fact]
    public void CalculateCareerFit360_F06_uses_only_BASE_rules_with_relevance_and_a_present_aggregate()
    {
        IReadOnlyList<V360Rule> rules =
        [
            new("AN", "BASE", 2, 0.024),
            new("AST", "BASE", 3, 0.024),
            new("OA", "BASE", 0, 0.0375),       // relevance 0 -> skipped
            new("ME", "MODULATOR", 3, 0.03),    // not BASE -> skipped
            new("PB", "BASE", 3, 0.03),         // no aggregate -> skipped
        ];
        var aggregates = new Dictionary<string, V360Aggregate>(StringComparer.Ordinal)
        {
            ["AN"] = new(80.0, 90.0, 70.0),
            ["AST"] = new(60.0, 50.0),
            ["OA"] = new(100.0),
            ["ME"] = new(100.0),
        };

        var r = CareerFitFormulas.CalculateCareerFit360(aggregates, rules);

        Assert.Equal(68.0, r.Score);
        Assert.Equal(new[] { "AN", "AST" }, r.Variables.Keys.ToArray());
        Assert.Equal(0.048, r.Variables["AN"].CombinedWeight);
        Assert.Equal(0.07200000000000001, r.Variables["AST"].CombinedWeight);
        Assert.Equal(66.0, r.Consensus);
        Assert.Equal(70.0, r.ConfidenceIndex);

        var empty = CareerFitFormulas.CalculateCareerFit360(new Dictionary<string, V360Aggregate>(), rules);
        Assert.Equal(0.0, empty.Score);
        Assert.Empty(empty.Variables);
        Assert.Null(empty.Consensus);
        Assert.Null(empty.ConfidenceIndex);
    }

    // ---------------------------------------------------------------- Integration, gates, convergence

    [Fact]
    public void CombinePca_F15_and_CareerFitAbsolute_F20_reproduce_fixture_case_0_family_1()
    {
        Assert.Equal(81.88906070139879, CareerFitFormulas.CombinePca(63.77812140279758, 100.0, new PcaInternalWeights(0.5, 0.5)));
        Assert.Equal(
            59.834905982575776,
            CareerFitFormulas.CareerFitAbsolute(81.88906070139879, 47.0, 54.5077639556279, 51.14007726270653, new CareerFitBlendWeights(0.25, 0.30, 0.15, 0.30)));
    }

    [Fact]
    public void CombineGates_takes_the_most_severe()
    {
        Assert.Equal(Gate.Conditioned, CareerFitFormulas.CombineGates(Gate.Satisfied, Gate.Conditioned));
        Assert.Equal(Gate.Critical, CareerFitFormulas.CombineGates(Gate.Conditioned, Gate.Critical, Gate.Satisfied));
        Assert.Equal(Gate.Satisfied, CareerFitFormulas.CombineGates(Gate.Satisfied));
        Assert.Throws<ArgumentException>(() => CareerFitFormulas.CombineGates());
    }

    [Theory]
    [InlineData(70.0, Support.Strong)]
    [InlineData(69.999, Support.Partial)]
    [InlineData(55.0, Support.Partial)]
    [InlineData(54.999, Support.Divergent)]
    public void EvidenceSupport_F22_F23_inclusive_cut_points(double score, Support support) =>
        Assert.Equal(support, CareerFitFormulas.EvidenceSupport(score, SpecPair));

    [Fact]
    public void EvidenceSupport_uses_per_instrument_thresholds_when_present_else_the_single_pair()
    {
        var recut = new ConvergenceThresholds(70.0, 55.0, new Dictionary<string, InstrumentThresholds>(StringComparer.Ordinal)
        {
            ["PCA"] = new(88.0, 85.0, "SIMULATED"),
            ["MIL"] = new(57.0, 38.0, "04_MIL_LOGICA section B bands"),
        });

        Assert.Equal(Support.Partial, CareerFitFormulas.EvidenceSupport(87.0, recut, "PCA"));      // 87 < 88
        Assert.Equal(Support.Strong, CareerFitFormulas.EvidenceSupport(88.0, recut, "PCA"));
        Assert.Equal(Support.Divergent, CareerFitFormulas.EvidenceSupport(84.9, recut, "PCA"));
        Assert.Equal(Support.Strong, CareerFitFormulas.EvidenceSupport(57.0, recut, "MIL"));       // 57 >= 57 (EXCEEDS)
        Assert.Equal(Support.Partial, CareerFitFormulas.EvidenceSupport(38.0, recut, "MIL"));      // ADEQUATE
        Assert.Equal(Support.Strong, CareerFitFormulas.EvidenceSupport(87.0, recut, "PERSONALITY")); // no recut -> 70/55
        Assert.Equal(Support.Strong, CareerFitFormulas.EvidenceSupport(87.0, recut));                // no instrument -> 70/55

        var conv = CareerFitFormulas.ConvergenceLevel(87.0, 57.0, 60.0, 60.0, Confidence.High, recut);
        Assert.Equal(new[] { "PCA", "MIL", "PERSONALITY", "360" }, conv.Supports.Keys.ToArray());
        Assert.Equal(new[] { Support.Partial, Support.Strong, Support.Partial, Support.Partial }, conv.Supports.Values.ToArray());
        Assert.Equal(1, conv.StrongCount);
        Assert.Equal(Convergence.Divergent, conv.Level);
    }

    [Theory]
    [InlineData(Confidence.High, Convergence.VeryHigh, 4, Support.Strong)]
    [InlineData(Confidence.Medium, Convergence.VeryHigh, 4, Support.Strong)]
    [InlineData(Confidence.Low, Convergence.Solid, 3, Support.Partial)]
    [InlineData(Confidence.NotDeterminable, Convergence.Solid, 3, Support.Partial)]
    public void Strong_360_support_is_downgraded_to_PARTIAL_when_confidence_is_LOW_or_NOT_DETERMINABLE(
        Confidence confidence, Convergence level, int strongCount, Support support360)
    {
        var conv = CareerFitFormulas.ConvergenceLevel(90, 90, 90, 90, confidence, SpecPair);
        Assert.Equal(level, conv.Level);
        Assert.Equal(strongCount, conv.StrongCount);
        Assert.Equal(support360, conv.Supports["360"]);
        Assert.Equal(new[] { "PCA", "MIL", "PERSONALITY", "360" }, conv.Supports.Keys.ToArray());
    }

    [Fact]
    public void Convergence_ladder_4_3_2_other()
    {
        Assert.Equal(Convergence.VeryHigh, CareerFitFormulas.ConvergenceLevel(90, 90, 90, 90, Confidence.High, SpecPair).Level);
        Assert.Equal(Convergence.Solid, CareerFitFormulas.ConvergenceLevel(90, 90, 90, 60, Confidence.High, SpecPair).Level);
        Assert.Equal(Convergence.Partial, CareerFitFormulas.ConvergenceLevel(90, 90, 50, 60, Confidence.High, SpecPair).Level);
        Assert.Equal(Convergence.Divergent, CareerFitFormulas.ConvergenceLevel(90, 50, 50, 60, Confidence.High, SpecPair).Level);
        Assert.Equal(Convergence.Divergent, CareerFitFormulas.ConvergenceLevel(10, 50, 50, 60, Confidence.High, SpecPair).Level);
    }

    [Fact]
    public void AssignRelativeFit_F21_is_a_stable_descending_rank()
    {
        var a = Evaluation(60.0);
        var b = Evaluation(70.0);
        var c = Evaluation(60.0);
        var d = Evaluation(65.0);

        var ranked = CareerFitFormulas.AssignRelativeFit([a, b, c, d]);

        Assert.Equal(new[] { 1, 2, 3, 4 }, ranked.Select(r => r.RankPosition!.Value).ToArray());
        Assert.Equal(new[] { 100.0, 66.66666666666667, 33.333333333333336, 0.0 }, ranked.Select(r => r.CareerFitRelative!.Value).ToArray());
        Assert.Same(a.AuditInputs, ranked[2].AuditInputs); // a before c: equal keys keep input order
        Assert.Same(c.AuditInputs, ranked[3].AuditInputs);
        Assert.Null(a.RankPosition); // inputs are not mutated

        var single = CareerFitFormulas.AssignRelativeFit([Evaluation(1.0)]);
        Assert.Equal(1, single[0].RankPosition);
        Assert.Equal(100.0, single[0].CareerFitRelative);

        var three = CareerFitFormulas.AssignRelativeFit([Evaluation(1.0), Evaluation(3.0), Evaluation(2.0)]);
        Assert.Equal(new[] { 100.0, 50.0, 0.0 }, three.Select(r => r.CareerFitRelative!.Value).ToArray());
        Assert.Empty(CareerFitFormulas.AssignRelativeFit([]));
    }

    // ---------------------------------------------------------------- ValidateInputs

    private static readonly Dictionary<int, int> AllTwo = Enumerable.Range(1, 24).ToDictionary(i => i, _ => 2);

    [Fact]
    public void ValidateInputs_accepts_in_range_inputs()
    {
        CareerFitFormulas.ValidateInputs(
            new PcaInput(0, 100, 50, 50), AllTwo, new MilInput(1, 99, 50, 50, 50), new PersonalityInput(0, 100, 50, 50, 50, 50, 50, 50));
        CareerFitFormulas.ValidateInputs(
            new PcaInput(50, 50, 50, 50), Enumerable.Range(1, 24).ToDictionary(i => i, i => i % 5), new MilInput(50, 50, 50, 50, 50), new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 50));
    }

    public static TheoryData<PcaInput, string> BadPca => new()
    {
        { new PcaInput(150.0, 50.0, 50.0, 50.0), "PCA.D must be between 0 and 100; got 150.0" },
        { new PcaInput(50.0, -0.5, 50.0, 50.0), "PCA.I must be between 0 and 100; got -0.5" },
        { new PcaInput(50.0, 50.0, 100.00001, 50.0), "PCA.S must be between 0 and 100; got 100.00001" },
        { new PcaInput(50.0, 50.0, 50.0, double.NaN), "PCA.C must be between 0 and 100; got nan" },
    };

    [Theory]
    [MemberData(nameof(BadPca))]
    public void ValidateInputs_rejects_PCA_out_of_range_with_the_reference_message(PcaInput pca, string message)
    {
        var ex = Assert.Throws<ArgumentException>(() =>
            CareerFitFormulas.ValidateInputs(pca, AllTwo, new MilInput(50, 50, 50, 50, 50), new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 50)));
        Assert.Equal(message, ex.Message);
    }

    [Fact]
    public void ValidateInputs_rejects_competencies_out_of_range_with_the_reference_messages()
    {
        var mil = new MilInput(50, 50, 50, 50, 50);
        var p = new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 50);
        var pca = new PcaInput(50, 50, 50, 50);

        var missing = Enumerable.Range(1, 23).ToDictionary(i => i, _ => 2);
        Assert.Equal("Competencies must contain IDs 1..24", Assert.Throws<ArgumentException>(() => CareerFitFormulas.ValidateInputs(pca, missing, mil, p)).Message);

        var shifted = Enumerable.Range(0, 24).ToDictionary(i => i, _ => 2); // 0..23: right count, wrong ids
        Assert.Equal("Competencies must contain IDs 1..24", Assert.Throws<ArgumentException>(() => CareerFitFormulas.ValidateInputs(pca, shifted, mil, p)).Message);

        var five = new Dictionary<int, int>(AllTwo) { [3] = 5 };
        Assert.Equal("competency[3] must be between 0 and 4; got 5", Assert.Throws<ArgumentException>(() => CareerFitFormulas.ValidateInputs(pca, five, mil, p)).Message);

        var negative = new Dictionary<int, int>(AllTwo) { [24] = -1 };
        Assert.Equal("competency[24] must be between 0 and 4; got -1", Assert.Throws<ArgumentException>(() => CareerFitFormulas.ValidateInputs(pca, negative, mil, p)).Message);
    }

    [Fact]
    public void ValidateInputs_rejects_MIL_and_personality_out_of_range_with_the_reference_messages()
    {
        var pca = new PcaInput(50, 50, 50, 50);
        var p = new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 50);

        Assert.Equal("MIL.DC must be between 1 and 99; got 0", Assert.Throws<ArgumentException>(() =>
            CareerFitFormulas.ValidateInputs(pca, AllTwo, new MilInput(0, 50, 50, 50, 50), p)).Message);
        Assert.Equal("MIL.OR must be between 1 and 99; got 100", Assert.Throws<ArgumentException>(() =>
            CareerFitFormulas.ValidateInputs(pca, AllTwo, new MilInput(50, 50, 50, 50, 100), p)).Message);
        Assert.Equal("Personality.P must be between 0 and 100; got 100.5", Assert.Throws<ArgumentException>(() =>
            CareerFitFormulas.ValidateInputs(pca, AllTwo, new MilInput(50, 50, 50, 50, 50), new PersonalityInput(50, 50, 50, 50, 50, 50, 50, 100.5))).Message);
    }

    // ---------------------------------------------------------------- Enum wire values

    [Fact]
    public void Enums_serialise_to_the_reference_string_values()
    {
        Assert.Equal("\"SATISFIED\"", JsonSerializer.Serialize(Gate.Satisfied));
        Assert.Equal("\"CONDITIONED\"", JsonSerializer.Serialize(Gate.Conditioned));
        Assert.Equal("\"CRITICAL\"", JsonSerializer.Serialize(Gate.Critical));
        Assert.Equal("\"NOT_DETERMINABLE\"", JsonSerializer.Serialize(Confidence.NotDeterminable));
        Assert.Equal("\"DIVERGENT\"", JsonSerializer.Serialize(Support.Divergent));
        Assert.Equal("\"VERY_HIGH\"", JsonSerializer.Serialize(Convergence.VeryHigh));
        Assert.Equal(Gate.Conditioned, JsonSerializer.Deserialize<Gate>("\"CONDITIONED\""));
        Assert.Equal(Convergence.VeryHigh, CareerFitEnums.ParseConvergence(Convergence.VeryHigh.ToReferenceValue()));
        Assert.Equal(Support.Partial, CareerFitEnums.ParseSupport("PARTIAL"));
        Assert.Equal(Confidence.Low, CareerFitEnums.ParseConfidence("LOW"));
        Assert.Throws<ArgumentException>(() => CareerFitEnums.ParseGate("SATISFECHO"));
    }

    private static OwnerEvaluation Evaluation(double absolute)
    {
        var empty = new Dictionary<string, double>();
        var route = new RouteScore("R", 0.0, empty);
        var mil = new MilResult(0.0, Gate.Satisfied, new Dictionary<string, MilComponent>(), empty, "ADEQUATE");
        var personality = new PersonalityResult(0.0, "P", [route]);
        var v360 = new CareerFit360Result(0.0, new Dictionary<string, V360VariableEvidence>(), null, null);
        var convergence = new ConvergenceResult(Convergence.Divergent, 0, new Dictionary<string, Support>());
        return new OwnerEvaluation(
            "FAMILY", 1, 0.0, "R", 0.0, Gate.Satisfied, 0.0, 0.0, Gate.Satisfied, empty, 0.0, "P", 0.0, null, Confidence.High,
            Gate.Satisfied, Convergence.Divergent, convergence, absolute, [], new AuditInputs([route], mil, personality, v360));
    }
}
