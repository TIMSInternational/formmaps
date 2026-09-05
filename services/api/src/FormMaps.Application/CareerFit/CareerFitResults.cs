namespace FormMaps.Application.CareerFit;

// FM-CF-004. Typed equivalents of the reference engine's RouteScore / InstrumentResult(.evidence)
// dicts and of the evaluate_owner return dict. Field names follow the reference's keys in PascalCase
// so an audit row (FM-CF-010) or a payload (FM-CF-011) can be diffed against the Python output by
// name. Ordered maps (route components, MIL components, 360 variables, convergence supports) are
// built in the reference's iteration order and exposed as IReadOnlyDictionary backed by
// OrderedDictionary, so enumerating them reproduces the reference's JSON member order.

/// <summary>A weighted observation for <see cref="CareerFitFormulas.WeightedMean"/>; a null Value is dropped, so is a weight ≤ 0.</summary>
public readonly record struct WeightedValue(double? Value, double Weight);

/// <summary>Reference RouteScore: one PCA or personality route's fit and the factor/dimension matches that fed it (declared order).</summary>
public sealed record RouteScore(string RouteId, double Score, IReadOnlyDictionary<string, double> Components);

/// <summary>A CRITICAL competency below its required level (reference critical_gaps entry).</summary>
public sealed record CriticalGap(int CompetencyId, int Level, int Required);

/// <summary>A DIFFERENTIATOR competency at level ≥ 3 (reference differentiators entry; report-only, never scored).</summary>
public sealed record Differentiator(int CompetencyId, int Level);

/// <summary>calculate_competencies: F14 fit, COMP_GATE, and the evidence dict.</summary>
public sealed record CompetencyResult(
    double Score,
    Gate Gate,
    IReadOnlyList<CriticalGap> CriticalGaps,
    IReadOnlyList<Differentiator> Differentiators);

/// <summary>One MIL subtest as scored: percentile, band, role and the weight actually applied.</summary>
public sealed record MilComponent(int Percentile, string Band, string Role, double Weight);

/// <summary>calculate_mil: F16 fit, MIL_GATE, components, F17 relative strengths (DC, RZ, VN, MT, OR) and the DC band.</summary>
public sealed record MilResult(
    double Score,
    Gate Gate,
    IReadOnlyDictionary<string, MilComponent> Components,
    IReadOnlyDictionary<string, double> RelativeStrengths,
    string LearningCapacityIndicator);

/// <summary>calculate_personality: F19 fit, the winning route id, and every route's F18 score (evidence all_routes).</summary>
public sealed record PersonalityResult(double Score, string WinningRoute, IReadOnlyList<RouteScore> AllRoutes);

/// <summary>One rater source's normalised score for a variable (null = that source did not answer).</summary>
public sealed record SourceScore(string Source, double? Score);

/// <summary>integrate_sources: F02 score, F03 consensus, F04 coverage, the valid-source count and the valid scores kept (declared order).</summary>
public sealed record SourceIntegration(
    double? Score,
    double? Consensus,
    double Coverage,
    int ValidSources,
    IReadOnlyDictionary<string, double>? SourceScores);

/// <summary>confidence360: F05 index (null when NOT_DETERMINABLE) and its label.</summary>
public sealed record ConfidenceResult(double? Index, Confidence Label);

/// <summary>One 360 variable's contribution to CareerFit360 (evidence variables[code]).</summary>
public sealed record V360VariableEvidence(double Score, double CombinedWeight);

/// <summary>calculate_careerfit360: F06 fit plus the relevance-weighted consensus and confidence index over the same variables.</summary>
public sealed record CareerFit360Result(
    double Score,
    IReadOnlyDictionary<string, V360VariableEvidence> Variables,
    double? Consensus,
    double? ConfidenceIndex);

/// <summary>convergence_level: the level, how many instruments were STRONG, and each instrument's support (PCA, MIL, PERSONALITY, 360).</summary>
public sealed record ConvergenceResult(Convergence Level, int StrongCount, IReadOnlyDictionary<string, Support> Supports);

/// <summary>
/// evaluate_owner's audit_inputs: every instrument's full result (a superset of the reference's evidence
/// dicts — pca_routes, mil.evidence, personality.evidence, v360.evidence — each carried with its score).
/// </summary>
public sealed record AuditInputs(
    IReadOnlyList<RouteScore> PcaRoutes,
    MilResult Mil,
    PersonalityResult Personality,
    CareerFit360Result V360);

/// <summary>
/// evaluate_owner's return value for one owner (family in this slice). <see cref="RankPosition"/> and
/// <see cref="CareerFitRelative"/> are null until <see cref="CareerFitFormulas.AssignRelativeFit"/> ranks
/// the owner against its alternatives (F21). CareerFitAbsolute is a 0–100 score, never a percentage or
/// a probability.
/// </summary>
public sealed record OwnerEvaluation(
    string OwnerType,
    int OwnerId,
    double PcaRouteFit,
    string PcaWinningRoute,
    double CompetencyFit,
    Gate CompetencyGate,
    double PcaIndex,
    double MilFit,
    Gate MilGate,
    IReadOnlyDictionary<string, double> MilRelativeStrengths,
    double PersonalityFit,
    string PersonalityWinningRoute,
    double CareerFit360,
    double? CareerFit360Consensus,
    Confidence CareerFit360Confidence,
    Gate FinalGate,
    Convergence ConvergenceLevel,
    ConvergenceResult ConvergenceDetail,
    double CareerFitAbsolute,
    IReadOnlyList<CriticalGap> CriticalGaps,
    AuditInputs AuditInputs)
{
    /// <summary>1 = best, set by AssignRelativeFit.</summary>
    public int? RankPosition { get; init; }

    /// <summary>F21: 100 for a single alternative, else 100·(N − rank)/(N − 1); set by AssignRelativeFit.</summary>
    public double? CareerFitRelative { get; init; }
}
