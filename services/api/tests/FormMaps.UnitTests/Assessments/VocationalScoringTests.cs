using FormMaps.Application.Assessments;

namespace FormMaps.UnitTests.Assessments;

/// <summary>
/// Vocational-360 scoring parity (FM-DOTNET-028). Mirrors legacy vocationalScoringService.test.ts (the
/// engine's own spec — no golden.json exists for vocational). Pins the Likert→0-100 normalize, the
/// inclusive band ladder, group-weight renormalization, the composite, the group-weighted rankings
/// (with JS-Map-insertion-order stable tie-break), and the readiness gate.
/// </summary>
public class VocationalScoringTests
{
    private static readonly ScoringBands Bands = new(Strong: 80, ModerateHigh: 60, Medium: 40);

    private static readonly IReadOnlyDictionary<string, double> Base = new Dictionary<string, double>
    {
        ["self"] = 35,
        ["parent"] = 25,
        ["teacher"] = 25,
        ["sibling_friend"] = 15,
    };

    private static ScoringResponse Likert(int questionNumber, string dimensionKey, double rating) =>
        new(questionNumber, "likert", dimensionKey, rating, null, null, null);

    [Theory]
    [InlineData(1, 0)]
    [InlineData(3, 50)]
    [InlineData(5, 100)]
    public void Normalize_maps_likert_to_0_100(double rating, double expected) =>
        Assert.Equal(expected, VocationalScoring.Normalize(rating), 9);

    [Theory]
    [InlineData(80, "strong")]
    [InlineData(79.9, "moderateHigh")]
    [InlineData(60, "moderateHigh")]
    [InlineData(40, "medium")]
    [InlineData(39.9, "low")]
    public void Band_applies_inclusive_thresholds(double score, string expected) =>
        Assert.Equal(expected, VocationalScoring.Band(score, Bands));

    [Fact]
    public void DimensionScoreForGroup_averages_normalized_likert_for_that_dimension()
    {
        var rs = new[] { Likert(1, "d1", 5), Likert(2, "d1", 3), Likert(9, "d2", 1) };
        // d1: (100 + 50) / 2 = 75
        Assert.Equal(75, VocationalScoring.DimensionScoreForGroup(rs, "d1")!.Value, 9);
        Assert.Null(VocationalScoring.DimensionScoreForGroup(new[] { Likert(9, "d2", 4) }, "d1"));
    }

    [Fact]
    public void RenormalizeGroupWeights_restricts_to_present_and_sums_to_one()
    {
        var w = VocationalScoring.RenormalizeGroupWeights(Base, ["self", "parent"]);
        Assert.Equal(0.58, VocationalScoring.Round2(w["self"]), 9);   // 35/60
        Assert.Equal(0.42, VocationalScoring.Round2(w["parent"]), 9); // 25/60
        Assert.Equal(1, VocationalScoring.Round2(w["self"] + w["parent"]), 9);
    }

    [Fact]
    public void AggregateDimension_group_weights_present_scores()
    {
        var byGroup = new Dictionary<string, double> { ["self"] = 80, ["parent"] = 50 };
        // 80*0.583 + 50*0.417 = 67.5
        Assert.Equal(67.5, VocationalScoring.AggregateDimension(byGroup, Base)!.Value, 9);
        Assert.Null(VocationalScoring.AggregateDimension(new Dictionary<string, double>(), Base));
    }

    [Fact]
    public void Composite_dimension_weights_scored_dimensions_only()
    {
        var dims = new List<DimensionScore>
        {
            new("a", "A", 100, "strong", new Dictionary<string, double>()),
            new("b", "B", 50, "medium", new Dictionary<string, double>()),
            new("c", "C", null, null, new Dictionary<string, double>()),
        };
        var meta = new List<ScoringDimension>
        {
            new("a", "A", 20), new("b", "B", 20), new("c", "C", 10),
        };
        // c excluded; a,b each 20/40 → (100+50)/2 = 75
        Assert.Equal(75, VocationalScoring.Composite(dims, meta), 9);
    }

    [Fact]
    public void ComputeRankings_ranks_interests_and_tallies_industries_worktype_open()
    {
        var qs = new List<ScoringQuestion>
        {
            new(41, "ranking", new ScoringRule("rank", TopPoints: 20, N: null, PointsEach: null)),
            new(42, "multi_select", new ScoringRule("pickN", TopPoints: null, N: 5, PointsEach: 1)),
            new(44, "single_select", null),
            new(45, "open", null),
        };
        var groups = new List<ScoringGroup>
        {
            new("self", new List<ScoringResponse>
            {
                new(41, "ranking", null, null, [new RankingEntry("a", 1), new RankingEntry("b", 2)], null, null),
                new(42, "multi_select", null, null, null, ["tech", "health"], null),
                new(44, "single_select", null, null, null, null, "independent"),
                new(45, "open", null, null, null, null, "  curious  "),
            }),
            new("parent", new List<ScoringResponse>
            {
                new(41, "ranking", null, null, [new RankingEntry("b", 1), new RankingEntry("a", 2)], null, null),
            }),
        };

        var r = VocationalScoring.ComputeRankings(groups, Base, qs);
        // a: 20*0.583 + 19*0.417 = 19.58; b: 19*0.583 + 20*0.417 = 19.42 → a first
        Assert.Equal("a", r.Interests[0].Value);
        Assert.Equal(new[] { "a", "b" }, r.Interests.Select(x => x.Value).ToArray());
        Assert.Equal(new[] { "tech", "health" }, r.Industries.Select(x => x.Value).ToArray());
        Assert.Equal("independent", r.WorkType!.Value);
        Assert.Equal(new OpenInsight("self", "curious"), Assert.Single(r.OpenInsights));
    }

