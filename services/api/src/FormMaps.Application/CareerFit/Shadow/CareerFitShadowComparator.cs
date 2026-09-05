using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The comparison itself: pure, I/O-free, deterministic. Given one persisted run, one cached
// legacy answer, one cluster -> family projection and the families' competency rules, it produces the
// row CareerFitShadowWriter appends. Everything that needs a database is CareerFitShadowRunner's.
//
// WHAT IS COMPARED, AND WHY IT IS THE ORDERING. 360 is not seeded (FM-CF-006) and personality can be
// absent, so up to 45% of the model's weight can be constant across every family. CareerFitAbsolute is
// therefore uniformly DEFLATED, and its distance from a legacy 0-100 "totalScore" measures the missing
// instruments rather than the port. A constant term applied to every family cannot reorder them, so the
// ORDERING survives what the values do not. That is the whole reason this class computes rank
// correlation and top-3 overlap and computes no index delta at all: there is no honest one to compute
// today, and a column for it would be read as if there were.
//
// HOW THE LEGACY SIDE BECOMES A FAMILY RANKING. Legacy scores individual programs; each carries a
// cluster; the projection maps a cluster to a family. A family's legacy ordering value is the MAXIMUM
// totalScore among the programs that project onto it -- the family is represented by its best program,
// which is what a student is actually shown and recommended. The mean was rejected: a family whose
// cluster holds many weak programs would be pushed down by programs the student was never shown,
// making the comparator's arithmetic, not either engine, decide the ranking. This is a comparator
// DECISION, it is recorded here rather than buried, and changing it is a ComparatorVersion bump.
//
// SPEARMAN IS COMPUTED OVER THE COMMON SET, WITH MIDRANKS. Only families BOTH sides ranked can enter a
// correlation; a family legacy never mentioned is not a disagreement about ordering, it is an absence
// of evidence, and it is classified as one (TAXONOMY_NO_LEGACY_EVIDENCE). Within the common set each
// side is re-ranked by its own ordering value using MIDRANKS (tied values share their average rank),
// which is the tie-corrected Spearman, and rho is the Pearson correlation of the two rank vectors. The
// competition ranks reported per family (1, 2, 2, 4) are for READING the row; they are not what rho is
// computed from.
//
// Deliberately NOT here: any I/O, any decision about WHICH students to measure (the runner's), any
// re-scoring (the run is read as persisted, under the rules version stored on it), and any judgement
// about whether a disagreement is acceptable -- this class classifies, the report counts, and a human
// decides.

/// <summary>Compares one student's engine ranking against their legacy ranking and classifies every disagreement.</summary>
public static class CareerFitShadowComparator
{
    /// <summary>
    /// The comparator's own version, recorded on every row. Bump it for ANY change to the ordering
    /// value, the disagreement threshold, the classification order or the metric definitions — rows
    /// written under two versions must never be averaged together without saying so.
    /// </summary>
    public const string Version = "v1";

    /// <summary>
    /// How far two ranks must differ before the family is reported as a disagreement. Three positions
    /// out of fourteen: below that, a one- or two-place move is inside what a different-but-correct
    /// tie-break produces, and reporting it would bury the real moves under noise. It is a constant
    /// rather than a parameter so that every row in a cohort was measured the same way, and it is part
    /// of what <see cref="Version"/> pins.
    /// </summary>
    public const int DisagreementThreshold = 3;

    /// <summary>How many top positions the overlap metric considers.</summary>
    public const int TopN = 3;

    /// <summary>
    /// The pair-level verdict for a student who cannot be compared at all — no run, no legacy answer, a
    /// locked legacy answer. Recorded rather than skipped so the report's denominator counts every
    /// student the job looked at, not only the ones that produced a number.
    /// </summary>
    public static CareerFitShadowComparison NotComparable(
        string userId,
        string? schoolId,
        CareerFitShadowCause cause,
        string projectionVersion,
        string rulesVersion,
        DateTimeOffset? legacyObservedAt = null,
        string? note = null) =>
        new(
            UserId: userId,
            SchoolId: schoolId,
            RunId: null,
            RulesVersion: rulesVersion,
            DiscGraph: null,
            ComparatorVersion: Version,
            ProjectionVersion: projectionVersion,
            Comparable: false,
            PrimaryCause: cause,
            EngineRanking: [],
            LegacyRanking: [],
            SpearmanRho: null,
            TopThreeOverlap: null,
            Disagreements: [],
            UnmappedClusters: [],
            UniformlyDeflatedInstruments: [])
        { LegacyObservedAt = legacyObservedAt, Note = note };

