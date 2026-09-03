namespace FormMaps.Application.CareerFit.Resolver;

// FM-CF-009. The RulesResolver's fail-closed half: a one-for-one port of the RESOLVED checks in
// tools/careerfit/mc_gate.py check_resolved(), run over a loaded CareerFitRules BEFORE any family
// bundle is handed to a scoring function. This is the assert_no_unresolved_markers() the spec promises
// and the reference engine never implements: a VARIABLE / INHERIT / X/Y marker that survived
// build_rules.py, a PCA route id outside the archetype catalogue, an unknown 360 code or a scoring
// block whose weights sum to zero (the way as-shipped Ingeniería read 0.0% before FM-CF-001) are all
// rejected here with the family and field named, never coerced to 0.0 downstream.
//
// What it deliberately does NOT do: the family -> subfamily -> career deep merge (the rule set carries
// family-level rules only; subfamily_roles are provenance for TIMS, not a scoring layer in V1), and the
// RECOVERY / DISTRIBUTION checks of the gate — a rule set can be fully resolved and still rank badly
// (every family given one family's 360 row is the canonical example); only the Monte Carlo gate sees
// that, and it runs on every PR (formmaps-careerfit-gate.yml). Pure: no I/O, no DI, no caching — the
// ConfigCache that calls this once per version is FM-CF-003 (FormMaps.Infrastructure/CareerFit).

/// <summary>A rule set that passed the resolver, with every scorable family already expanded into its engine bundle.</summary>
public sealed record CareerFitActiveRuleSet(CareerFitRules Rules, IReadOnlyList<ResolvedFamilyRules> Families)
{
    /// <summary>The bundle for a scorable family; throws <see cref="KeyNotFoundException"/> for an unknown or non-scorable id.</summary>
    public ResolvedFamilyRules Family(int familyId) =>
        Families.FirstOrDefault(f => f.OwnerId == familyId)
        ?? throw new KeyNotFoundException($"Rule set {Rules.RulesVersion} has no scorable family {familyId}");
}

/// <summary>Validates a rule set (check_resolved) and resolves its scorable families (resolved_bundle).</summary>
public static class CareerFitRulesResolver
{
    /// <summary>mc_lib.FACTORS — every archetype must rule all four.</summary>
    public static readonly IReadOnlyList<string> Factors = ["D", "I", "S", "C"];

    /// <summary>mc_lib.SUBTESTS — every scorable family must resolve all five.</summary>
    public static readonly IReadOnlyList<string> Subtests = ["DC", "RZ", "VN", "MT", "OR"];

    /// <summary>mc_lib.DIM_POLES — the personality dimensions and the two poles each admits.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> DimensionPoles =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal)
        {
            ["EI"] = ["E", "I"],
            ["SN"] = ["S", "N"],
            ["TF"] = ["T", "F"],
            ["JP"] = ["J", "P"],
        };

    /// <summary>mc_gate.VALID_DIRECTIONS.</summary>
    public static readonly IReadOnlySet<string> ValidDirections =
        new HashSet<string>(StringComparer.Ordinal) { "ACTIVE", "PASSIVE", "NEUTRAL", "OPEN" };

    /// <summary>mc_gate.VALID_MIL_ROLES — anything else (VARIABLE, INHERIT, X/Y, I_MIN) is an unresolved marker.</summary>
    public static readonly IReadOnlySet<string> ValidMilRoles =
        new HashSet<string>(StringComparer.Ordinal) { "CRITICAL", "IMPORTANT", "COMPLEMENTARY", "NOT_USED" };

    /// <summary>mc_gate.VALID_COMP_ROLES.</summary>
    public static readonly IReadOnlySet<string> ValidCompetencyRoles =
        new HashSet<string>(StringComparer.Ordinal) { "CRITICAL", "IMPORTANT", "COMPLEMENTARY", "DIFFERENTIATOR" };

    private static readonly IReadOnlySet<string> ValidPersonalityRuleTypes =
        new HashSet<string>(StringComparer.Ordinal) { "POLE", "OPEN" };

    private const int MaxArchetypeFactorWeight = 3;
    private const int CompetencyIdMin = 1;
    private const int CompetencyIdMax = 24;

    /// <summary>
    /// Runs every check and, when all pass, expands each scorable family with
    /// <see cref="ResolvedFamilyRules.FromFamily(CareerFitRules, FamilyRules)"/>. Throws
    /// <see cref="CareerFitRulesInvalidException"/> carrying every problem otherwise.
    /// </summary>
    public static CareerFitActiveRuleSet Resolve(CareerFitRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var problems = Check(rules);
        if (problems.Count > 0)
        {
            throw new CareerFitRulesInvalidException(rules.RulesVersion, problems);
        }

        var families = rules.ScorableFamilies
            .Select(family => ResolvedFamilyRules.FromFamily(rules, family))
            .ToList();
        return new CareerFitActiveRuleSet(rules, families);
    }

