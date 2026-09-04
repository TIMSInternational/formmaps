using FormMaps.Application.Assessments;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.UnitTests.CareerFit.Adapters;

/// <summary>
/// FM-CF-007 / FM-CF-008 — the adapter that turns the vocational chassis's stored item responses into the
/// engine's per-variable aggregates. The 40 items are NOT seeded (FM-CF-006 is blocked on TIMS), so every
/// response here is SYNTHETIC and built in the test; nothing invents an item text and nothing asserts a
/// number about a real student.
///
/// RED FIRST. Each of these was watched failing against the naive aggregation committed immediately
/// before (pool every rater into one mean, declare consensus 100 because nothing disagreed, call coverage
/// 1.0, score IND, no explicit no-evidence path) — the failure is named in each test's summary.
/// </summary>
public class VocationalV360AdapterTests
{
    private static readonly CareerFitRules Rules = CareerFitRulesJson.LoadEmbedded("1.0.0-draft.1");

    /// <summary>One likert item response: question number, variable code (the chassis's dimensionKey), rating 1..5.</summary>
    private static ScoringResponse Item(int number, string code, int? rating) =>
        new(number, "likert", code, rating, null, null, null);

    private static ScoringGroup Rater(string group, params ScoringResponse[] responses) => new(group, responses);

    private static V360Adaptation Adapt(params ScoringGroup[] groups) => V360Aggregation.Adapt(Rules, groups);

    // ------------------------------------------------------------------ the no-evidence fallback