    /// <summary>
    /// Compares a persisted run against a cached legacy answer.
    /// </summary>
    /// <param name="run">The engine side, as persisted (never re-scored here).</param>
    /// <param name="legacy">The legacy side, as cached. Null or locked yields an incomparable pair.</param>
    /// <param name="projection">The cluster → family projection; its version is recorded on the row.</param>
    /// <param name="familyScoredCompetencies">
    /// Family id → the competency ids that family's rules actually score, from the resolved rule set. This
    /// is what makes INPUT_COVERAGE a per-FAMILY finding rather than a per-run one: a defaulted competency
    /// only explains a family's position if that family scores it.
    /// </param>
    public static CareerFitShadowComparison Compare(
        CareerFitRun run,
        LegacyCareerRanking? legacy,
        CareerFitShadowProjection projection,
        IReadOnlyDictionary<int, IReadOnlyList<int>> familyScoredCompetencies)
    {
        ArgumentNullException.ThrowIfNull(run);
        ArgumentNullException.ThrowIfNull(projection);
        ArgumentNullException.ThrowIfNull(familyScoredCompetencies);

        if (legacy is null)
        {
            return Incomparable(run, projection, CareerFitShadowCause.LegacyAbsent, [], null);
        }

        if (legacy.Locked || legacy.Careers.Count == 0)
        {
            return Incomparable(run, projection, CareerFitShadowCause.LegacyLocked, [], legacy.ObservedAt);
        }

        // The graph gate comes before any arithmetic. Legacy is fed DISC graph 1 (Work Adaptation) and
        // DiscAdapter defaults to graph 1 precisely so this comparison is apples-to-apples; a run scored
        // on graph 2 or 3 measures the graph, not the port, and correlating it would publish that
        // confusion as a number.
        if (run.DiscGraph != DiscGraphChoice.WorkAdaptation)
        {
            return Incomparable(run, projection, CareerFitShadowCause.DiscGraphMismatch, [], legacy.ObservedAt);
        }

        var (legacyValues, unmappedClusters) = ProjectLegacy(legacy, projection);
        if (legacyValues.Count < projection.MinimumFamiliesForComparison)
        {
            return Incomparable(run, projection, CareerFitShadowCause.TaxonomyUnmapped, unmappedClusters, legacy.ObservedAt);
        }

        var engineValues = run.Families.ToDictionary(f => f.OwnerId, f => f.CareerFitAbsolute);
        var engineRanking = Rank(engineValues, evidence: _ => 1);
        var legacyRanking = Rank(
            legacyValues.ToDictionary(e => e.Key, e => e.Value.Best),
            evidence: familyId => legacyValues[familyId].Count);

        // Families neither side ranked cannot appear on the legacy side at all; carry them explicitly with
        // a null rank so a reader of the row can tell "legacy said nothing about family 7" from "family 7
        // is missing from this document".
        var legacyByFamily = legacyRanking.ToDictionary(r => r.FamilyId);
        var legacyFull = engineRanking
            .Select(e => legacyByFamily.TryGetValue(e.FamilyId, out var l) ? l : new ShadowRankedFamily(e.FamilyId, null, 0, false))
            .OrderBy(r => r.Rank ?? int.MaxValue)
            .ThenBy(r => r.FamilyId)
            .ToList();

        var common = engineRanking
            .Where(e => legacyByFamily.ContainsKey(e.FamilyId))
            .Select(e => e.FamilyId)
            .ToList();

        var rho = Spearman(
            common.Select(f => engineValues[f]).ToList(),
            common.Select(f => legacyValues[f].Best).ToList());

        if (rho is null)
        {
            // One side gave every common family the same value, so it expresses no ordering at all and a
            // correlation with it is undefined (a zero-variance Pearson denominator). Reported as a
            // pair-level TIE rather than as a rho of 0, which would read as "the engines disagree".
            return Incomparable(run, projection, CareerFitShadowCause.Tie, unmappedClusters, legacy.ObservedAt);
        }

        var topThree = OverlapAtTopN(engineRanking, legacyRanking);
        var disagreements = Classify(run, engineRanking, legacyFull, familyScoredCompetencies);

        return new CareerFitShadowComparison(
            UserId: run.UserId,
            SchoolId: run.SchoolId,
            RunId: run.Id,
            RulesVersion: run.RulesVersion,
            DiscGraph: run.DiscGraph,
            ComparatorVersion: Version,
            ProjectionVersion: projection.Version,
            Comparable: true,
            PrimaryCause: PrimaryCauseOf(disagreements),
            EngineRanking: engineRanking,
            LegacyRanking: legacyFull,
            SpearmanRho: rho,
            TopThreeOverlap: topThree,
            Disagreements: disagreements,
            UnmappedClusters: unmappedClusters,
            UniformlyDeflatedInstruments: UniformlyDeflated(run.Quality))
        { LegacyObservedAt = legacy.ObservedAt };
    }

