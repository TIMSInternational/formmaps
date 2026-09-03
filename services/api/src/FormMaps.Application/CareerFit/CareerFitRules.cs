namespace FormMaps.Application.CareerFit;

// FM-CF-004. Immutable mirror of docs/careerfit/rules/careerfit-rules.v<version>.json — exactly the
// blocks the reference engine's evaluate_owner needs (weights, thresholds, PCA archetypes, competency
// and 360 catalogues, per-family rules) plus the version header. Everything the engine iterates is an
// ORDERED list in the file's declared order (archetypes, mil_rules, v360_rules, personality
// dimensions), never a hash-ordered dictionary, because the reference accumulates weighted means in
// Python-dict order and bit-parity depends on it. Provenance blocks (derived_from, decisions,
// source_discrepancies, open_questions, source_text, subfamilies, prose notes) are deliberately NOT
// modelled here: the loader ignores them, FM-CF-009 (resolver) and TIMS ratification read them from
// the JSON directly. Parsing lives in CareerFitRulesJson; no I/O, no DI, no persistence in this file.

/// <summary>One loaded rule-set version. Families are in file order; <see cref="ScorableFamilies"/> is the engine's family order.</summary>
public sealed record CareerFitRules(
    int FormatVersion,
    string RulesVersion,
    string Status,
    string? ModelVersionBasis,
    CareerFitWeights Weights,
    CareerFitThresholds Thresholds,
    IReadOnlyDictionary<string, PcaArchetype> Archetypes,
    IReadOnlyList<CompetencyDefinition> Competencies,
    IReadOnlyList<V360Variable> V360Variables,
    IReadOnlyList<FamilyRules> Families)
{
    /// <summary>Families with <c>scorable == true</c>, in file order (mc_lib.Model.families).</summary>
    public IReadOnlyList<FamilyRules> ScorableFamilies => Families.Where(f => f.Scorable).ToList();

    /// <summary>The family with this id; throws <see cref="KeyNotFoundException"/> when the rule set has none.</summary>
    public FamilyRules Family(int familyId) =>
        Families.FirstOrDefault(f => f.FamilyId == familyId)
        ?? throw new KeyNotFoundException($"Rule set {RulesVersion} has no family {familyId}");
}

/// <summary>rules.weights — every weight the formulas take, so none is hard-coded in the engine (reference module docstring).</summary>
public sealed record CareerFitWeights(
    CareerFitBlendWeights CareerFit,
    PcaInternalWeights PcaInternal,
    IReadOnlyDictionary<string, double> V360Sources,
    IReadOnlyDictionary<string, double> Relevance,
    IReadOnlyDictionary<string, double> MilRole,
    IReadOnlyDictionary<string, double> CompetencyRole);

/// <summary>weights.career_fit — the F20 blend (reference EngineWeights.mil/pca/personality/vocational360).</summary>
public sealed record CareerFitBlendWeights(double Mil, double Pca, double Personality, double Vocational360);

/// <summary>weights.pca_internal — the F15 split (reference EngineWeights.disc_in_pca/competencies_in_pca; PROVISIONAL 0.5/0.5).</summary>
public sealed record PcaInternalWeights(double Disc, double Competencies);

/// <summary>rules.thresholds.</summary>
public sealed record CareerFitThresholds(
    IReadOnlyList<MilBandRule> MilBands,
    ConvergenceThresholds Convergence,
    V360ConsensusThresholds V360Consensus,
    V360ConfidenceThresholds V360Confidence,
    AbsoluteReference? AbsoluteReference);

/// <summary>One MIL percentile band (04_MIL_LOGICA B), inclusive bounds, declared low to high.</summary>
public sealed record MilBandRule(string Name, int Min, int Max);

