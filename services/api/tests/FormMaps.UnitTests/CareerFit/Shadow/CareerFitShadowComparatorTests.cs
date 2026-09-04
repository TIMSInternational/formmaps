using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Shadow;
using Xunit;

namespace FormMaps.UnitTests.CareerFit.Shadow;

/// <summary>
/// FM-CF-013. The shadow comparator on synthetic paired results: the two metrics, and above all the
/// classification of a disagreement BY CAUSE.
/// </summary>
/// <remarks>
/// <para>
/// EVERY PAIR HERE IS SYNTHETIC. There is no production database access from this repository and no real
/// student in any local one, so what these tests prove is that the CLASSIFIER answers correctly on
/// inputs whose answer is known by construction. They prove nothing whatsoever about whether the ported
/// engine agrees with the legacy scorer — that is what running the job against a real cohort is for, and
/// it has not been done (see docs/careerfit/careerfit-shadow-report.md, "What this is not").
/// </para>
/// <para>
/// RED FIRST. Each test whose name says "…_not_…" or "…_rather_than_…" was run against the naive reading
/// it names, with the naive code actually in place, and observed to FAIL before the classifier was
/// written to its stated rule. The naive readings, and what each produced, are recorded in the session
/// report; the three load-bearing ones are: classifying every defaulted-competency disagreement as
/// INPUT_COVERAGE regardless of unjoined names; treating a family legacy never mentioned as a large rank
/// delta; and correlating a graph-2 run with legacy at all.
/// </para>
/// </remarks>
public sealed class CareerFitShadowComparatorTests
{
    private static readonly CareerFitShadowProjection Projection = ShadowPairs.CompleteProjection();
    private static readonly IReadOnlyDictionary<int, IReadOnlyList<int>> AllCompetencies = ShadowPairs.FamilyCompetencies();

    // ---------------------------------------------------------------- the two metrics