    [Fact]
    public void ComputeVocationalResult_is_not_ready_without_self_plus_one_other()
    {
        var config = ResultConfig();
        Assert.IsType<VocationalNotReady>(VocationalScoring.ComputeVocationalResult(config, [], [Rater("self", 5, 5)]));
        Assert.IsType<VocationalNotReady>(VocationalScoring.ComputeVocationalResult(config, [], [Rater("parent", 5, 5)]));
    }

    [Fact]
    public void ComputeVocationalResult_computes_composite_scores_and_bands()
    {
        var config = ResultConfig();
        var outcome = VocationalScoring.ComputeVocationalResult(config, [], [Rater("self", 5, 5), Rater("parent", 1, 1)]);

        var ready = Assert.IsType<VocationalResultPayload>(outcome);
        // each dim: self=100, parent=0; renorm self 35/60 → 100*0.583 = 58.33
        Assert.Equal(58.33, ready.DimensionScores.Single(d => d.Key == "d1").Score!.Value, 9);
        Assert.Equal(58.33, ready.Composite, 9);
        Assert.Equal("medium", ready.Band);
        Assert.Equal(new[] { "self", "parent" }, ready.GroupsIncluded.ToArray());
        Assert.Equal(2, ready.RespondentCount);
    }

    [Theory]
    // round2 must match JS Math.round byte-for-byte, incl. the ULP quirk value where Math.Floor(x+0.5)
    // diverges: JS round2(0.004999999999999999) = 0 (Math.Floor(x+0.5) would give 0.01). Codex/fresh F1.
    [InlineData(0.004999999999999999, 0)]
    [InlineData(0.005, 0.01)]
    [InlineData(0.015, 0.02)]
    [InlineData(67.5, 67.5)]
    public void Round2_matches_js_math_round(double input, double expected) =>
        Assert.Equal(expected, VocationalScoring.Round2(input), 12);

    [Fact]
    public void ComputeRankings_tolerates_duplicate_question_numbers_last_wins()
    {
        // Two questions share number 50 (JS `new Map` keeps the LAST entry; .NET ToDictionary would throw).
        // The last entry has a null rule → topPoints defaults to 20 → rank-1 interest point = 20 * gw(1).
        var qs = new List<ScoringQuestion>
        {
            new(50, "ranking", new ScoringRule("rank", TopPoints: 5, N: null, PointsEach: null)),
            new(50, "ranking", null),
        };
        var groups = new List<ScoringGroup>
        {
            new("self", new List<ScoringResponse>
            {
                new(50, "ranking", null, null, [new RankingEntry("x", 1)], null, null),
            }),
        };
        var baseW = new Dictionary<string, double> { ["self"] = 1 };

        var r = VocationalScoring.ComputeRankings(groups, baseW, qs);
        Assert.Equal(20, r.Interests.Single(i => i.Value == "x").Points, 9); // default-20 (last entry), not 5
    }

    [Fact]
    public void ComputeRankings_open_text_uses_js_trim_dropping_bom()
    {
        // JS `.trim()` strips U+FEFF; .NET `.Trim()` does not. A BOM-only open answer must be dropped and
        // a BOM-wrapped one stored trimmed — matching the TS engine (Codex F: open-text trim parity).
        var qs = new List<ScoringQuestion> { new(45, "open", null) };
        var groups = new List<ScoringGroup>
        {
            new("self", new List<ScoringResponse>
            {
                new(45, "open", null, null, null, null, "\uFEFF"),            // BOM-only -> dropped
                new(45, "open", null, null, null, null, "\uFEFFhi\uFEFF"),        // BOM-wrapped -> "hi"
            }),
        };
        var baseW = new Dictionary<string, double> { ["self"] = 1 };

        var r = VocationalScoring.ComputeRankings(groups, baseW, qs);
        Assert.Equal(new OpenInsight("self", "hi"), Assert.Single(r.OpenInsights));
    }

    private static ScoringConfig ResultConfig() => new(
        InstrumentVersion: "v1",
        GroupWeights: Base,
        Bands: new ScoringBands(80, 60, 40),
        Dimensions: [new ScoringDimension("d1", "D1", 20), new ScoringDimension("d2", "D2", 10)]);

    private static ScoringGroup Rater(string group, double d1, double d2) => new(group, new List<ScoringResponse>
    {
        Likert(1, "d1", d1),
        Likert(2, "d2", d2),
    });
}