/// <summary>
/// thresholds.convergence. <see cref="StrongMin"/>/<see cref="PartialMin"/> are the spec's single pair (F22/F23:
/// 70/55, what the reference engine implements). <see cref="PerInstrument"/> is the D5 recut keyed by
/// instrument ("PCA", "MIL", "PERSONALITY", "360"); when present it overrides the pair for that instrument.
/// </summary>
public sealed record ConvergenceThresholds(
    double StrongMin,
    double PartialMin,
    IReadOnlyDictionary<string, InstrumentThresholds>? PerInstrument);

/// <summary>One instrument's convergence cut; Provenance is "SIMULATED" until FM-CF-014 recuts it on the shadow cohort.</summary>
public sealed record InstrumentThresholds(double StrongMin, double PartialMin, string? Provenance);

/// <summary>thresholds.v360_consensus (reference Thresholds.consensus_high_min/consensus_medium_min).</summary>
public sealed record V360ConsensusThresholds(double HighMin, double MediumMin);

/// <summary>thresholds.v360_confidence (reference Thresholds.confidence_* ; F05).</summary>
public sealed record V360ConfidenceThresholds(double ConsensusWeight, double CoverageWeight, double HighMin, double MediumMin);

/// <summary>thresholds.absolute_reference — the simulated CareerFitAbsolute distribution. Never a percentage; never shown to a student.</summary>
public sealed record AbsoluteReference(
    double Mean,
    double Sd,
    double P1,
    double P5,
    double P25,
    double P50,
    double P75,
    double P95,
    double P99,
    double? MatchedMean,
    double? UnmatchedMean,
    double? YoudenCut,
    string? Provenance);

/// <summary>One DISC archetype (rules.pca.archetypes[id]); Factors are D, I, S, C in file order.</summary>
public sealed record PcaArchetype(
    string Id,
    IReadOnlyList<PcaFactorRule> Factors,
    string? VocationalUse,
    IReadOnlyList<int> ReferencedByFamilies);

/// <summary>Direction ("ACTIVE" / "PASSIVE" / "NEUTRAL" / "OPEN") and weight of one DISC factor inside a route.</summary>
public sealed record PcaFactorRule(string Factor, string Direction, double Weight, string? SourceText);

/// <summary>rules.competencies[] — id and name only; the engine keys on the id.</summary>
public sealed record CompetencyDefinition(int CompetencyId, string Name);

/// <summary>rules.v360_variables[] — code and base weight (the 40 variables, file order).</summary>
public sealed record V360Variable(string Code, double BaseWeight);

/// <summary>rules.families[] — one family's rules as written; <see cref="PcaRoutes"/> are archetype ids, expanded by <see cref="ResolvedFamilyRules"/>.</summary>
public sealed record FamilyRules(
    int FamilyId,
    string FamilyName,
    bool Scorable,
    bool InheritOccupation,
    IReadOnlyList<string> PcaRoutes,
    IReadOnlyList<CompetencyRule> CompetencyRules,
    MilRules MilRules,
    IReadOnlyList<PersonalityRoute> PersonalityRoutes,
    IReadOnlyList<V360Rule> V360Rules);

/// <summary>One competency rule (11_COMP_FAMILIAS). Weight is absent in the rule set: the engine falls back to weights.competency_role.</summary>
public sealed record CompetencyRule(int CompetencyId, string Role, int? MinimumLevel, double? Weight);

/// <summary>One MIL subtest rule with its D2 provenance (source_marker / resolution / subfamily_candidate) so TIMS can overrule a cell.</summary>
public sealed record MilSubtestRule(
    string Subtest,
    string Role,
    double? Weight,
    string? SourceMarker,
    string? Resolution,
    string? SubfamilyCandidate);

/// <summary>A family's five MIL rules in file order, addressable by subtest code exactly like the reference's <c>rules[test]</c>.</summary>
public sealed record MilRules(IReadOnlyList<MilSubtestRule> Subtests)
{
    /// <summary>Rule for a subtest; throws <see cref="KeyNotFoundException"/> when absent (the reference raises KeyError).</summary>
    public MilSubtestRule this[string subtest] =>
        Subtests.FirstOrDefault(s => s.Subtest == subtest)
        ?? throw new KeyNotFoundException($"MIL rule for subtest '{subtest}' is missing");
}

