namespace FormMaps.Application.CareerFit;

// FM-CF-004. What the engine consumes, in the reference engine's own units: DISC factors 0–100
// (PCAInput), competency levels 0–4 keyed by id 1..24, MIL percentiles 1–99 (MILInput), the eight
// personality poles 0–100 (PersonalityInput) and the per-variable 360 aggregates. Producing these
// from what the platform measures — which DISC graph, competency name→id, LIA percentile tails,
// personality pole split — is FM-CF-005 (adapters); FM-CF-007 produces the 360 aggregates. Range
// checking is CareerFitFormulas.ValidateInputs, which EvaluateOwner deliberately does NOT call
// (neither does the reference's evaluate_owner): the orchestrator validates once per assessment.

/// <summary>DISC factor scores 0–100 (reference PCAInput).</summary>
public sealed record PcaInput(double D, double I, double S, double C)
{
    /// <summary>The score for a factor code ("D", "I", "S", "C"); the reference's getattr(pca, factor).</summary>
    public double Factor(string factor) => factor switch
    {
        "D" => D,
        "I" => I,
        "S" => S,
        "C" => C,
        _ => throw new ArgumentException($"Unknown PCA factor: {factor}", nameof(factor)),
    };
}

/// <summary>MIL subtest percentiles 1–99 (reference MILInput): DC, RZ, VN, MT, OR.</summary>
public sealed record MilInput(int DC, int RZ, int VN, int MT, int OR)
{
    /// <summary>The percentile for a subtest code; the reference's getattr(mil, test).</summary>
    public int Subtest(string subtest) => subtest switch
    {
        "DC" => DC,
        "RZ" => RZ,
        "VN" => VN,
        "MT" => MT,
        "OR" => OR,
        _ => throw new ArgumentException($"Unknown MIL subtest: {subtest}", nameof(subtest)),
    };
}

/// <summary>Personality pole scores 0–100 (reference PersonalityInput; type_code omitted — the engine never reads it).</summary>
public sealed record PersonalityInput(double E, double I, double S, double N, double T, double F, double J, double P)
{
    /// <summary>The score for a pole letter; the reference's getattr(p, preferred_pole).</summary>
    public double Pole(string pole) => pole switch
    {
        "E" => E,
        "I" => I,
        "S" => S,
        "N" => N,
        "T" => T,
        "F" => F,
        "J" => J,
        "P" => P,
        _ => throw new ArgumentException($"Unknown personality pole: {pole}", nameof(pole)),
    };
}

/// <summary>
/// One 360 variable's aggregate across sources (the output of F02–F05 for that variable). A variable
/// with no score is simply absent from the aggregates dictionary — the reference skips
/// <c>agg.get("score") is None</c> and a missing key identically.
/// </summary>
public sealed record V360Aggregate(double Score, double? Consensus = null, double? ConfidenceIndex = null);

/// <summary>Everything evaluate_owner reads from the <c>assessment</c> dict, for one student.</summary>
public sealed record CareerFitAssessment(
    PcaInput Pca,
    IReadOnlyDictionary<int, int> Competencies,
    MilInput Mil,
    PersonalityInput Personality,
    IReadOnlyDictionary<string, V360Aggregate> V360Aggregates,
    Confidence CareerFit360Confidence = Confidence.NotDeterminable);
