using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Application.CareerFit.Shadow;

// FM-CF-013. The comparison's value types and, above all, its CAUSE taxonomy.
//
// WHY A TAXONOMY AND NOT ONE DELTA. The manifest asks for "rank correlation and top-3 overlap"; a
// single undifferentiated disagreement number would answer it and mean almost nothing, because in
// this cohort most disagreements are known in advance NOT to be port defects:
//
//   * The legacy scorer ranks ~370 PROGRAMS by cluster; the engine ranks 14 FAMILIES. Everything
//     depends on a cluster -> family projection nobody has ratified (TAXONOMY_UNMAPPED,
//     TAXONOMY_NO_LEGACY_EVIDENCE).
//   * Real PCA reports carry FEWER than 24 competencies (13 of 24 and 0 of 24 have both been
//     observed), and three printed competency names do not join the catalogue at all. A family whose
//     rules score a competency the report never printed is being scored on a defaulted level 0
//     (INPUT_COVERAGE), and one whose defaulted id exists because a NAME did not join is a data
//     problem in the report, not in the port (NAME_JOIN).
//   * Ties at the top-3 boundary make "top-3 overlap" ambiguous on either side (TIE).
//   * A run scored on a DISC graph other than graph 1 is not comparable to legacy at all
//     (DISC_GRAPH_MISMATCH) — legacy is fed graph 1, the adapters default to graph 1 for exactly this
//     reason, and comparing under another graph measures the graph, not the port.
//
// UNEXPLAINED is therefore the only bucket that may indicate a port defect, and the report's headline
// number is its count. Everything else is a finding about the DATA or about the COMPARISON, and
// mixing them would produce a number that looks like a verdict on the engine and is not one.
//
// WHAT IS DELIBERATELY NOT A CAUSE. The absent 360 (FM-CF-006) and the resulting constant 30% of
// model weight are NOT a per-family cause, even though they are the single largest caveat on the
// whole exercise. They apply identically to every family, so they deflate every CareerFitAbsolute by
// the same term and cannot explain why family A outranks family B. Recording them per family would
// let a real port defect hide behind them. They are a PAIR-level annotation
// (<see cref="CareerFitShadowComparison.UniformlyDeflatedInstruments"/>) and a paragraph in the
// report, which is where a caveat that applies to everything belongs.

/// <summary>Why an engine/legacy disagreement looks the way it does. Persisted by name — add, never rename.</summary>
public enum CareerFitShadowCause
{
    /// <summary>No disagreement worth classifying. On a pair: the two rankings agree within the comparator's threshold.</summary>
    Agreement,

    /// <summary>The student has no cached legacy answer at all. Pair-level; not comparable.</summary>
    LegacyAbsent,

    /// <summary>Legacy answered <c>locked</c>, or its cached answer held no scorable career. Pair-level; not comparable.</summary>
    LegacyLocked,

    /// <summary>The run was scored on a DISC graph other than graph 1, which legacy is fed. Pair-level; not comparable.</summary>
    DiscGraphMismatch,

    /// <summary>
    /// Legacy scored the student but the engine could not: an instrument the engine requires is missing or
    /// unrepairable (<see cref="CareerFitInputException"/>). Pair-level; not comparable, and a finding in
    /// its own right — it is the population the port would refuse to serve on the day of the flip.
    /// </summary>
    EngineNotScorable,

    /// <summary>The projection could not land legacy evidence on enough families. Pair-level; not comparable.</summary>
    TaxonomyUnmapped,

    /// <summary>Family-level: the projection landed no legacy career on THIS family, so legacy expressed no opinion about it.</summary>
    TaxonomyNoLegacyEvidence,

    /// <summary>Family-level: this family scores a competency the student's report did not carry, so it was scored on a defaulted level 0.</summary>
    InputCoverage,

    /// <summary>Family-level: as <see cref="InputCoverage"/>, but the competency is missing because a PRINTED NAME did not join the catalogue.</summary>
    NameJoin,

    /// <summary>Family-level: one of the two rankings ties across this family's position, so its rank is not determinate.</summary>
    Tie,

    /// <summary>Family-level: nothing above explains it. The only bucket that may indicate a port defect.</summary>
    Unexplained,
}

