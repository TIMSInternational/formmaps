using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>The engine's per-variable 360 aggregates, the global 360 confidence, the source that produced them, and the repairs made.</summary>
public sealed record V360Adaptation(
    IReadOnlyDictionary<string, V360Aggregate> Aggregates,
    Confidence Confidence,
    string Source,
    IReadOnlyList<InputWarning> Warnings);

/// <summary>
/// FM-CF-005 — the 360 seam, interface only. The engine wants one <see cref="V360Aggregate"/> per 360
/// VARIABLE (the 40 codes in rules.v360_variables) with consensus and a confidence label; the platform's
/// <see cref="ThreeSixtyProfile"/> aggregates at CATEGORY level today and the 40 items are not seeded
/// (FM-CF-006, blocked on TIMS). Variable-level aggregation with consensus / coverage / confidence is
/// FM-CF-007; it will add an implementation here that consumes whatever evidence FM-CF-006 makes
/// available. Until then <see cref="NoDataV360Adapter"/> is the only implementation. Deliberately NOT
/// here: F02–F06 arithmetic (CareerFitFormulas.IntegrateSources / Confidence360 / CalculateCareerFit360).
/// </summary>
public interface IV360Adapter
{
    /// <summary>Produce the engine's 360 inputs for one student from the platform's 360 block (null when the student has none).</summary>
    V360Adaptation Adapt(ThreeSixtyProfile? threeSixty);
}

/// <summary>
/// The V1-before-FM-CF-007 implementation: consults nothing and returns an EMPTY aggregate map with
/// confidence <see cref="Confidence.NotDeterminable"/>. On these inputs the engine behaves exactly as the
/// reference does on a student with no 360: calculate_careerfit360 finds no scored variable → fit 0.0,
/// the 360 instrument reads DIVERGENT in convergence_level (the NOT_DETERMINABLE label only ever
/// downgrades a STRONG 360, which 0.0 never is), and career_fit_absolute carries the 360 weight × 0 for
/// EVERY family — the same offset on all of a student's families, so the ranking is untouched and the
/// absolute is uniformly lower. The fact that no 360 evidence was used is on the audit record
/// (V360_NO_DATA), not hidden.
/// </summary>
public sealed class NoDataV360Adapter : IV360Adapter
{
    /// <summary>A shared instance; the adapter has no state.</summary>
    public static readonly NoDataV360Adapter Instance = new();

    private static readonly IReadOnlyDictionary<string, V360Aggregate> Empty =
        new Dictionary<string, V360Aggregate>(StringComparer.Ordinal);

    public V360Adaptation Adapt(ThreeSixtyProfile? threeSixty) => new(
        Empty,
        Confidence.NotDeterminable,
        V360Sources.NoData,
        [
            new InputWarning(
                InputInstruments.V360,
                InputWarningCodes.V360NoData,
                "360 not adapted: no variable-level aggregation exists before FM-CF-007; aggregates empty, confidence NOT_DETERMINABLE."),
        ]);
}