    /// <summary>A family's projected legacy evidence: its best program's score and how many programs reached it.</summary>
    private readonly record struct LegacyFamilyEvidence(double Best, int Count);

    private static (IReadOnlyDictionary<int, LegacyFamilyEvidence> Values, IReadOnlyList<string> Unmapped) ProjectLegacy(
        LegacyCareerRanking legacy, CareerFitShadowProjection projection)
    {
        var values = new Dictionary<int, LegacyFamilyEvidence>();
        var unmapped = new List<string>();
        var seenUnmapped = new HashSet<string>(StringComparer.Ordinal);

        foreach (var career in legacy.Careers)
        {
            if (projection.Map(career.Cluster) is not int familyId)
            {
                // Both "the file does not mention this cluster" and "the file assigns it null on purpose"
                // land here, because in both cases no legacy evidence reaches a family. Only the first is
                // work to do, so only the first is worth listing — Declares() tells them apart.
                if (!projection.Declares(career.Cluster) && seenUnmapped.Add(career.Cluster))
                {
                    unmapped.Add(career.Cluster);
                }

                continue;
            }

            values[familyId] = values.TryGetValue(familyId, out var existing)
                ? new LegacyFamilyEvidence(Math.Max(existing.Best, career.TotalScore), existing.Count + 1)
                : new LegacyFamilyEvidence(career.TotalScore, 1);
        }

        return (values, unmapped);
    }

    /// <summary>
    /// Competition ranking (1, 2, 2, 4) by descending value, ties broken for DISPLAY by family id so the
    /// row is reproducible, and every member of a tied group flagged <c>Tied</c> so a reader — and the
    /// classifier — can tell a determinate position from an arbitrary one.
    /// </summary>
    private static IReadOnlyList<ShadowRankedFamily> Rank(
        IReadOnlyDictionary<int, double> values, Func<int, int> evidence)
    {
        var ordered = values.OrderByDescending(e => e.Value).ThenBy(e => e.Key).ToList();
        var tiedValues = values.GroupBy(e => e.Value).Where(g => g.Count() > 1).Select(g => g.Key).ToHashSet();

        var ranked = new List<ShadowRankedFamily>(ordered.Count);
        var rank = 0;
        var seen = 0;
        double? previous = null;
        foreach (var (familyId, value) in ordered)
        {
            seen++;
            if (previous is null || value != previous.Value)
            {
                rank = seen;
                previous = value;
            }

            ranked.Add(new ShadowRankedFamily(familyId, rank, evidence(familyId), tiedValues.Contains(value)));
        }

        return ranked;
    }

    /// <summary>
    /// Spearman's rho with tie correction: each side is converted to MIDRANKS (a tied group shares the
    /// average of the ranks it spans) and rho is their Pearson correlation. Null when either side has zero
    /// variance — an ordering with no order has no correlation, and returning 0 there would report
    /// disagreement where there is only degeneracy.
    /// </summary>
    public static double? Spearman(IReadOnlyList<double> left, IReadOnlyList<double> right)
    {
        ArgumentNullException.ThrowIfNull(left);
        ArgumentNullException.ThrowIfNull(right);
        if (left.Count != right.Count)
        {
            throw new ArgumentException("Spearman needs two series of the same length.", nameof(right));
        }

        if (left.Count < 2)
        {
            return null;
        }

        var a = MidRanks(left);
        var b = MidRanks(right);
        var meanA = a.Average();
        var meanB = b.Average();

        double covariance = 0, varianceA = 0, varianceB = 0;
        for (var i = 0; i < a.Count; i++)
        {
            var da = a[i] - meanA;
            var db = b[i] - meanB;
            covariance += da * db;
            varianceA += da * da;
            varianceB += db * db;
        }

        if (varianceA <= 0 || varianceB <= 0)
        {
            return null;
        }

        return covariance / Math.Sqrt(varianceA * varianceB);
    }

