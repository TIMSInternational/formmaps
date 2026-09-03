using System.Globalization;

namespace FormMaps.Application.CareerFit;

/// <summary>
/// FM-CF-004. The CareerFit Rules Engine formulas F01–F23 (workbook sheet 13_FORMULAS_ENGINE) as pure
/// static functions — one per function of the normative reference
/// docs/careerfit/sources/formmaps_engine_reference.py, same name in PascalCase, same semantics, same
/// order of floating-point operations, every weight and threshold passed in. Held to the reference at
/// 1e-9 by the parity fixture (CareerFitParityTests) and, in practice, bit-exact: the one place the
/// reference's arithmetic is not the obvious one is Python's builtin <c>sum()</c>, which since CPython
/// 3.12 is Neumaier-compensated — see <see cref="PythonSum"/>. Nothing here does I/O, validates a rule
/// set, ranks across students, or renders text; EvaluateOwner scores ONE owner (a family in this
/// slice) and AssignRelativeFit ranks a list of them. Gates never discard: they label.
/// </summary>
public static class CareerFitFormulas
{
    /// <summary>DISC factor order the reference iterates in calculate_pca_route_fit.</summary>
    public static readonly IReadOnlyList<string> PcaFactors = ["D", "I", "S", "C"];

    /// <summary>MIL subtest order the reference iterates in calculate_mil.</summary>
    public static readonly IReadOnlyList<string> MilSubtests = ["DC", "RZ", "VN", "MT", "OR"];

    /// <summary>The four convergence instruments, in the reference's supports order (also the per_instrument threshold keys).</summary>
    public static readonly IReadOnlyList<string> ConvergenceInstruments = ["PCA", "MIL", "PERSONALITY", "360"];

    private const string CriticalRole = "CRITICAL";
    private const string ImportantRole = "IMPORTANT";
    private const string DifferentiatorRole = "DIFFERENTIATOR";
    private const string InsufficientBand = "INSUFFICIENT";
    private const string LowBand = "LOW";

    // ---------------------------------------------------------------- Validation

    /// <summary>require_range for a float-valued input: throws "{name} must be between {lo} and {hi}; got {value}" (value in Python float repr). NaN is rejected too — the reference lets it through, a NaN score would poison every downstream mean silently.</summary>
    public static void RequireRange(string name, double value, int lo, int hi)
    {
        if (double.IsNaN(value) || value < lo || value > hi)
        {
            throw new ArgumentException($"{name} must be between {lo} and {hi}; got {PythonFloatRepr(value)}");
        }
    }

    /// <summary>require_range for an integer-valued input (competency levels, MIL percentiles, Likert responses).</summary>
    public static void RequireRange(string name, int value, int lo, int hi)
    {
        if (value < lo || value > hi)
        {
            throw new ArgumentException($"{name} must be between {lo} and {hi}; got {value}");
        }
    }

    /// <summary>
    /// validate_inputs: PCA factors 0–100, competencies exactly ids 1..24 with levels 0–4, MIL percentiles
    /// 1–99, personality poles 0–100 — checked in that order, first failure throws. EvaluateOwner does not
    /// call this (nor does the reference's evaluate_owner); the orchestrator validates once per assessment.
    /// </summary>
    public static void ValidateInputs(
        PcaInput pca, IReadOnlyDictionary<int, int> competencies, MilInput mil, PersonalityInput personality)
    {
        RequireRange("PCA.D", pca.D, 0, 100);
        RequireRange("PCA.I", pca.I, 0, 100);
        RequireRange("PCA.S", pca.S, 0, 100);
        RequireRange("PCA.C", pca.C, 0, 100);

        if (competencies.Count != 24 || !Enumerable.Range(1, 24).All(competencies.ContainsKey))
        {
            throw new ArgumentException("Competencies must contain IDs 1..24");
        }

        for (var cid = 1; cid <= 24; cid++)
        {
            RequireRange($"competency[{cid}]", competencies[cid], 0, 4);
        }

        RequireRange("MIL.DC", mil.DC, 1, 99);
        RequireRange("MIL.RZ", mil.RZ, 1, 99);
        RequireRange("MIL.VN", mil.VN, 1, 99);
        RequireRange("MIL.MT", mil.MT, 1, 99);
        RequireRange("MIL.OR", mil.OR, 1, 99);

        RequireRange("Personality.E", personality.E, 0, 100);
        RequireRange("Personality.I", personality.I, 0, 100);
        RequireRange("Personality.S", personality.S, 0, 100);
        RequireRange("Personality.N", personality.N, 0, 100);
        RequireRange("Personality.T", personality.T, 0, 100);
        RequireRange("Personality.F", personality.F, 0, 100);
        RequireRange("Personality.J", personality.J, 0, 100);
        RequireRange("Personality.P", personality.P, 0, 100);
    }