/// <summary>Persisted spellings for <see cref="CareerFitShadowCause"/> — the strings the table's CHECK constraint admits.</summary>
public static class CareerFitShadowCauses
{
    /// <summary>The SCREAMING_SNAKE spelling stored in <c>careerfit_shadow_comparisons."primaryCause"</c> and in the jsonb.</summary>
    public static string ToPersistedValue(this CareerFitShadowCause cause) => cause switch
    {
        CareerFitShadowCause.Agreement => "AGREEMENT",
        CareerFitShadowCause.LegacyAbsent => "LEGACY_ABSENT",
        CareerFitShadowCause.LegacyLocked => "LEGACY_LOCKED",
        CareerFitShadowCause.DiscGraphMismatch => "DISC_GRAPH_MISMATCH",
        CareerFitShadowCause.EngineNotScorable => "ENGINE_NOT_SCORABLE",
        CareerFitShadowCause.TaxonomyUnmapped => "TAXONOMY_UNMAPPED",
        CareerFitShadowCause.TaxonomyNoLegacyEvidence => "TAXONOMY_NO_LEGACY_EVIDENCE",
        CareerFitShadowCause.InputCoverage => "INPUT_COVERAGE",
        CareerFitShadowCause.NameJoin => "NAME_JOIN",
        CareerFitShadowCause.Tie => "TIE",
        CareerFitShadowCause.Unexplained => "UNEXPLAINED",
        _ => throw new ArgumentOutOfRangeException(nameof(cause), cause, "Unmapped shadow cause."),
    };

    /// <summary>The inverse of <see cref="ToPersistedValue"/>; throws on a value this build does not know.</summary>
    public static CareerFitShadowCause FromPersistedValue(string value) => value switch
    {
        "AGREEMENT" => CareerFitShadowCause.Agreement,
        "LEGACY_ABSENT" => CareerFitShadowCause.LegacyAbsent,
        "LEGACY_LOCKED" => CareerFitShadowCause.LegacyLocked,
        "DISC_GRAPH_MISMATCH" => CareerFitShadowCause.DiscGraphMismatch,
        "ENGINE_NOT_SCORABLE" => CareerFitShadowCause.EngineNotScorable,
        "TAXONOMY_UNMAPPED" => CareerFitShadowCause.TaxonomyUnmapped,
        "TAXONOMY_NO_LEGACY_EVIDENCE" => CareerFitShadowCause.TaxonomyNoLegacyEvidence,
        "INPUT_COVERAGE" => CareerFitShadowCause.InputCoverage,
        "NAME_JOIN" => CareerFitShadowCause.NameJoin,
        "TIE" => CareerFitShadowCause.Tie,
        "UNEXPLAINED" => CareerFitShadowCause.Unexplained,
        _ => throw new ArgumentOutOfRangeException(nameof(value), value, "Unknown persisted shadow cause."),
    };

    /// <summary>
    /// True for the five verdicts that make a comparison impossible rather than merely disagreeing. Note
    /// the one asymmetry: <see cref="CareerFitShadowCause.Tie"/> is normally a FAMILY-level cause, but the
    /// comparator also uses it as a pair verdict in the degenerate case where one whole side gives every
    /// common family the same value — an ordering with no order, whose correlation is undefined rather
    /// than zero. That case is identified by <c>Comparable == false</c>, which is what the report keys on.
    /// </summary>
    public static bool IsPairLevel(this CareerFitShadowCause cause) => cause is
        CareerFitShadowCause.LegacyAbsent or CareerFitShadowCause.LegacyLocked
        or CareerFitShadowCause.DiscGraphMismatch or CareerFitShadowCause.TaxonomyUnmapped
        or CareerFitShadowCause.EngineNotScorable;
}

/// <summary>One family's position on one side of the comparison.</summary>
/// <param name="FamilyId">The CareerFit family.</param>
/// <param name="Rank">1 = best. Null when that side expressed no opinion about this family.</param>
/// <param name="Evidence">
/// How many legacy careers projected onto the family (legacy side), or 1 (engine side, which always
/// scores each family exactly once). Zero on the legacy side is what
/// <see cref="CareerFitShadowCause.TaxonomyNoLegacyEvidence"/> names.
/// </param>
/// <param name="Tied">True when this side's ordering value is shared with another family, so the rank is not determinate.</param>
public sealed record ShadowRankedFamily(int FamilyId, int? Rank, int Evidence, bool Tied);