    /// <summary>Identical orderings correlate at exactly 1 and share all three top places.</summary>
    [Fact]
    public void Two_identical_orderings_correlate_at_one_and_overlap_fully_at_top_three()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.LegacyMirroring(absolutes), Projection, AllCompetencies);

        Assert.True(comparison.Comparable);
        Assert.Equal(1.0, comparison.SpearmanRho!.Value, 12);
        Assert.Equal(3, comparison.TopThreeOverlap);
        Assert.Equal(CareerFitShadowCause.Agreement, comparison.PrimaryCause);
        Assert.Empty(comparison.Disagreements);
    }

    /// <summary>A perfectly reversed legacy ordering correlates at −1 and shares none of the top three.</summary>
    [Fact]
    public void A_reversed_legacy_ordering_correlates_at_minus_one_and_overlaps_at_none()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var reversed = absolutes.ToDictionary(e => e.Key, e => 100.0 - e.Value);

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.LegacyMirroring(reversed), Projection, AllCompetencies);

        Assert.Equal(-1.0, comparison.SpearmanRho!.Value, 12);
        Assert.Equal(0, comparison.TopThreeOverlap);
    }

    /// <summary>
    /// Spearman uses MIDRANKS, not competition ranks. With a tied pair the two are different numbers, and
    /// the competition reading ("1, 2, 2, 4") is not a rank vector any correlation is defined over — it
    /// double-counts the tied position and shifts every rank below it. Proven red against the competition
    /// reading, which returned a different rho for the same data.
    /// </summary>
    [Fact]
    public void Spearman_uses_midranks_so_a_tie_does_not_shift_the_ranks_below_it()
    {
        // Two series identical except that the right one ties its top two. Under midranks the tied pair
        // shares rank 1.5 and everything below keeps its place, so the correlation stays high; under
        // competition ranks the tie would push the third element from 3 to 3 while the tied pair reads
        // 2 and 2, changing the vector's spacing.
        var left = new double[] { 10, 9, 8, 7 };
        var right = new double[] { 10, 10, 8, 7 };

        var rho = CareerFitShadowComparator.Spearman(left, right)!.Value;

        // Midranks: left = [1,2,3,4], right = [1.5,1.5,3,4]; covariance 4.5 over sqrt(5 × 4.5).
        Assert.Equal(4.5 / Math.Sqrt(5.0 * 4.5), rho, 12);
    }

    /// <summary>A side that gives every family the same value has no ordering, so rho is undefined — not zero.</summary>
    [Fact]
    public void A_degenerate_side_yields_no_correlation_rather_than_a_correlation_of_zero()
    {
        Assert.Null(CareerFitShadowComparator.Spearman([1, 2, 3], [5, 5, 5]));

        var absolutes = ShadowPairs.DescendingAbsolutes();
        var flat = ShadowPairs.Legacy([.. ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", 50.0))]);

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), flat, Projection, AllCompetencies);

        Assert.False(comparison.Comparable);
        Assert.Equal(CareerFitShadowCause.Tie, comparison.PrimaryCause);
        Assert.Null(comparison.SpearmanRho);
        Assert.Null(comparison.TopThreeOverlap);
    }

    /// <summary>A family's legacy value is its BEST program's score, not the mean of its programs.</summary>
    [Fact]
    public void A_familys_legacy_value_is_its_best_program_not_the_mean_of_its_programs()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Family 14 has one excellent program and nine poor ones; family 1 has one good program. Under the
        // MAX rule family 14 leads legacy; under a MEAN rule the nine poor programs would bury it.
        var careers = new List<(string, double)> { ("Cluster_1", 80.0), ("Cluster_14", 95.0) };
        careers.AddRange(Enumerable.Range(0, 9).Select(_ => ("Cluster_14", 10.0)));
        for (var id = 2; id <= 13; id++)
        {
            careers.Add(($"Cluster_{id}", 50.0 - id));
        }

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.Legacy([.. careers]), Projection, AllCompetencies);

        var family14 = comparison.LegacyRanking.Single(f => f.FamilyId == 14);
        Assert.Equal(1, family14.Rank);
        Assert.Equal(10, family14.Evidence);
    }

    // ---------------------------------------------------------------- pair-level verdicts

    /// <summary>
    /// A run scored on DISC graph 2 is not compared AT ALL. Legacy is fed graph 1 and the adapters default
    /// to graph 1 for exactly this reason; correlating a graph-2 run measures the graph, not the port.
    /// Proven red against the version with no graph gate, which happily produced a rho of 1.0 for a run
    /// the comparison has no business reading.
    /// </summary>
    [Fact]
    public void A_run_on_a_graph_other_than_one_is_not_compared_rather_than_correlated()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, graph: DiscGraphChoice.UnderPressure),
            ShadowPairs.LegacyMirroring(absolutes),
            Projection,
            AllCompetencies);

        Assert.False(comparison.Comparable);
        Assert.Equal(CareerFitShadowCause.DiscGraphMismatch, comparison.PrimaryCause);
        Assert.Null(comparison.SpearmanRho);
    }

    /// <summary>A locked legacy answer is recorded as an incomparable pair, never skipped and never correlated.</summary>
    [Fact]
    public void A_locked_legacy_answer_is_recorded_as_incomparable_rather_than_skipped()
    {
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(ShadowPairs.DescendingAbsolutes()),
            LegacyCareerRanking.LockedFor("student-1"),
            Projection,
            AllCompetencies);

        Assert.False(comparison.Comparable);
        Assert.Equal(CareerFitShadowCause.LegacyLocked, comparison.PrimaryCause);
        Assert.Equal("student-1", comparison.UserId);
    }

    /// <summary>
    /// An INCOMPLETE projection makes the pair incomparable rather than correlating over the two families
    /// that happened to map. Two points produce a rho of exactly ±1 whatever the data says, which would be
    /// a headline number manufactured by the projection's coverage. Proven red against the version with no
    /// minimum, which returned rho = 1.0 over two mapped families and called the pair comparable.
    /// </summary>
    [Fact]
    public void An_incomplete_projection_makes_the_pair_incomparable_rather_than_correlating_over_two_families()
    {
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(ShadowPairs.DescendingAbsolutes()),
            ShadowPairs.Legacy(("Cluster_1", 90.0), ("Cluster_2", 80.0), ("Unknown_Cluster", 70.0)),
            Projection,
            AllCompetencies);

        Assert.False(comparison.Comparable);
        Assert.Equal(CareerFitShadowCause.TaxonomyUnmapped, comparison.PrimaryCause);
        Assert.Equal(["Unknown_Cluster"], comparison.UnmappedClusters);
    }

    /// <summary>The shipped projection is incomplete, and the comparator must fail closed on it rather than invent a number.</summary>
    [Fact]
    public void The_shipped_projection_is_incomplete_and_yields_no_metrics()
    {
        var shipped = CareerFitShadowProjection.Embedded;
        Assert.True(shipped.IsIncomplete);

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(ShadowPairs.DescendingAbsolutes()),
            ShadowPairs.Legacy(("Social_and_Behavioral_Sciences", 90.0), ("Engineering", 80.0)),
            shipped,
            AllCompetencies);

        Assert.False(comparison.Comparable);
        Assert.Equal(CareerFitShadowCause.TaxonomyUnmapped, comparison.PrimaryCause);
        Assert.Contains("Engineering", comparison.UnmappedClusters);
    }

    // ---------------------------------------------------------------- family-level causes

    /// <summary>
    /// A family legacy never mentioned is an ABSENCE OF EVIDENCE, classified TAXONOMY_NO_LEGACY_EVIDENCE,
    /// and only where it actually moves a metric (inside the engine's top three). Proven red against the
    /// naive reading that treated an unranked legacy side as rank 15 — which reported eleven UNEXPLAINED
    /// disagreements for a student legacy simply had no opinion about.
    /// </summary>
    [Fact]
    public void A_family_legacy_never_mentioned_is_an_absence_of_evidence_not_an_unexplained_disagreement()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Legacy mentions families 3..14 only: the engine's top two (1 and 2) get no legacy evidence.
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes),
            ShadowPairs.Legacy([.. Enumerable.Range(3, 12).Select(id => ($"Cluster_{id}", 80.0 - id))]),
            Projection,
            AllCompetencies);

        Assert.True(comparison.Comparable);
        var absent = comparison.Disagreements.Where(d => d.Cause == CareerFitShadowCause.TaxonomyNoLegacyEvidence).ToList();
        Assert.Equal([1, 2], absent.Select(d => d.FamilyId));
        Assert.DoesNotContain(comparison.Disagreements, d => d.Cause == CareerFitShadowCause.Unexplained);
    }

    /// <summary>
    /// A family whose competencies were all measured, with full legacy evidence and no tie, is the only
    /// thing that may read UNEXPLAINED — the bucket that may indicate a port defect.
    /// </summary>
    [Fact]
    public void A_move_with_full_evidence_and_no_tie_is_the_only_unexplained_bucket()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Legacy agrees about everything except family 14, which it puts first.
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.Legacy(careers), Projection, AllCompetencies);

        var unexplained = Assert.Single(comparison.Disagreements, d => d.Cause == CareerFitShadowCause.Unexplained);
        Assert.Equal(14, unexplained.FamilyId);
        Assert.Equal(14, unexplained.EngineRank);
        Assert.Equal(1, unexplained.LegacyRank);
        Assert.Equal(13, unexplained.RankDelta);
        Assert.Equal(CareerFitShadowCause.Unexplained, comparison.PrimaryCause);
    }

    /// <summary>
    /// The SAME move becomes INPUT_COVERAGE once the family scores a competency the student's report did
    /// not carry: a family scored on a defaulted level 0 is not evidence about the port.
    /// </summary>
    [Fact]
    public void The_same_move_is_input_coverage_when_the_family_scores_a_competency_the_report_lacked()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, ShadowPairs.DefaultedQuality(7)),
            ShadowPairs.Legacy(careers),
            Projection,
            ShadowPairs.FamilyCompetencies((14, [7, 8, 9])));

        var disagreement = Assert.Single(comparison.Disagreements);
        Assert.Equal(CareerFitShadowCause.InputCoverage, disagreement.Cause);
        Assert.Contains("7", disagreement.Explanation);
    }

    /// <summary>
    /// And the same move again becomes NAME_JOIN once the report carried a competency name that joins no
    /// catalogue entry — the defaulted id exists BECAUSE of the join, so the finding is about the data, not
    /// about coverage and certainly not about the port. Proven red against the classifier that decided
    /// INPUT_COVERAGE from the defaulted ids alone and never looked at the unjoined names, which reported
    /// this pair as a coverage gap and sent nobody to look at the name table.
    /// </summary>
    [Fact]
    public void A_defaulted_competency_caused_by_an_unjoined_name_is_a_name_join_not_a_coverage_gap()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();

        var quality = ShadowPairs.DefaultedQuality(7).WithUnknownNames("LIDERAZGO ESTRATÉGICO");

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, quality),
            ShadowPairs.Legacy(careers),
            Projection,
            ShadowPairs.FamilyCompetencies((14, [7, 8, 9])));

        var disagreement = Assert.Single(comparison.Disagreements);
        Assert.Equal(CareerFitShadowCause.NameJoin, disagreement.Cause);
        Assert.Contains("LIDERAZGO ESTRATÉGICO", disagreement.Explanation);
    }

    /// <summary>
    /// A defaulted competency that THIS family does not score explains nothing about THIS family. The
    /// attribution is per family, from the family's own rules, not per run — otherwise one missing
    /// competency would excuse every disagreement in the cohort.
    /// </summary>
    [Fact]
    public void A_defaulted_competency_the_family_does_not_score_does_not_excuse_its_move()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, ShadowPairs.DefaultedQuality(7)),
            ShadowPairs.Legacy(careers),
            Projection,
            ShadowPairs.FamilyCompetencies((14, [8, 9])));   // family 14 does not score competency 7

        var disagreement = Assert.Single(comparison.Disagreements);
        Assert.Equal(CareerFitShadowCause.Unexplained, disagreement.Cause);
    }

    /// <summary>
    /// THE ABSENT 360 IS NOT A PER-FAMILY CAUSE. It contributes the same constant to every family, so it
    /// cannot explain why one family moved; recording it per family would let a real port defect hide
    /// behind the largest caveat in the project. It is a pair-level annotation instead. Proven red against
    /// the classifier that read V360Sources.NoData as INPUT_COVERAGE, under which EVERY disagreement in
    /// every run — every student until FM-CF-006 seeds the items — was explained away and the UNEXPLAINED
    /// bucket was empty by construction.
    /// </summary>
    [Fact]
    public void The_absent_360_is_a_pair_level_caveat_and_never_a_family_level_cause()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies.Select(id => ($"Cluster_{id}", id == 14 ? 99.0 : 80.0 - id)).ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, ShadowPairs.CleanQuality().WithNoV360()),
            ShadowPairs.Legacy(careers),
            Projection,
            AllCompetencies);

        Assert.Equal([InputInstruments.V360], comparison.UniformlyDeflatedInstruments);
        Assert.DoesNotContain(comparison.Disagreements, d => d.Cause == CareerFitShadowCause.InputCoverage);
        Assert.Equal(CareerFitShadowCause.Unexplained, Assert.Single(comparison.Disagreements).Cause);
    }

    /// <summary>A tie across a family's position makes its rank indeterminate, so the delta is a tie-break artefact.</summary>
    [Fact]
    public void A_tie_across_a_familys_position_is_classified_as_a_tie_not_as_a_disagreement()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Legacy puts families 13 and 14 — the engine's last two — jointly first, so both move far enough
        // to be reported and both are tied. Everything else keeps its order and moves two places, below
        // the threshold.
        var careers = ShadowPairs.ScorableFamilies
            .Select(id => ($"Cluster_{id}", id >= 13 ? 99.0 : 80.0 - id))
            .ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.Legacy(careers), Projection, AllCompetencies);

        Assert.True(comparison.Comparable);
        Assert.Equal([13, 14], comparison.Disagreements.Select(d => d.FamilyId).Order());
        Assert.All(comparison.Disagreements, d => Assert.Equal(CareerFitShadowCause.Tie, d.Cause));
        Assert.Equal(CareerFitShadowCause.Tie, comparison.PrimaryCause);
    }

    /// <summary>Top-3 overlap keeps its declared 0–3 range even when a tie makes a side's "top three" wider than three.</summary>
    [Fact]
    public void Top_three_overlap_is_capped_at_three_when_a_tie_widens_a_side()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var careers = ShadowPairs.ScorableFamilies
            .Select(id => ($"Cluster_{id}", id <= 5 ? 90.0 : 80.0 - id))   // five families tied at rank 1
            .ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes), ShadowPairs.Legacy(careers), Projection, AllCompetencies);

        Assert.InRange(comparison.TopThreeOverlap!.Value, 0, 3);
        Assert.Equal(3, comparison.TopThreeOverlap);
    }

    /// <summary>
    /// The pair's headline cause breaks ties TOWARDS Unexplained: under-reporting a possible port defect is
    /// the worse of the two errors this number can make.
    /// </summary>
    [Fact]
    public void The_primary_cause_breaks_a_tie_towards_unexplained()
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();

        // Legacy inverts the two ends: family 14 goes to the top and family 1 to the bottom. Family 14's
        // move is explained by a defaulted competency it scores; family 1's is not.
        var careers = ShadowPairs.ScorableFamilies
            .Select(id => ($"Cluster_{id}", id switch { 14 => 99.0, 1 => 10.0, _ => 80.0 - id }))
            .ToArray();

        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, ShadowPairs.DefaultedQuality(7)),
            ShadowPairs.Legacy(careers),
            Projection,
            ShadowPairs.FamilyCompetencies((14, [7]), (1, [8])));

        Assert.Equal(2, comparison.Disagreements.Count);
        Assert.Equal(CareerFitShadowCause.Unexplained, comparison.PrimaryCause);
    }

    // ---------------------------------------------------------------- the row that gets written

    /// <summary>Every persisted cause spelling round-trips, so a row this build writes is a row this build can read.</summary>
    [Fact]
    public void Every_cause_round_trips_through_its_persisted_spelling()
    {
        foreach (var cause in Enum.GetValues<CareerFitShadowCause>())
        {
            Assert.Equal(cause, CareerFitShadowCauses.FromPersistedValue(cause.ToPersistedValue()));
        }
    }

    /// <summary>
    /// The metrics and the comparable flag agree, which is what the table's
    /// careerfit_shadow_comparisons_metrics_match_comparable_check enforces at the database. Asserted here
    /// too so a comparator change that broke it fails in a unit test rather than as a 23514 mid-cohort.
    /// </summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void A_comparable_pair_always_carries_both_metrics_and_an_incomparable_one_carries_neither(bool comparable)
    {
        var absolutes = ShadowPairs.DescendingAbsolutes();
        var comparison = CareerFitShadowComparator.Compare(
            ShadowPairs.Run(absolutes, graph: comparable ? DiscGraphChoice.WorkAdaptation : DiscGraphChoice.Natural),
            ShadowPairs.LegacyMirroring(absolutes),
            Projection,
            AllCompetencies);

        Assert.Equal(comparable, comparison.Comparable);
        Assert.Equal(comparable, comparison.SpearmanRho is not null);
        Assert.Equal(comparable, comparison.TopThreeOverlap is not null);
    }
}