    // ---------------------------------------------------------------- PCA (F07–F11)

    /// <summary>pca_state: "ACTIVE" above 50, "PASSIVE" below, "NEUTRAL" at exactly 50 (rules.pca.states).</summary>
    public static string PcaState(double score)
    {
        if (score > 50)
        {
            return "ACTIVE";
        }

        if (score < 50)
        {
            return "PASSIVE";
        }

        return "NEUTRAL";
    }

    /// <summary>pca_intensity: distance from the midpoint as a percentage of the half-scale, |score − 50| / 50 · 100.</summary>
    public static double PcaIntensity(double score) => Math.Abs(score - 50.0) / 50.0 * 100.0;

    /// <summary>
    /// pca_factor_match — F07 ACTIVE: score; F08 PASSIVE: 100 − score; F09 NEUTRAL: max(0, 100 − 2·|score − 50|);
    /// OPEN: null (excluded from the route denominator). Any other direction throws "Unknown PCA direction: X".
    /// </summary>
    public static double? PcaFactorMatch(double score, string direction)
    {
        switch (direction)
        {
            case "ACTIVE":
                return score;
            case "PASSIVE":
                return 100.0 - score;
            case "NEUTRAL":
                var neutral = 100.0 - 2.0 * Math.Abs(score - 50.0);
                return neutral > 0.0 ? neutral : 0.0; // Python max(0.0, x): first argument unless x is strictly greater
            case "OPEN":
                return null;
            default:
                throw new ArgumentException($"Unknown PCA direction: {direction}");
        }
    }

    /// <summary>
    /// weighted_mean — the Σ(v·w)/Σ(w) kernel behind F02, F06, F10, F14, F16 and F18. Drops null values and
    /// weights ≤ 0; null when nothing usable remains. Numerator and denominator are each summed with
    /// <see cref="PythonSum"/> in sequence order, exactly as the reference's two <c>sum()</c> calls.
    /// </summary>
    public static double? WeightedMean(IReadOnlyList<WeightedValue> items)
    {
        var values = new List<double>(items.Count);
        var weights = new List<double>(items.Count);
        foreach (var item in items)
        {
            if (item.Value is double v && item.Weight > 0)
            {
                values.Add(v);
                weights.Add(item.Weight);
            }
        }

        if (values.Count == 0)
        {
            return null;
        }

        var denominator = PythonSum(weights);
        var products = new List<double>(values.Count);
        for (var i = 0; i < values.Count; i++)
        {
            products.Add(values[i] * weights[i]);
        }

        return PythonSum(products) / denominator;
    }

    /// <summary>
    /// CPython ≥ 3.12 builtin <c>sum()</c> over floats with the default start of 0: the first term is added
    /// to the integer 0 (exact), every later term goes through Neumaier's compensated addition, and the
    /// accumulated compensation is applied once at the end (only when non-zero and finite). This is what
    /// the reference engine and tools/careerfit (Python 3.12 in CI, 3.14 locally) actually compute; a
    /// naive left-to-right sum differs in the last bit for roughly a third of the engine's means — still
    /// inside 1e-9, but not bit-parity. Empty input returns 0.
    /// </summary>
    public static double PythonSum(IReadOnlyList<double> terms)
    {
        if (terms.Count == 0)
        {
            return 0.0;
        }

        var result = 0.0 + terms[0];
        var compensation = 0.0;
        for (var i = 1; i < terms.Count; i++)
        {
            var x = terms[i];
            var t = result + x;
            if (Math.Abs(result) >= Math.Abs(x))
            {
                compensation += (result - t) + x;
            }
            else
            {
                compensation += (x - t) + result;
            }

            result = t;
        }

        if (compensation != 0.0 && double.IsFinite(compensation))
        {
            result += compensation;
        }

        return result;
    }

