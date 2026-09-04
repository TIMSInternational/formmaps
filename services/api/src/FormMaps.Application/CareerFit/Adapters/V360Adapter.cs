using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>
/// One 360 VARIABLE's audit trail: what the aggregate was built from, next to the aggregate itself.
/// <see cref="SourceCoverage"/> is the reference engine's coverage — Σ of the rater-source weights that
/// scored this variable (what F05 consumes) — and is NOT the same quantity as
/// <see cref="ItemsAnswered"/>/<see cref="ItemsExpected"/>, which is how much of the variable's ITEM set
/// the raters actually answered. Both are recorded because they fail differently: a variable scored by
/// one rater on all its items and a variable scored by four raters on one item each are indistinguishable
/// from the score alone.
/// </summary>
public sealed record V360VariableAudit(
    string Code,
    double? Score,
    double? Consensus,
    double? ConfidenceIndex,
    double SourceCoverage,
    int ValidSources,
    int ItemsAnswered,
    int ItemsExpected,
    IReadOnlyList<string> Sources);

/// <summary>The engine's per-variable 360 aggregates, the global 360 confidence, the source that produced them, and the repairs made.</summary>
public sealed record V360Adaptation(
    IReadOnlyDictionary<string, V360Aggregate> Aggregates,
    Confidence Confidence,
    string Source,
    IReadOnlyList<InputWarning> Warnings,
    IReadOnlyList<V360VariableAudit> Variables);

/// <summary>
/// FM-CF-005 / FM-CF-007 — the 360 seam. The engine wants one <see cref="V360Aggregate"/> per 360
/// VARIABLE (the codes in rules.v360_variables) carrying a score, a consensus across raters and a
/// confidence index; the platform's <see cref="ThreeSixtyProfile"/> aggregates at CATEGORY level, which
/// is why it is passed but never read by the aggregating implementation. Two implementations:
/// <see cref="VocationalV360Adapter"/> aggregates the vocational chassis's stored item responses to
/// variable level (FM-CF-007), and <see cref="NoDataV360Adapter"/> is the fallback for a student with no
/// 360 evidence — which, until FM-CF-006 seeds the 40 items, is every student. Deliberately NOT here:
/// F01–F06 arithmetic (CareerFitFormulas.NormalizeLikert / IntegrateSources / Confidence360 /
/// CalculateCareerFit360 — the aggregator calls them, it does not restate them) and per-family
/// relevance weighting (F06, which is evaluate_owner's, not the adapter's).
/// </summary>
public interface IV360Adapter
{
    /// <summary>
    /// Produce the engine's 360 inputs for one student. <paramref name="threeSixty"/> is the platform's
    /// category-level 360 block (null when the student has none); <paramref name="raterGroups"/> is the
    /// student's completed vocational rater groups with their item responses, exactly as the vocational
    /// chassis stores them (null or empty when nothing was answered).
    /// </summary>
    V360Adaptation Adapt(ThreeSixtyProfile? threeSixty, IReadOnlyList<ScoringGroup>? raterGroups);
}

/// <summary>
/// The no-evidence implementation: consults nothing and returns an EMPTY aggregate map with confidence
/// <see cref="Confidence.NotDeterminable"/>. On these inputs the engine behaves exactly as the reference
/// does on a student with no 360: calculate_careerfit360 finds no scored variable → fit 0.0, the 360
/// instrument reads DIVERGENT in convergence_level (the NOT_DETERMINABLE label only ever downgrades a
/// STRONG 360, which 0.0 never is), and career_fit_absolute carries the 360 weight × 0 for EVERY family —
/// the same offset on all of a student's families, so the ranking is untouched and the absolute is
/// uniformly lower. The fact that no 360 evidence was used is on the audit record (V360_NO_DATA), not
/// hidden.
///
/// This is still the registered <see cref="IV360Adapter"/> for as long as the 40 items are absent
/// (FM-CF-006, blocked on TIMS), and it stays the FALLBACK afterwards:
/// <see cref="VocationalV360Adapter"/> delegates here, by name and on purpose, whenever a student's
/// responses yield no scorable variable. A student with no 360 must still score.
/// </summary>
public sealed class NoDataV360Adapter : IV360Adapter
{
    /// <summary>A shared instance; the adapter has no state.</summary>
    public static readonly NoDataV360Adapter Instance = new();

    private static readonly IReadOnlyDictionary<string, V360Aggregate> Empty =
        new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);

    /// <inheritdoc />
    public V360Adaptation Adapt(ThreeSixtyProfile? threeSixty, IReadOnlyList<ScoringGroup>? raterGroups) => Adapt(NoEvidenceReason);

    /// <summary>The no-evidence adaptation, carrying <paramref name="reason"/> as the V360_NO_DATA message so the audit record says WHICH no-evidence case this was.</summary>
    public static V360Adaptation Adapt(string reason) => new(
        Empty,
        Confidence.NotDeterminable,
        V360Sources.NoData,
        [new InputWarning(InputInstruments.V360, InputWarningCodes.V360NoData, reason)],
        []);

    /// <summary>The default V360_NO_DATA message: nothing about this student's 360 was consulted at all.</summary>
    public const string NoEvidenceReason =
        "360 not adapted: no 360 evidence was consulted; aggregates empty, confidence NOT_DETERMINABLE.";
}