    /// <summary>
    /// check_resolved(), check for check and in the same order, returning the problems instead of raising
    /// on the first twelve. Empty means the rule set is fully resolved.
    /// </summary>
    public static IReadOnlyList<CareerFitRulesProblem> Check(CareerFitRules rules)
    {
        ArgumentNullException.ThrowIfNull(rules);
        var problems = new List<CareerFitRulesProblem>();
        var codes = new HashSet<string>(rules.V360Variables.Select(v => v.Code), StringComparer.Ordinal);

        // -- archetype catalogue: every factor ruled, direction known, weight 0..3
        foreach (var (archetypeId, archetype) in rules.Archetypes)
        {
            foreach (var factor in Factors)
            {
                var rule = archetype.Factors.FirstOrDefault(f => f.Factor == factor);
                if (rule is null
                    || !ValidDirections.Contains(rule.Direction)
                    || !(rule.Weight >= 0 && rule.Weight <= MaxArchetypeFactorWeight))
                {
                    problems.Add(new CareerFitRulesProblem(
                        FamilyId: null,
                        ArchetypeId: archetypeId,
                        Field: $"factors.{factor}",
                        Message: rule is null
                            ? "factor is missing"
                            : $"bad direction/weight ({rule.Direction}, {rule.Weight})"));
                }
            }
        }

        foreach (var family in rules.Families)
        {
            if (!family.Scorable)
            {
                continue;
            }

            var fid = family.FamilyId;

            // -- PCA routes: non-empty, every id in the catalogue
            if (family.PcaRoutes.Count == 0)
            {
                problems.Add(new CareerFitRulesProblem(fid, null, "pca_routes", "no PCA routes"));
            }

            foreach (var routeId in family.PcaRoutes)
            {
                if (!rules.Archetypes.ContainsKey(routeId))
                {
                    problems.Add(new CareerFitRulesProblem(
                        fid, null, $"pca_routes[{routeId}]", $"PCA route '{routeId}' is not in the archetype catalogue"));
                }
            }

            // -- competencies: ids 1..24, known roles, at least one CRITICAL/IMPORTANT (else fit is 0.0)
            var weightedCompetencies = 0;
            foreach (var rule in family.CompetencyRules)
            {
                if (!ValidCompetencyRoles.Contains(rule.Role)
                    || rule.CompetencyId < CompetencyIdMin || rule.CompetencyId > CompetencyIdMax)
                {
                    problems.Add(new CareerFitRulesProblem(
                        fid, null, $"competency_rules[competency_id={rule.CompetencyId}]",
                        $"bad competency rule (competency_id {rule.CompetencyId}, role {rule.Role})"));
                }

                if (rule.Role is "CRITICAL" or "IMPORTANT")
                {
                    weightedCompetencies++;
                }
            }

            if (weightedCompetencies == 0)
            {
                problems.Add(new CareerFitRulesProblem(
                    fid, null, "competency_rules", "no CRITICAL/IMPORTANT competency -- competency fit would be 0.0"));
            }

            // -- MIL: all five subtests resolved to a known role, and the row weighs something
            var milWeight = 0.0;
            foreach (var subtest in Subtests)
            {
                var rule = family.MilRules.Subtests.FirstOrDefault(s => s.Subtest == subtest);
                if (rule is null || !ValidMilRoles.Contains(rule.Role))
                {
                    problems.Add(new CareerFitRulesProblem(
                        fid, null, $"mil_rules.{subtest}",
                        rule is null ? "MIL subtest unresolved: missing" : $"MIL subtest unresolved: role '{rule.Role}'"));
                    continue;
                }

                milWeight += EffectiveWeight(rule.Weight, rule.Role, rules.Weights.MilRole);
            }

            if (milWeight == 0)
            {
                problems.Add(new CareerFitRulesProblem(
                    fid, null, "mil_rules", "MIL row has zero weight -- MIL fit would be 0.0"));
            }

            // -- personality: non-empty, known dimensions, POLE/OPEN, pole belongs to the dimension
            if (family.PersonalityRoutes.Count == 0)
            {
                problems.Add(new CareerFitRulesProblem(fid, null, "personality_routes", "no personality routes"));
            }

            foreach (var route in family.PersonalityRoutes)
            {
                foreach (var dimension in route.Dimensions)
                {
                    var field = $"personality_routes[{route.RouteId}].dimensions.{dimension.Dimension}";
                    var ruleType = dimension.RuleType ?? "POLE";
                    if (!DimensionPoles.TryGetValue(dimension.Dimension, out var poles)
                        || !ValidPersonalityRuleTypes.Contains(ruleType))
                    {
                        problems.Add(new CareerFitRulesProblem(
                            fid, null, field, $"bad personality rule (rule_type {ruleType}, preferred_pole {dimension.PreferredPole ?? "null"})"));
                    }
                    else if (ruleType == "POLE" && (dimension.PreferredPole is null || !poles.Contains(dimension.PreferredPole)))
                    {
                        problems.Add(new CareerFitRulesProblem(
                            fid, null, field, $"pole '{dimension.PreferredPole ?? "null"}' is not one of {dimension.Dimension}"));
                    }
                }
            }

            // -- 360: every code in the catalogue, and the BASE row weighs something
            var v360Weight = 0.0;
            foreach (var rule in family.V360Rules)
            {
                if (!codes.Contains(rule.Code))
                {
                    problems.Add(new CareerFitRulesProblem(
                        fid, null, $"v360_rules.{rule.Code}", $"unknown 360 code '{rule.Code}'"));
                }

                if (rule.UseMode == "BASE" && rule.Relevance > 0)
                {
                    v360Weight += rule.BaseWeight * rule.Relevance;
                }
            }

            if (v360Weight == 0)
            {
                problems.Add(new CareerFitRulesProblem(
                    fid, null, "v360_rules", "360 row has zero weight -- 360 fit would be 0.0"));
            }
        }

        return problems;
    }

    // Python: float(r.get("weight") or rules["weights"]["mil_role"].get(r["role"], 0)) — a missing OR
    // zero explicit weight falls back to the role's default weight; an unknown role weighs 0.
    private static double EffectiveWeight(double? explicitWeight, string role, IReadOnlyDictionary<string, double> roleWeights)
    {
        if (explicitWeight is { } w && w != 0.0)
        {
            return w;
        }

        return roleWeights.TryGetValue(role, out var fallback) ? fallback : 0.0;
    }
}