    /// <summary>
    /// calculate_pca_route_fit — F10: Σ(match_f · routeWeight_f) / Σ(routeWeight_f) over D, I, S, C. A factor
    /// the route does not mention is OPEN / weight 0; OPEN factors and weights ≤ 0 stay out of the
    /// denominator. All-OPEN → score 0.0 (the reference's <c>score or 0.0</c>).
    /// </summary>
    public static RouteScore CalculatePcaRouteFit(PcaInput pca, PcaRouteRules routeRules)
    {
        var components = new OrderedDictionary<string, double>(StringComparer.Ordinal);
        var weighted = new List<WeightedValue>(4);
        foreach (var factor in PcaFactors)
        {
            var rule = routeRules.Factor(factor);
            var direction = rule?.Direction ?? "OPEN";
            var weight = rule?.Weight ?? 0.0;
            var match = PcaFactorMatch(pca.Factor(factor), direction);
            if (match is double m && weight > 0)
            {
                components[factor] = m;
                weighted.Add(new WeightedValue(m, weight));
            }
        }

        var score = WeightedMean(weighted);
        return new RouteScore(routeRules.RouteId, score ?? 0.0, components);
    }

    /// <summary>select_best_route — F11 / F19: the FIRST route with the maximal score (Python max); an empty list throws "At least one route is required".</summary>
    public static RouteScore SelectBestRoute(IReadOnlyList<RouteScore> routeScores)
    {
        if (routeScores.Count == 0)
        {
            throw new ArgumentException("At least one route is required");
        }

        var best = routeScores[0];
        for (var i = 1; i < routeScores.Count; i++)
        {
            if (routeScores[i].Score > best.Score)
            {
                best = routeScores[i];
            }
        }

        return best;
    }

    // ---------------------------------------------------------------- Competencies (F12–F14)

    /// <summary>
    /// competency_attainment — F12 CRITICAL: min(100, level / required · 100) with required defaulting to 2;
    /// F13 IMPORTANT: same with required defaulting to 1; any other role: 100. A required level of 0 → 100.
    /// </summary>
    public static double CompetencyAttainment(int level, string role, int? minimumLevel = null)
    {
        if (role == CriticalRole)
        {
            return Attainment(level, minimumLevel ?? 2);
        }

        if (role == ImportantRole)
        {
            return Attainment(level, minimumLevel ?? 1);
        }

        return 100.0;
    }

    private static double Attainment(int level, int required)
    {
        if (required <= 0)
        {
            return 100.0;
        }

        var attained = (double)level / required * 100.0;
        return attained < 100.0 ? attained : 100.0; // Python min(100.0, x): first argument unless x is strictly smaller
    }

    /// <summary>
    /// calculate_competencies — F14 over the rules in declared order: roles present in <paramref name="roleWeights"/>
    /// (rules.weights.competency_role; the reference hard-codes CRITICAL 3 / IMPORTANT 2) contribute their
    /// attainment at the rule's own weight or, when absent/0, the role weight — a 0 role weight (COMPLEMENTARY)
    /// falls out of the mean. COMP_GATE: any CRITICAL at level 0 → CRITICAL, else any at level 1 → CONDITIONED,
    /// else SATISFIED. Evidence: critical_gaps (CRITICAL below required, default 2) and differentiators
    /// (DIFFERENTIATOR at level ≥ 3). A rule whose competency id is not in <paramref name="levels"/> throws.
    /// </summary>
    public static CompetencyResult CalculateCompetencies(
        IReadOnlyDictionary<int, int> levels,
        IReadOnlyList<CompetencyRule> rules,
        IReadOnlyDictionary<string, double> roleWeights)
    {
        var weighted = new List<WeightedValue>(rules.Count);
        var criticalGaps = new List<CriticalGap>();
        var differentiators = new List<Differentiator>();
        foreach (var rule in rules)
        {
            var cid = rule.CompetencyId;
            var role = rule.Role;
            var level = levels[cid];
            if (roleWeights.TryGetValue(role, out var roleWeight))
            {
                var attainment = CompetencyAttainment(level, role, rule.MinimumLevel);
                var weight = rule.Weight is double w && w != 0.0 ? w : roleWeight; // `rule.get("weight") or role_weight[role]`
                weighted.Add(new WeightedValue(attainment, weight));
            }

            if (role == CriticalRole)
            {
                var required = rule.MinimumLevel is int ml && ml != 0 ? ml : 2; // `int(rule.get("minimum_level") or 2)`
                if (level < required)
                {
                    criticalGaps.Add(new CriticalGap(cid, level, required));
                }
            }

            if (role == DifferentiatorRole && level >= 3)
            {
                differentiators.Add(new Differentiator(cid, level));
            }
        }

        var fit = WeightedMean(weighted) ?? 0.0;

        var criticalLevels = new List<int>();
        foreach (var rule in rules)
        {
            if (rule.Role == CriticalRole)
            {
                criticalLevels.Add(levels[rule.CompetencyId]);
            }
        }

        Gate gate;
        if (criticalLevels.Any(l => l == 0))
        {
            gate = Gate.Critical;
        }
        else if (criticalLevels.Any(l => l == 1))
        {
            gate = Gate.Conditioned;
        }
        else
        {
            gate = Gate.Satisfied;
        }

        return new CompetencyResult(fit, gate, criticalGaps, differentiators);
    }