    private static IReadOnlyList<double> MidRanks(IReadOnlyList<double> values)
    {
        var order = Enumerable.Range(0, values.Count).OrderByDescending(i => values[i]).ToList();
        var ranks = new double[values.Count];
        var position = 0;
        while (position < order.Count)
        {
            var end = position;
            while (end + 1 < order.Count && values[order[end + 1]] == values[order[position]])
            {
                end++;
            }

            // Ranks are 1-based; a group spanning positions p..e shares the average of (p+1)..(e+1).
            var shared = ((position + 1) + (end + 1)) / 2.0;
            for (var i = position; i <= end; i++)
            {
                ranks[order[i]] = shared;
            }

            position = end + 1;
        }

        return ranks;
    }

    /// <summary>
    /// How many families appear in BOTH sides' top <see cref="TopN"/>. "Top N" is every family at rank ≤ N,
    /// which under a tie can be more than N members; the result is capped at N so the metric keeps its
    /// declared 0–3 range, and the tie itself is what <see cref="CareerFitShadowCause.Tie"/> reports.
    /// </summary>
    public static int OverlapAtTopN(
        IReadOnlyList<ShadowRankedFamily> engine, IReadOnlyList<ShadowRankedFamily> legacy)
    {
        var engineTop = engine.Where(f => f.Rank is int r && r <= TopN).Select(f => f.FamilyId).ToHashSet();
        var legacyTop = legacy.Where(f => f.Rank is int r && r <= TopN).Select(f => f.FamilyId).ToHashSet();
        engineTop.IntersectWith(legacyTop);
        return Math.Min(TopN, engineTop.Count);
    }

    /// <summary>
    /// Classification, in a fixed order, most-specific first. The order IS the semantics: a family that
    /// legacy never mentioned is not evidence about the port however far apart the two "ranks" look, and a
    /// competency that never reached the engine explains a family's position before "the port is wrong"
    /// does. UNEXPLAINED is what survives all of it.
    /// </summary>
    private static IReadOnlyList<ShadowFamilyDisagreement> Classify(
        CareerFitRun run,
        IReadOnlyList<ShadowRankedFamily> engine,
        IReadOnlyList<ShadowRankedFamily> legacy,
        IReadOnlyDictionary<int, IReadOnlyList<int>> familyScoredCompetencies)
    {
        var legacyByFamily = legacy.ToDictionary(r => r.FamilyId);
        var defaulted = run.Quality.DefaultedCompetencyIds.ToHashSet();
        var unknownNames = run.Quality.UnknownCompetencyNames;
        var disagreements = new List<ShadowFamilyDisagreement>();

        foreach (var engineFamily in engine)
        {
            var legacyFamily = legacyByFamily[engineFamily.FamilyId];

            if (legacyFamily.Rank is null)
            {
                // Only worth reporting where the absence actually moves a metric: the engine put this
                // family in its top three and legacy has no opinion about it, so the top-3 overlap is
                // being decided by the projection's coverage rather than by either engine. Reporting the
                // other ten as well would make an incomplete projection look like ten disagreements.
                if (engineFamily.Rank is int engineRank && engineRank <= TopN)
                {
                    disagreements.Add(new ShadowFamilyDisagreement(
                        engineFamily.FamilyId, engineRank, null, null,
                        CareerFitShadowCause.TaxonomyNoLegacyEvidence,
                        $"The engine ranks family {engineFamily.FamilyId} at {engineRank}, but no legacy career "
                        + "projected onto it, so legacy expressed no opinion about it. This is the projection's "
                        + "coverage, not a disagreement between the engines."));
                }

                continue;
            }

            if (engineFamily.Rank is not int rank || legacyFamily.Rank is not int legacyRank)
            {
                continue;
            }

            var delta = rank - legacyRank;
            if (Math.Abs(delta) < DisagreementThreshold)
            {
                continue;
            }

            if (engineFamily.Tied || legacyFamily.Tied)
            {
                disagreements.Add(new ShadowFamilyDisagreement(
                    engineFamily.FamilyId, rank, legacyRank, delta, CareerFitShadowCause.Tie,
                    $"Family {engineFamily.FamilyId}'s position is tied on the "
                    + (engineFamily.Tied && legacyFamily.Tied ? "engine and legacy sides"
                        : engineFamily.Tied ? "engine side" : "legacy side")
                    + ", so its rank is not determinate and the delta is an artefact of the tie-break."));
                continue;
            }

            var missing = familyScoredCompetencies.TryGetValue(engineFamily.FamilyId, out var scored)
                ? scored.Where(defaulted.Contains).ToList()
                : [];

            if (missing.Count > 0)
            {
                // NAME_JOIN before INPUT_COVERAGE. An unjoined name has, by definition, no competency id,
                // so which defaulted id it would have become cannot be known from the run — the
                // attribution is at RUN level and is stated as such in the sentence. What is certain is
                // that a report carrying unjoined names has at least that many spurious defaults, and the
                // repair is to the name table, not to the engine.
                var cause = unknownNames.Count > 0 ? CareerFitShadowCause.NameJoin : CareerFitShadowCause.InputCoverage;
                var reason = unknownNames.Count > 0
                    ? $"the student's report carried {unknownNames.Count} competency name(s) that join no catalogue entry "
                      + $"({string.Join(", ", unknownNames)}), and this family scores {missing.Count} competency id(s) "
                      + $"that were defaulted to level 0 ({string.Join(", ", missing)})"
                    : $"this family scores {missing.Count} competency id(s) the report did not carry "
                      + $"({string.Join(", ", missing)}), each defaulted to level 0";

                disagreements.Add(new ShadowFamilyDisagreement(
                    engineFamily.FamilyId, rank, legacyRank, delta, cause,
                    $"Family {engineFamily.FamilyId} moved {Math.Abs(delta)} place(s): {reason}. A data gap, not a port defect."));
                continue;
            }

            disagreements.Add(new ShadowFamilyDisagreement(
                engineFamily.FamilyId, rank, legacyRank, delta, CareerFitShadowCause.Unexplained,
                $"Family {engineFamily.FamilyId} sits at engine rank {rank} and legacy rank {legacyRank} "
                + "with full legacy evidence, no tie and every competency this family scores actually measured. "
                + "Nothing in the inputs or the projection explains it — this is the bucket to investigate."));
        }

        return disagreements;
    }