    /// <summary>
    /// RED against the naive adapter, which reported source VOCATIONAL_RESPONSES and no warning for a
    /// student with nothing at all — "no 360" became indistinguishable from "360 that happened to be
    /// empty". The selection has to be a decision the adapter makes and states, not the shape an empty
    /// query happens to leave behind.
    /// </summary>
    [Fact]
    public void No_rater_groups_at_all_selects_the_NoData_path_explicitly()
    {
        foreach (var adaptation in new[] { V360Aggregation.Adapt(Rules, null), V360Aggregation.Adapt(Rules, []) })
        {
            Assert.Empty(adaptation.Aggregates);
            Assert.Equal(Confidence.NotDeterminable, adaptation.Confidence);
            Assert.Equal(V360Sources.NoData, adaptation.Source);
            Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360NoData);
        }
    }

    /// <summary>
    /// The case that is live TODAY: the chassis has rater groups and responses, but none of them is a
    /// CareerFit 360 item, because FM-CF-006 has not seeded any. RED against the naive adapter (source
    /// VOCATIONAL_RESPONSES, no warning) — the run must read exactly as it does today.
    /// </summary>
    [Fact]
    public void Responses_that_map_to_no_360_variable_select_the_NoData_path()
    {
        var adaptation = Adapt(Rater(
            "self",
            Item(1, "communication", 5),           // a legacy vocational dimension, not a 360 variable
            new ScoringResponse(35, "ranking", null, null, [new RankingEntry("Ingeniería", 1)], null, null)));

        Assert.Empty(adaptation.Aggregates);
        Assert.Equal(V360Sources.NoData, adaptation.Source);
        Assert.Equal(Confidence.NotDeterminable, adaptation.Confidence);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360NoData);
        // and the unrecognised code is on the record rather than silently dropped
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360UnknownCode && w.Message.Contains("communication"));
    }

    /// <summary>A student with no 360 must still score: the NoData aggregates make every family's careerfit360 exactly 0.0, the reference engine's own answer for no evidence.</summary>
    [Fact]
    public void The_NoData_path_scores_every_family_at_zero_and_never_throws()
    {
        var adaptation = V360Aggregation.Adapt(Rules, []);
        foreach (var family in Rules.ScorableFamilies)
        {
            var result = CareerFitFormulas.CalculateCareerFit360(adaptation.Aggregates, family.V360Rules);
            Assert.Equal(0.0, result.Score);
            Assert.Null(result.Consensus);
            Assert.Empty(result.Variables);
        }
    }

    // ------------------------------------------------------------------ single-rater consensus

    /// <summary>
    /// V1 is SELF-ONLY 360 (manifest decision 1). Consensus is 100 − (max − min) ACROSS RATERS, so with one
    /// rater there is nothing to disagree with and the reference returns None — not 100. RED against the
    /// naive adapter, which emitted consensus 100.0 and a HIGH confidence index off it: a fabricated
    /// unanimity that would have read as the strongest possible evidence.
    /// </summary>
    [Fact]
    public void A_single_rater_yields_no_consensus_and_NOT_DETERMINABLE_never_a_fabricated_100()
    {
        var adaptation = Adapt(Rater("self", Item(1, "AN", 5), Item(2, "AST", 3)));

        Assert.Equal(V360Sources.VocationalResponses, adaptation.Source);
        Assert.Equal(2, adaptation.Aggregates.Count);
        foreach (var (code, aggregate) in adaptation.Aggregates)
        {
            Assert.Null(aggregate.Consensus);
            Assert.Null(aggregate.ConfidenceIndex);
            Assert.True(aggregate.Score is >= 0.0 and <= 100.0, code);
        }

        Assert.Equal(Confidence.NotDeterminable, adaptation.Confidence);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360SingleRater);
    }

    /// <summary>The scores themselves are real even when the consensus is not: SELF alone on rating 5 is 100, on rating 3 is 50 (F01), and coverage is SELF's own weight, 0.35 — not 1.0.</summary>
    [Fact]
    public void A_single_rater_still_produces_real_scores_and_the_sources_own_coverage()
    {
        var adaptation = Adapt(Rater("self", Item(1, "AN", 5), Item(2, "AST", 3)));

        Assert.Equal(100.0, adaptation.Aggregates["AN"].Score);
        Assert.Equal(50.0, adaptation.Aggregates["AST"].Score);

        var audit = adaptation.Variables.Single(v => v.Code == "AN");
        Assert.Equal(Rules.Weights.V360Sources["SELF"], audit.SourceCoverage);
        Assert.Equal(1, audit.ValidSources);
        Assert.Equal(["SELF"], audit.Sources);
    }

    // ------------------------------------------------------------------ multi-rater integration (V1.1)

    /// <summary>
    /// The shape is spec'd even though V1 ships self-only, so the arithmetic must already be right: the
    /// per-variable score is F02 over the rater sources at rules.weights.v360_sources, the consensus is
    /// F03, and the confidence is F05. RED against the naive adapter, which pooled all four raters'
    /// answers into one unweighted mean (62.5 here instead of the source-weighted 70.0) and never read a
    /// source weight at all.
    /// </summary>
    [Fact]
    public void Four_raters_integrate_at_the_rule_sets_source_weights_not_as_one_pooled_mean()
    {
        // SELF 100, PARENT 75, TEACHER 50, PEER 25 on the same variable.
        var adaptation = Adapt(
            Rater("self", Item(1, "AN", 5)),
            Rater("parent", Item(1, "AN", 4)),
            Rater("teacher", Item(1, "AN", 3)),
            Rater("sibling_friend", Item(1, "AN", 2)));

        var weights = Rules.Weights.V360Sources;
        var expected = CareerFitFormulas.IntegrateSources(
            [new SourceScore("SELF", 100.0), new SourceScore("PARENT", 75.0),
             new SourceScore("TEACHER", 50.0), new SourceScore("PEER", 25.0)],
            weights);

        var aggregate = adaptation.Aggregates["AN"];
        Assert.Equal(expected.Score, aggregate.Score);
        Assert.Equal(expected.Consensus, aggregate.Consensus);         // 100 - (100 - 25) = 25
        Assert.Equal(25.0, aggregate.Consensus);
        Assert.Equal(1.0, adaptation.Variables.Single(v => v.Code == "AN").SourceCoverage);
        Assert.Equal(4, adaptation.Variables.Single(v => v.Code == "AN").ValidSources);
        // The unweighted pool the naive adapter computed:
        Assert.NotEqual(62.5, aggregate.Score);
        Assert.Equal(
            CareerFitFormulas.Confidence360(expected.Consensus, expected.Coverage, 4, Rules.Thresholds.V360Confidence).Index,
            aggregate.ConfidenceIndex);
    }

    /// <summary>The chassis keeps two teachers as two groups; the engine has ONE TEACHER source, so their answers pool into it rather than colliding as a duplicate source.</summary>
    [Fact]
    public void Two_rater_groups_of_the_same_type_pool_into_one_engine_source()
    {
        var adaptation = Adapt(
            Rater("self", Item(1, "AN", 3)),
            Rater("teacher", Item(1, "AN", 5)),
            Rater("teacher", Item(1, "AN", 1)));

        var audit = adaptation.Variables.Single(v => v.Code == "AN");
        Assert.Equal(["SELF", "TEACHER"], audit.Sources);
        Assert.Equal(2, audit.ValidSources);
        // TEACHER = mean(100, 0) = 50, SELF = 50 -> consensus 100 (they agree), not a collision.
        Assert.Equal(100.0, adaptation.Aggregates["AN"].Consensus);
    }

    // ------------------------------------------------------------------ item coverage

    /// <summary>
    /// Coverage has two meanings and they fail differently. The reference's coverage — what F05 consumes —
    /// is the sum of the RATER SOURCE weights that scored the variable. How much of the variable's ITEM set
    /// was answered is a separate fact, and the adapter records it. RED against the naive adapter, which
    /// reported 1.0 for both, always.
    /// </summary>
    [Fact]
    public void Partial_item_coverage_is_recorded_and_is_not_the_reference_engines_coverage()
    {
        // AN has three items; SELF answered two of them, PARENT all three.
        var adaptation = Adapt(
            Rater("self", Item(1, "AN", 5), Item(2, "AN", 5), Item(3, "AN", null)),
            Rater("parent", Item(1, "AN", 3), Item(2, "AN", 3), Item(3, "AN", 3)));

        var audit = adaptation.Variables.Single(v => v.Code == "AN");
        Assert.Equal(3, audit.ItemsExpected);
        Assert.Equal(5, audit.ItemsAnswered);            // 2 from SELF + 3 from PARENT
        Assert.Equal(2, audit.ValidSources);
        Assert.Equal(
            Rules.Weights.V360Sources["SELF"] + Rules.Weights.V360Sources["PARENT"],
            audit.SourceCoverage);
        Assert.NotEqual(1.0, audit.SourceCoverage);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360PartialCoverage && w.Message.Contains("AN"));
    }

    /// <summary>An unanswered item is not a zero: the mean is over the items that were answered, so two 5s and a blank is 100, never 66.7.</summary>
    [Fact]
    public void An_unanswered_item_is_skipped_not_counted_as_a_zero()
    {
        var adaptation = Adapt(Rater("self", Item(1, "AN", 5), Item(2, "AN", 5), Item(3, "AN", null)));
        Assert.Equal(100.0, adaptation.Aggregates["AN"].Score);
    }

    // ------------------------------------------------------------------ FM-CF-008 exclusions

    /// <summary>
    /// FM-CF-008: IND is EXCLUDED in V1, by name. It is P36, a 20-industry SELECTION vector — projecting it
    /// onto a career family needs an industry → family map TIMS has not delivered, so any scalar the
    /// adapter emitted for it would be invented. RED against the naive adapter, which happily scored an IND
    /// item like any other likert and let it into every family's F06 at the largest base weight in the
    /// catalogue (0.1, four times AN's).
    /// </summary>
    [Fact]
    public void IND_is_excluded_by_name_and_never_reaches_F06()
    {
        Assert.Contains("IND", V360Aggregation.ExcludedInV1);
        Assert.Equal(0.1, Rules.V360Variables.Single(v => v.Code == "IND").BaseWeight);

        var adaptation = Adapt(Rater("self", Item(1, "AN", 5), Item(36, "IND", 5)));

        Assert.DoesNotContain("IND", adaptation.Aggregates.Keys);
        Assert.Contains("AN", adaptation.Aggregates.Keys);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360IndExcluded);

        // Family 1's rules DO carry IND (relevance 2, base_weight 0.1); with no aggregate for it, F06 skips
        // it and the family scores on its other variables alone.
        Assert.Contains(Rules.Family(1).V360Rules, r => r.Code == "IND");
        var scored = CareerFitFormulas.CalculateCareerFit360(adaptation.Aggregates, Rules.Family(1).V360Rules);
        Assert.DoesNotContain("IND", scored.Variables.Keys);
        Assert.Equal(100.0, scored.Score);
    }

    /// <summary>Excluding IND must not leave any family with nothing to score on — every scorable family still has at least one non-excluded BASE rule with weight.</summary>
    [Fact]
    public void Excluding_IND_leaves_every_scorable_family_with_weighted_360_rules()
    {
        foreach (var family in Rules.ScorableFamilies)
        {
            var remaining = family.V360Rules
                .Where(r => r.UseMode == "BASE" && r.Relevance > 0 && !V360Aggregation.ExcludedInV1.Contains(r.Code))
                .ToList();
            Assert.NotEmpty(remaining);
            Assert.True(remaining.Sum(r => r.BaseWeight * r.Relevance) > 0, $"family {family.FamilyId}");
        }
    }

    /// <summary>
    /// P35 — the student's own forced ranking of 20 areas — is TIMS open question 5 ("does P35 enter the
    /// score at 0.10?"). The adapter does not decide it. It recognises the ranking, records that it was not
    /// scored, and leaves the weight entirely to the rule set: RANK carries base_weight 0 in the catalogue
    /// and appears in NO family's v360_rules in 1.0.0-draft.1, so it contributes nothing today. If TIMS
    /// answers yes, that is a rule-set change, not a code change here.
    /// </summary>
    [Fact]
    public void P35_RANK_is_left_to_the_rule_set_and_contributes_nothing_under_1_0_0_draft_1()
    {
        Assert.Equal(0.0, Rules.V360Variables.Single(v => v.Code == "RANK").BaseWeight);
        Assert.DoesNotContain(Rules.Families.SelectMany(f => f.V360Rules), r => r.Code == "RANK");

        var adaptation = Adapt(Rater(
            "self",
            Item(1, "AN", 4),
            new ScoringResponse(35, "ranking", "RANK", null,
                [new RankingEntry("Ingeniería", 1), new RankingEntry("Derecho", 2)], null, null)));

        Assert.DoesNotContain("RANK", adaptation.Aggregates.Keys);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360RankNotScored);
        // and the rest of the student's 360 is unaffected by the ranking being present
        Assert.Equal(75.0, adaptation.Aggregates["AN"].Score);
    }

    // ------------------------------------------------------------------ fail-safe / fail-closed

    /// <summary>An unknown rater group type never becomes an engine source; it is recorded and its answers are ignored.</summary>
    [Fact]
    public void An_unknown_rater_group_type_is_recorded_and_contributes_nothing()
    {
        var adaptation = Adapt(Rater("self", Item(1, "AN", 5)), Rater("mentor", Item(1, "AN", 1)));

        Assert.Equal(100.0, adaptation.Aggregates["AN"].Score);
        Assert.Equal(1, adaptation.Variables.Single(v => v.Code == "AN").ValidSources);
        Assert.Contains(adaptation.Warnings, w => w.Code == InputWarningCodes.V360RaterGroupUnknown && w.Message.Contains("mentor"));
    }

    /// <summary>A likert rating outside 1..5 is a data error, not something to repair: F01's domain is 1..5 and a substituted value would invent an answer. Fail closed, naming the variable.</summary>
    [Fact]
    public void A_rating_outside_the_likert_domain_fails_closed()
    {
        var error = Assert.Throws<CareerFitInputException>(() => Adapt(Rater("self", Item(1, "AN", 7))));
        Assert.Equal(InputInstruments.V360, error.Instrument);
        Assert.Equal(InputWarningCodes.V360ResponseOutOfRange, error.Code);
        Assert.Contains("AN", error.Message);
    }

    /// <summary>Aggregates come out in the rule set's declared variable order, not in hash order: F06 accumulates weighted means in sequence and bit-parity depends on the order being the file's.</summary>
    [Fact]
    public void Aggregates_are_produced_in_the_rule_sets_declared_variable_order()
    {
        // Fed in reverse catalogue order on purpose.
        var adaptation = Adapt(Rater("self", Item(3, "OA", 5), Item(2, "AST", 4), Item(1, "AN", 3)));

        var catalogue = Rules.V360Variables.Select(v => v.Code).ToList();
        var produced = adaptation.Aggregates.Keys.ToList();
        Assert.Equal(["AN", "AST", "OA"], produced);
        Assert.Equal(produced.OrderBy(c => catalogue.IndexOf(c)).ToList(), produced);
        Assert.Equal(produced, adaptation.Variables.Select(v => v.Code).ToList());
    }

    // ------------------------------------------------------------------ the fail-closed resolver rule

    /// <summary>
    /// FM-CF-009's rule still fires: a family whose v360_rules name a code outside rules.v360_variables is
    /// rejected at load, with the family and the field named. Confirmed here because FM-CF-008 is the slice
    /// that makes those codes load-bearing.
    /// </summary>
    [Fact]
    public void A_family_referencing_an_unknown_360_code_is_rejected_by_the_resolver()
    {
        var poisoned = Rules with
        {
            Families = Rules.Families
                .Select(f => f.FamilyId != 1
                    ? f
                    : f with { V360Rules = [.. f.V360Rules, new V360Rule("NOT_A_VARIABLE", "BASE", 2, 0.05)] })
                .ToList(),
        };

        var problems = FormMaps.Application.CareerFit.Resolver.CareerFitRulesResolver.Check(poisoned);
        Assert.Contains(problems, p => p.FamilyId == 1
            && p.Field == "v360_rules.NOT_A_VARIABLE"
            && p.Message.Contains("unknown 360 code"));
    }
}