    // ---------------------------------------------------------------- MIL (F16–F17)

    /// <summary>
    /// mil_band: the first band (declared low to high, rules.thresholds.mil_bands) whose max is ≥ the percentile,
    /// falling through to the last band — the reference's ≤17 / ≤37 / ≤56 / ≤81 / else ladder. The percentile
    /// must lie within [first.min, last.max] (1–99) or this throws like the reference's require_range.
    /// </summary>
    public static string MilBand(int percentile, IReadOnlyList<MilBandRule> bands)
    {
        if (bands.Count == 0)
        {
            throw new ArgumentException("At least one MIL band is required", nameof(bands));
        }

        RequireRange("MIL percentile", percentile, bands[0].Min, bands[^1].Max);
        foreach (var band in bands)
        {
            if (percentile <= band.Max)
            {
                return band.Name;
            }
        }

        return bands[^1].Name;
    }

    /// <summary>
    /// calculate_mil — F16 over DC, RZ, VN, MT, OR: Σ(percentile · weight)/Σ(weight), each subtest at its rule's
    /// weight or, when absent/0, the role's weight from <paramref name="roleWeights"/> (rules.weights.mil_role;
    /// the reference hard-codes CRITICAL 3 / IMPORTANT 2 / COMPLEMENTARY 1, unknown roles 0). MIL_GATE from the
    /// CRITICAL subtests' bands: any INSUFFICIENT (P ≤ 17) → CRITICAL, else any LOW (18–37) → CONDITIONED, else
    /// SATISFIED. F17 relative strengths: percentile / max(all five) · 100. learning_capacity_indicator = DC's band.
    /// </summary>
    public static MilResult CalculateMil(
        MilInput mil,
        MilRules rules,
        IReadOnlyDictionary<string, double> roleWeights,
        IReadOnlyList<MilBandRule> bands)
    {
        var weighted = new List<WeightedValue>(5);
        var criticalBands = new List<string>();
        var components = new OrderedDictionary<string, MilComponent>(StringComparer.Ordinal);
        foreach (var test in MilSubtests)
        {
            var score = mil.Subtest(test);
            var rule = rules[test];
            var role = rule.Role;
            var weight = rule.Weight is double w && w != 0.0 ? w : roleWeights.GetValueOrDefault(role, 0.0); // `.get("weight") or default_weight.get(role, 0.0)`
            var band = MilBand(score, bands);
            components[test] = new MilComponent(score, band, role, weight);
            if (weight > 0)
            {
                weighted.Add(new WeightedValue(score, weight));
            }

            if (role == CriticalRole)
            {
                criticalBands.Add(band);
            }
        }

        var fit = WeightedMean(weighted) ?? 0.0;

        Gate gate;
        if (criticalBands.Any(b => b == InsufficientBand))
        {
            gate = Gate.Critical;
        }
        else if (criticalBands.Any(b => b == LowBand))
        {
            gate = Gate.Conditioned;
        }
        else
        {
            gate = Gate.Satisfied;
        }

        var max = Math.Max(Math.Max(Math.Max(Math.Max(mil.DC, mil.RZ), mil.VN), mil.MT), mil.OR);
        var relative = new OrderedDictionary<string, double>(StringComparer.Ordinal);
        foreach (var test in MilSubtests)
        {
            relative[test] = (double)mil.Subtest(test) / max * 100.0;
        }

        return new MilResult(fit, gate, components, relative, MilBand(mil.DC, bands));
    }