    /// <summary>
    /// The pair's headline cause: the most frequent family-level cause, ties broken TOWARDS
    /// <see cref="CareerFitShadowCause.Unexplained"/>. Under-reporting a possible port defect is the worse
    /// error of the two, so the tie-break is deliberately not "first in enum order".
    /// </summary>
    private static CareerFitShadowCause PrimaryCauseOf(IReadOnlyList<ShadowFamilyDisagreement> disagreements)
    {
        if (disagreements.Count == 0)
        {
            return CareerFitShadowCause.Agreement;
        }

        return disagreements
            .GroupBy(d => d.Cause)
            .OrderByDescending(g => g.Count())
            .ThenByDescending(g => g.Key == CareerFitShadowCause.Unexplained)
            .ThenBy(g => (int)g.Key)
            .First().Key;
    }

    /// <summary>
    /// Instruments that contributed the SAME term to every family, so they deflate the index without
    /// touching the ordering. Not a cause (see CareerFitShadowComparison's header) — the report carries
    /// them as the caveat on every number in it.
    /// </summary>
    private static IReadOnlyList<string> UniformlyDeflated(InputQuality quality)
    {
        var instruments = new List<string>();
        if (string.Equals(quality.V360Source, V360Sources.NoData, StringComparison.Ordinal))
        {
            instruments.Add(InputInstruments.V360);
        }

        if (quality.Warnings.Any(w => w.Code == InputWarningCodes.PersonalityNoEvidence))
        {
            instruments.Add(InputInstruments.Personality);
        }

        return instruments;
    }

    private static CareerFitShadowComparison Incomparable(
        CareerFitRun run,
        CareerFitShadowProjection projection,
        CareerFitShadowCause cause,
        IReadOnlyList<string> unmappedClusters,
        DateTimeOffset? legacyObservedAt) =>
        new(
            UserId: run.UserId,
            SchoolId: run.SchoolId,
            RunId: run.Id,
            RulesVersion: run.RulesVersion,
            DiscGraph: run.DiscGraph,
            ComparatorVersion: Version,
            ProjectionVersion: projection.Version,
            Comparable: false,
            PrimaryCause: cause,
            EngineRanking: [],
            LegacyRanking: [],
            SpearmanRho: null,
            TopThreeOverlap: null,
            Disagreements: [],
            UnmappedClusters: unmappedClusters,
            UniformlyDeflatedInstruments: UniformlyDeflated(run.Quality))
        { LegacyObservedAt = legacyObservedAt };
}