/// <summary>One family where the two rankings disagree by at least the comparator's threshold, with its cause.</summary>
/// <param name="FamilyId">The family.</param>
/// <param name="EngineRank">The engine's rank for it (1 = best), null when unranked.</param>
/// <param name="LegacyRank">The projected legacy rank for it, null when legacy expressed no opinion.</param>
/// <param name="RankDelta">EngineRank − LegacyRank; null when either side has no rank.</param>
/// <param name="Cause">The classification — see <see cref="CareerFitShadowCause"/>'s header for the order it is decided in.</param>
/// <param name="Explanation">One sentence naming the specific evidence, e.g. which competency id was defaulted.</param>
public sealed record ShadowFamilyDisagreement(
    int FamilyId,
    int? EngineRank,
    int? LegacyRank,
    int? RankDelta,
    CareerFitShadowCause Cause,
    string Explanation);

/// <summary>
/// One measured pair: the engine's family ranking, the legacy answer projected onto the same families,
/// the two metrics, and every disagreement classified. This is exactly one row of
/// <c>careerfit_shadow_comparisons</c>.
/// </summary>
/// <param name="UserId">The student.</param>
/// <param name="SchoolId">The student's tenant at comparison time — the run's own snapshot, never the caller's.</param>
/// <param name="RunId">The persisted run compared, or null when the pair was ruled incomparable before a run existed.</param>
/// <param name="RulesVersion">The rule set the engine side was scored under.</param>
/// <param name="DiscGraph">Which DISC graph fed the engine. Anything but graph 1 makes the pair incomparable.</param>
/// <param name="ComparatorVersion"><see cref="CareerFitShadowComparator.Version"/> at the time of measurement.</param>
/// <param name="ProjectionVersion">The cluster → family projection used.</param>
/// <param name="Comparable">False when a pair-level cause made a comparison impossible; both metrics are then null.</param>
/// <param name="PrimaryCause">The pair-level verdict, or the most common family-level cause among the disagreements, or Agreement.</param>
/// <param name="EngineRanking">The engine's fourteen families in rank order.</param>
/// <param name="LegacyRanking">The projected legacy ranking over the same families.</param>
/// <param name="SpearmanRho">Rank correlation over the families BOTH sides ranked; null when not comparable.</param>
/// <param name="TopThreeOverlap">How many of the engine's top three are also in legacy's top three (0–3); null when not comparable.</param>
/// <param name="Disagreements">Every family whose |rank delta| reached the threshold, classified.</param>
/// <param name="UnmappedClusters">Legacy cluster labels the projection does not assign — the work list for completing it.</param>
/// <param name="UniformlyDeflatedInstruments">
/// Instruments that contributed a constant to EVERY family (360 today, personality if it is ever absent
/// without failing closed). Not a cause — see this file's header — but the caveat the report must carry.
/// </param>
public sealed record CareerFitShadowComparison(
    string UserId,
    string? SchoolId,
    Guid? RunId,
    string RulesVersion,
    DiscGraphChoice? DiscGraph,
    string ComparatorVersion,
    string ProjectionVersion,
    bool Comparable,
    CareerFitShadowCause PrimaryCause,
    IReadOnlyList<ShadowRankedFamily> EngineRanking,
    IReadOnlyList<ShadowRankedFamily> LegacyRanking,
    double? SpearmanRho,
    int? TopThreeOverlap,
    IReadOnlyList<ShadowFamilyDisagreement> Disagreements,
    IReadOnlyList<string> UnmappedClusters,
    IReadOnlyList<string> UniformlyDeflatedInstruments)
{
    /// <summary>When the legacy half was last written by legacy, where the platform records it.</summary>
    public DateTimeOffset? LegacyObservedAt { get; init; }

    /// <summary>
    /// A pair-level sentence that does not belong to any one family — today, which instrument fail-closed
    /// when <see cref="PrimaryCause"/> is <see cref="CareerFitShadowCause.EngineNotScorable"/>. It is
    /// PERSISTED rather than logged on purpose: "legacy could score this student and the engine could not,
    /// because MIL subtest OR was missing" is the single most actionable line the shadow period produces,
    /// and a log line is not evidence a report can count.
    /// </summary>
    public string? Note { get; init; }
}

/// <summary>Persists one <see cref="CareerFitShadowComparison"/>. Append-only: a re-measurement is a new row.</summary>
public interface ICareerFitShadowWriter
{
    /// <summary>Appends the comparison on the caller's writable RLS session and returns the id the database assigned.</summary>
    Task<Guid> WriteAsync(
        Auth.RequestContext context, CareerFitShadowComparison comparison, CancellationToken cancellationToken = default);
}