    // ---------------------------------------------------------------- Personality (F18–F19)

    /// <summary>personality_dimension_match: the preferred pole's score; null for a null or OPEN pole. An unknown pole letter throws. The dimension is carried for signature parity only — the pole alone selects the score, as in the reference.</summary>
    public static double? PersonalityDimensionMatch(PersonalityInput personality, string dimension, string? preferredPole)
    {
        if (preferredPole is null or "OPEN")
        {
            return null;
        }

        return personality.Pole(preferredPole);
    }

    /// <summary>
    /// calculate_personality — F18 per route over its dimensions in declared order (rule_type OPEN skipped,
    /// weight defaulting to 1.0, weights ≤ 0 excluded; all-OPEN → 0.0), then F19: the first maximal route wins.
    /// No gate — personality never gates. An empty route list throws.
    /// </summary>
    public static PersonalityResult CalculatePersonality(PersonalityInput personality, IReadOnlyList<PersonalityRoute> routes)
    {
        var routeScores = new List<RouteScore>(routes.Count);
        foreach (var route in routes)
        {
            var weighted = new List<WeightedValue>(route.Dimensions.Count);
            var components = new OrderedDictionary<string, double>(StringComparer.Ordinal);
            foreach (var rule in route.Dimensions)
            {
                if ((rule.RuleType ?? "POLE") == "OPEN")
                {
                    continue;
                }

                var match = PersonalityDimensionMatch(personality, rule.Dimension, rule.PreferredPole);
                var weight = rule.Weight ?? 1.0;
                if (match is double m && weight > 0)
                {
                    weighted.Add(new WeightedValue(m, weight));
                    components[rule.Dimension] = m;
                }
            }

            routeScores.Add(new RouteScore(route.RouteId, WeightedMean(weighted) ?? 0.0, components));
        }

        var winner = SelectBestRoute(routeScores);
        return new PersonalityResult(winner.Score, winner.RouteId, routeScores);
    }

    // ---------------------------------------------------------------- 360 (F01–F06)

    /// <summary>normalize_likert — F01: (r − 1) / 4 · 100 for r in 1..5; null stays null; out of range throws.</summary>
    public static double? NormalizeLikert(int? response)
    {
        if (response is null)
        {
            return null;
        }

        RequireRange("Likert response", response.Value, 1, 5);
        return (response.Value - 1) / 4.0 * 100.0;
    }

    /// <summary>
    /// integrate_sources — F02 score Σ(s_i·w_i)/Σ(w_i) over the sources with a score, F04 coverage Σ(w_i) of
    /// those, F03 consensus 100 − (max − min) when at least two are valid. No valid source → score, consensus
    /// and SourceScores null, coverage 0, valid_sources 0. Sources are taken in the given order (the
    /// reference's dict order) and must be unique; a source missing from <paramref name="sourceWeights"/> throws.
    /// </summary>
    public static SourceIntegration IntegrateSources(
        IReadOnlyList<SourceScore> sourceScores, IReadOnlyDictionary<string, double> sourceWeights)
    {
        var valid = new OrderedDictionary<string, double>(StringComparer.Ordinal);
        foreach (var entry in sourceScores)
        {
            if (entry.Score is not double s)
            {
                continue;
            }

            if (!valid.TryAdd(entry.Source, s))
            {
                throw new ArgumentException($"Duplicate 360 source '{entry.Source}'", nameof(sourceScores));
            }
        }

        if (valid.Count == 0)
        {
            return new SourceIntegration(null, null, 0.0, 0, null);
        }

        var weights = new List<double>(valid.Count);
        var products = new List<double>(valid.Count);
        foreach (var (source, score) in valid)
        {
            var w = sourceWeights[source];
            weights.Add(w);
            products.Add(score * w);
        }

        var coverage = PythonSum(weights);
        var integrated = PythonSum(products) / coverage;
        double? consensus = null;
        if (valid.Count >= 2)
        {
            consensus = 100.0 - (valid.Values.Max() - valid.Values.Min());
        }

        return new SourceIntegration(integrated, consensus, coverage, valid.Count, valid);
    }