/// <summary>One personality route (D3); Dimensions in file order.</summary>
public sealed record PersonalityRoute(string RouteId, IReadOnlyList<PersonalityDimensionRule> Dimensions);

/// <summary>One dimension inside a personality route. RuleType null reads as "POLE", Weight null as 1.0 (the reference's .get defaults).</summary>
public sealed record PersonalityDimensionRule(string Dimension, string? RuleType, string? PreferredPole, double? Weight);

/// <summary>One 360 relevance rule (10_360_RELEVANCIA); only use_mode BASE with relevance &gt; 0 scores.</summary>
public sealed record V360Rule(string Code, string? UseMode, double Relevance, double BaseWeight);

/// <summary>A PCA route as evaluate_owner consumes it: an archetype's factors carried with the route id.</summary>
public sealed record PcaRouteRules(string RouteId, IReadOnlyList<PcaFactorRule> Factors)
{
    /// <summary>The rule for a factor, or null when the route does not mention it (the reference reads that as OPEN / weight 0).</summary>
    public PcaFactorRule? Factor(string factor) => Factors.FirstOrDefault(f => f.Factor == factor);
}

/// <summary>
/// The family bundle <see cref="CareerFitFormulas.EvaluateOwner"/> consumes — the exact shape of
/// tools/careerfit/mc_lib.py resolved_bundle(): owner FAMILY/family_id, pca_routes expanded from
/// archetype ids into factor rules carrying a route_id, and the family's competency, MIL, personality
/// and 360 rules as written. Subfamily/career inheritance and override (deep merge, fail-closed marker
/// check) is FM-CF-009, which builds this same record from its own resolution.
/// </summary>
public sealed record ResolvedFamilyRules(
    string OwnerType,
    int OwnerId,
    IReadOnlyList<PcaRouteRules> PcaRoutes,
    IReadOnlyList<CompetencyRule> CompetencyRules,
    MilRules MilRules,
    IReadOnlyList<PersonalityRoute> PersonalityRoutes,
    IReadOnlyList<V360Rule> V360Rules)
{
    /// <summary>Owner type of a family bundle.</summary>
    public const string FamilyOwnerType = "FAMILY";

    /// <summary>
    /// resolved_bundle(rules, family). Refuses a non-scorable family (family 15 inherits its occupation —
    /// an INHERIT marker that must never reach a scoring function) and an unknown archetype id.
    /// </summary>
    public static ResolvedFamilyRules FromFamily(CareerFitRules rules, FamilyRules family)
    {
        if (!family.Scorable)
        {
            throw new InvalidOperationException(
                $"Family {family.FamilyId} ({family.FamilyName}) is not scorable and cannot be resolved into an engine bundle");
        }

        var routes = new List<PcaRouteRules>(family.PcaRoutes.Count);
        foreach (var routeId in family.PcaRoutes)
        {
            if (!rules.Archetypes.TryGetValue(routeId, out var archetype))
            {
                throw new KeyNotFoundException($"Family {family.FamilyId} references unknown PCA archetype '{routeId}'");
            }

            routes.Add(new PcaRouteRules(routeId, archetype.Factors));
        }

        return new ResolvedFamilyRules(
            OwnerType: FamilyOwnerType,
            OwnerId: family.FamilyId,
            PcaRoutes: routes,
            CompetencyRules: family.CompetencyRules,
            MilRules: family.MilRules,
            PersonalityRoutes: family.PersonalityRoutes,
            V360Rules: family.V360Rules);
    }

    /// <summary>resolved_bundle for the family with this id.</summary>
    public static ResolvedFamilyRules FromFamily(CareerFitRules rules, int familyId) =>
        FromFamily(rules, rules.Family(familyId));
}