    /// <summary>classify_consensus: "NOT_DETERMINABLE" for null, else "HIGH" ≥ high_min, "MEDIUM" ≥ medium_min, "LOW" (rules.thresholds.v360_consensus).</summary>
    public static string ClassifyConsensus(double? consensus, V360ConsensusThresholds thresholds)
    {
        if (consensus is not double c)
        {
            return "NOT_DETERMINABLE";
        }

        if (c >= thresholds.HighMin)
        {
            return "HIGH";
        }

        if (c >= thresholds.MediumMin)
        {
            return "MEDIUM";
        }

        return "LOW";
    }

    /// <summary>
    /// confidence360 — F05: index = consensus_weight · consensus + coverage_weight · coverage · 100, labelled
    /// HIGH ≥ high_min / MEDIUM ≥ medium_min / LOW; fewer than two valid sources or no consensus → null index,
    /// NOT_DETERMINABLE.
    /// </summary>
    public static ConfidenceResult Confidence360(
        double? consensus, double coverage, int validSources, V360ConfidenceThresholds thresholds)
    {
        if (validSources < 2 || consensus is not double c)
        {
            return new ConfidenceResult(null, Confidence.NotDeterminable);
        }

        var index = thresholds.ConsensusWeight * c + thresholds.CoverageWeight * coverage * 100.0;
        Confidence label;
        if (index >= thresholds.HighMin)
        {
            label = Confidence.High;
        }
        else if (index >= thresholds.MediumMin)
        {
            label = Confidence.Medium;
        }
        else
        {
            label = Confidence.Low;
        }

        return new ConfidenceResult(index, label);
    }

    /// <summary>
    /// calculate_careerfit360 — F06 over the family's rules in declared order: only use_mode BASE with relevance
    /// &gt; 0 and a present aggregate count, each at base_weight · relevance; the same weights average the
    /// aggregates' consensus and confidence_index where present (null when none). No usable variable → 0.0.
    /// </summary>
    public static CareerFit360Result CalculateCareerFit360(
        IReadOnlyDictionary<string, V360Aggregate> aggregates, IReadOnlyList<V360Rule> rules)
    {
        var weighted = new List<WeightedValue>(rules.Count);
        var evidence = new OrderedDictionary<string, V360VariableEvidence>(StringComparer.Ordinal);
        var relevantConsensus = new List<WeightedValue>();
        var relevantConfidence = new List<WeightedValue>();
        foreach (var rule in rules)
        {
            if (rule.UseMode != "BASE" || rule.Relevance <= 0)
            {
                continue;
            }

            if (!aggregates.TryGetValue(rule.Code, out var aggregate))
            {
                continue;
            }

            var combinedWeight = rule.BaseWeight * rule.Relevance;
            weighted.Add(new WeightedValue(aggregate.Score, combinedWeight));
            evidence[rule.Code] = new V360VariableEvidence(aggregate.Score, combinedWeight);
            if (aggregate.Consensus is double consensus)
            {
                relevantConsensus.Add(new WeightedValue(consensus, combinedWeight));
            }

            if (aggregate.ConfidenceIndex is double confidenceIndex)
            {
                relevantConfidence.Add(new WeightedValue(confidenceIndex, combinedWeight));
            }
        }

        var fit = WeightedMean(weighted) ?? 0.0;
        return new CareerFit360Result(fit, evidence, WeightedMean(relevantConsensus), WeightedMean(relevantConfidence));
    }

    // ---------------------------------------------------------------- Integration / gates / convergence (F15, F20–F23)

    /// <summary>combine_pca — F15: DISC · pca_route_fit + COMPETENCIES · competency_fit (rules.weights.pca_internal).</summary>
    public static double CombinePca(double pcaRouteFit, double competencyFit, PcaInternalWeights weights) =>
        weights.Disc * pcaRouteFit + weights.Competencies * competencyFit;

    /// <summary>combine_gates — FINAL_GATE: the most severe of the gates (SATISFIED &lt; CONDITIONED &lt; CRITICAL). No gates throws.</summary>
    public static Gate CombineGates(params Gate[] gates)
    {
        if (gates.Length == 0)
        {
            throw new ArgumentException("At least one gate is required", nameof(gates));
        }

        var worst = gates[0];
        for (var i = 1; i < gates.Length; i++)
        {
            if (gates[i] > worst)
            {
                worst = gates[i];
            }
        }

        return worst;
    }

    /// <summary>career_fit_absolute — F20: PCA · pca_index + MIL · mil_fit + PERSONALITY · personality_fit + VOCATIONAL_360 · careerfit360, summed left to right.</summary>
    public static double CareerFitAbsolute(
        double pcaIndex, double milFit, double personalityFit, double career360Fit, CareerFitBlendWeights weights) =>
        weights.Pca * pcaIndex + weights.Mil * milFit + weights.Personality * personalityFit + weights.Vocational360 * career360Fit;

    /// <summary>
    /// evidence_support — F22 STRONG at ≥ strong_min, F23 PARTIAL at ≥ partial_min, else DIVERGENT. With an
    /// <paramref name="instrument"/> ("PCA", "MIL", "PERSONALITY", "360") and per_instrument thresholds present
    /// for it, that instrument's pair is used; otherwise the single spec pair (the reference has only that).
    /// </summary>
    public static Support EvidenceSupport(double score, ConvergenceThresholds thresholds, string? instrument = null)
    {
        var strongMin = thresholds.StrongMin;
        var partialMin = thresholds.PartialMin;
        if (instrument is not null
            && thresholds.PerInstrument is not null
            && thresholds.PerInstrument.TryGetValue(instrument, out var perInstrument))
        {
            strongMin = perInstrument.StrongMin;
            partialMin = perInstrument.PartialMin;
        }

        if (score >= strongMin)
        {
            return Support.Strong;
        }

        if (score >= partialMin)
        {
            return Support.Partial;
        }

        return Support.Divergent;
    }

    /// <summary>
    /// convergence_level (14_GATES_CONVERG B): supports for PCA, MIL, PERSONALITY and 360; a STRONG 360 is
    /// downgraded to PARTIAL when its confidence is LOW or NOT_DETERMINABLE; 4 STRONG → VERY_HIGH, 3 → SOLID,
    /// 2 → PARTIAL, otherwise DIVERGENT.
    /// </summary>
    public static ConvergenceResult ConvergenceLevel(
        double pcaFit,
        double milFit,
        double personalityFit,
        double fit360,
        Confidence fit360Confidence,
        ConvergenceThresholds thresholds)
    {
        var supports = new OrderedDictionary<string, Support>(StringComparer.Ordinal)
        {
            ["PCA"] = EvidenceSupport(pcaFit, thresholds, "PCA"),
            ["MIL"] = EvidenceSupport(milFit, thresholds, "MIL"),
            ["PERSONALITY"] = EvidenceSupport(personalityFit, thresholds, "PERSONALITY"),
            ["360"] = EvidenceSupport(fit360, thresholds, "360"),
        };
        if (supports["360"] == Support.Strong && fit360Confidence is Confidence.Low or Confidence.NotDeterminable)
        {
            supports["360"] = Support.Partial;
        }

        var strongCount = supports.Values.Count(s => s == Support.Strong);
        var level = strongCount switch
        {
            4 => Convergence.VeryHigh,
            3 => Convergence.Solid,
            2 => Convergence.Partial,
            _ => Convergence.Divergent,
        };
        return new ConvergenceResult(level, strongCount, supports);
    }

    /// <summary>
    /// assign_relative_fit — F21: stable descending sort by careerfit_absolute (ties keep input order), rank 1 =
    /// best, careerfit_relative = 100 for a single alternative else 100 · (N − rank) / (N − 1). Returns new
    /// records in rank order; the inputs are not mutated.
    /// </summary>
    public static IReadOnlyList<OwnerEvaluation> AssignRelativeFit(IReadOnlyList<OwnerEvaluation> results)
    {
        var ordered = results.OrderByDescending(r => r.CareerFitAbsolute).ToList();
        var n = ordered.Count;
        for (var i = 0; i < n; i++)
        {
            var rank = i + 1;
            ordered[i] = ordered[i] with
            {
                RankPosition = rank,
                CareerFitRelative = n == 1 ? 100.0 : 100.0 * (n - rank) / (n - 1),
            };
        }

        return ordered;
    }

    // ---------------------------------------------------------------- Orchestrator contract

    /// <summary>
    /// evaluate_owner: one owner after inheritance/override resolution — PCA routes (F10) → winner (F11),
    /// competencies (F14) → pca_index (F15); MIL (F16/F17); personality (F18/F19); CareerFit360 (F06);
    /// FINAL_GATE; CareerFitAbsolute (F20); convergence. Inputs are not range-checked here (see
    /// <see cref="ValidateInputs"/>). The bundle must be fully resolved: no VARIABLE / INHERIT markers.
    /// </summary>
    public static OwnerEvaluation EvaluateOwner(
        CareerFitAssessment assessment,
        ResolvedFamilyRules resolvedRules,
        CareerFitWeights weights,
        CareerFitThresholds thresholds)
    {
        var pcaRoutes = new List<RouteScore>(resolvedRules.PcaRoutes.Count);
        foreach (var route in resolvedRules.PcaRoutes)
        {
            pcaRoutes.Add(CalculatePcaRouteFit(assessment.Pca, route));
        }

        var pcaWinner = SelectBestRoute(pcaRoutes);
        var competencies = CalculateCompetencies(assessment.Competencies, resolvedRules.CompetencyRules, weights.CompetencyRole);
        var pcaIndex = CombinePca(pcaWinner.Score, competencies.Score, weights.PcaInternal);

        var mil = CalculateMil(assessment.Mil, resolvedRules.MilRules, weights.MilRole, thresholds.MilBands);
        var personality = CalculatePersonality(assessment.Personality, resolvedRules.PersonalityRoutes);
        var v360 = CalculateCareerFit360(assessment.V360Aggregates, resolvedRules.V360Rules);

        var finalGate = CombineGates(competencies.Gate, mil.Gate);
        var absolute = CareerFitAbsolute(pcaIndex, mil.Score, personality.Score, v360.Score, weights.CareerFit);

        var confidence = assessment.CareerFit360Confidence;
        var convergence = ConvergenceLevel(pcaIndex, mil.Score, personality.Score, v360.Score, confidence, thresholds.Convergence);

        return new OwnerEvaluation(
            OwnerType: resolvedRules.OwnerType,
            OwnerId: resolvedRules.OwnerId,
            PcaRouteFit: pcaWinner.Score,
            PcaWinningRoute: pcaWinner.RouteId,
            CompetencyFit: competencies.Score,
            CompetencyGate: competencies.Gate,
            PcaIndex: pcaIndex,
            MilFit: mil.Score,
            MilGate: mil.Gate,
            MilRelativeStrengths: mil.RelativeStrengths,
            PersonalityFit: personality.Score,
            PersonalityWinningRoute: personality.WinningRoute,
            CareerFit360: v360.Score,
            CareerFit360Consensus: v360.Consensus,
            CareerFit360Confidence: confidence,
            FinalGate: finalGate,
            ConvergenceLevel: convergence.Level,
            ConvergenceDetail: convergence,
            CareerFitAbsolute: absolute,
            CriticalGaps: competencies.CriticalGaps,
            AuditInputs: new AuditInputs(pcaRoutes, mil, personality, v360));
    }

    // ---------------------------------------------------------------- helpers

    // Python's repr() of a float, for the validation messages: shortest round-trip digits, a ".0" on
    // integral values, lowercase two-digit exponents ("1e-05"). .NET's shortest formatting already agrees on
    // the digits; only the notation differs. (The two disagree on where fixed notation gives way to
    // exponent notation between 1e15 and 1e16 — far outside any score the engine validates.)
    private static string PythonFloatRepr(double value)
    {
        if (double.IsNaN(value))
        {
            return "nan";
        }

        if (double.IsInfinity(value))
        {
            return value > 0 ? "inf" : "-inf";
        }

        var s = value.ToString("R", CultureInfo.InvariantCulture);
        var e = s.IndexOf('E');
        if (e < 0)
        {
            return s.Contains('.') ? s : s + ".0";
        }

        var mantissa = s[..e];
        var exponent = s[(e + 1)..];
        var sign = exponent.StartsWith('-') ? "-" : "+";
        var digits = exponent.TrimStart('+', '-').TrimStart('0');
        return mantissa + "e" + sign + digits.PadLeft(2, '0');
    }
}
