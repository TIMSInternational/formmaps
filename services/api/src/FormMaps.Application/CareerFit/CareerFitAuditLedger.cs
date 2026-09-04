using System.Globalization;

namespace FormMaps.Application.CareerFit;

// FM-CF-010, the acceptance half: "a record per formula step, shipped with the scores (§21)", validated as
// "audit row count == formula steps per family per student". P1-P3 shipped the audit that rides along with
// the scores as evaluate_owner's four blocks (audit_inputs / convergence_detail / critical_gaps /
// mil_relative_strengths) -- a per-family BLOB. This file turns that into a STEP LEDGER: for each family,
// one record per application of an F01-F23 formula that the evaluation actually executed, naming the step,
// what went in, what came out, and the rule or threshold that governed it, in execution order.
//
// THE HARD CONSTRAINT, AND HOW IT IS MET. EvaluateCore reproduces the reference engine at 0.0 deviation and
// must keep doing so, so nothing here is inside the scoring path. CareerFitFormulas.EvaluateOwner -- the
// function the parity fixture holds to formmaps_engine_reference.py -- is untouched and produces no ledger.
// The ledger is built AFTERWARDS, as a reader over the values EvaluateOwner already retained (RouteScore
// components and scores, MIL components, personality route scores, 360 variable evidence, the returned
// scalars) plus re-invocations of the SAME pure statics for the two leaf values the engine does not keep
// (competency attainment, F12/F13; the raw evidence-support test, F22/F23). It cannot move a number because
// it never computes one that reaches a score.
//
// WHAT "A FORMULA STEP" MEANS HERE. §21 of the TIMS implementation specification is not among the vendored
// sources (docs/careerfit/sources holds the workbook, the model config and the reference engine; the
// manifest cites §21, §25, §26 and §29 of a document FormMaps was never given), so the granularity is read
// off the two normative artefacts we do have: the workbook's own formula sheet 13_FORMULAS_ENGINE, which
// subscripts each formula by what it is applied to, and evaluate_owner's order of operations. One record
// per APPLICATION:
//
//   F07/F08/F09  per (route, factor) that contributes -- the reference skips OPEN directions and weights
//                <= 0 before the weighted mean, so those factors execute nothing and record nothing.
//   F10          per PCA route.                          F11  once (select_best_route).
//   F12/F13      per competency rule whose role carries a scoring weight; COMPLEMENTARY / DIFFERENTIATOR
//                rules never reach competency_attainment.
//   F14, F15     once each.
//   F16          once.                                    F17  per MIL subtest (rel_k is subscripted by k).
//   F18          per personality route.                   F19  once.
//   F06          once. F01-F05 are the 360 AGGREGATION pipeline (item -> source -> variable) and do not run
//                at all while the registered IV360Adapter is NoDataV360Adapter: the assessment arrives with
//                aggregates already formed, or with none. They will be recorded by FM-CF-007's aggregator,
//                which is where they actually execute -- "F01-F23 as applicable to that family".
//   F20          once.
//   F22          per convergence instrument (4). F23 only where F22 did not already answer STRONG:
//                evidence_support RETURNS on the strong test, so the partial test never runs for a STRONG
//                instrument. This is the one term that moves with the student rather than with the rules.
//   F21          once, and only once the family has been ranked (assign_relative_fit runs after every
//                family is scored, so an unranked evaluation has not executed F21 and does not record it).
//
// Two things deliberately do NOT get a record: the gates (COMP_GATE / MIL_GATE / FINAL_GATE are sheet 14
// and step 17 of 16_PASO_A_PASO, not F-numbered formulas, and they are already typed columns on the family
// row), and mil_band (a band lookup from rules.thresholds.mil_bands, carried inside F16's own rule block).
// Keeping the ledger to F01-F23 is what makes its row count derivable from the rule set instead of from a
// convention nobody can re-check.
//
// WHERE IT IS PERSISTED. Inside careerfit_family_results."audit" as `formula_steps`, not in a new table.
// The read pattern is always "the whole derivation for this (run, family)", which is the row that is being
// fetched anyway; nothing filters, joins or aggregates on a step. And the row count argues the same way: 14
// families x ~40-60 steps is ~650-700 records per run, so a table would cost ~700 tuples plus index entries
// per evaluation, per student, forever (runs are immutable -- a re-evaluation is a new run), to serve
// queries that would all be `WHERE runId = ? AND familyId = ?`. A jsonb array on the row the ledger explains
// is one TOASTed value per family, ships with the scores by construction, cannot be read apart from them,
// and inherits careerfit_family_results' RLS unchanged. See CareerFitRunJson.
//
// Deliberately NOT here: any I/O, any presentation or narrative (FM-CF-011 owns the payload; nothing in a
// record is student-facing copy), and any recomputation whose result could reach a score.

/// <summary>
/// One application of one F01–F23 formula during an evaluation: which step, what it consumed, what it
/// produced, and the rule or threshold that decided it. <see cref="Output"/> is the numeric result;
/// <see cref="OutputLabel"/> carries a categorical one (a winning route id, a support label) and both may
/// be present. Persisted as one element of <c>careerfit_family_results."audit" -&gt; formula_steps</c>.
/// </summary>
public sealed record FormulaStep(
    int Sequence,
    string StepId,
    string Name,
    string Block,
    string Target,
    IReadOnlyDictionary<string, object?> Inputs,
    double? Output,
    string? OutputLabel,
    IReadOnlyDictionary<string, object?> Rule);

/// <summary>Name and workbook block of one F01–F23 formula (13_FORMULAS_ENGINE, columns "Nombre" and "Bloque").</summary>
public sealed record FormulaDefinition(string Id, string Name, string Block);

/// <summary>Builds the per-formula-step audit ledger for one evaluated family. Pure: reads results, computes no score.</summary>
public static class CareerFitAuditLedger
{
    /// <summary>
    /// The formula catalogue, verbatim from workbook sheet 13_FORMULAS_ENGINE, so a record's name and block
    /// are the spec's own and cannot drift. F01–F05 are listed but never emitted in this slice (see the file
    /// header): they belong to the 360 aggregation pipeline, which FM-CF-006/007 owns.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, FormulaDefinition> Formulas =
        new[]
        {
            new FormulaDefinition("F01", "NormalizeLikert", "360"),
            new FormulaDefinition("F02", "Integrate360Sources", "360"),
            new FormulaDefinition("F03", "Consensus360", "360"),
            new FormulaDefinition("F04", "Coverage360", "360"),
            new FormulaDefinition("F05", "Confidence360 V1", "360"),
            new FormulaDefinition("F06", "CareerFit360", "360"),
            new FormulaDefinition("F07", "PCA factor ACTIVE", "PCA"),
            new FormulaDefinition("F08", "PCA factor PASSIVE", "PCA"),
            new FormulaDefinition("F09", "PCA factor NEUTRAL", "PCA"),
            new FormulaDefinition("F10", "PCA RouteFit", "PCA"),
            new FormulaDefinition("F11", "PCA FamilyFit", "PCA"),
            new FormulaDefinition("F12", "CompetencyAttainment Critical", "Competencias"),
            new FormulaDefinition("F13", "CompetencyAttainment Important", "Competencias"),
            new FormulaDefinition("F14", "CompetencyFit", "Competencias"),
            new FormulaDefinition("F15", "PCA_Index", "PCA"),
            new FormulaDefinition("F16", "MIL FamilyFit", "MIL"),
            new FormulaDefinition("F17", "MIL Relative", "MIL"),
            new FormulaDefinition("F18", "Personality RouteFit", "Personality"),
            new FormulaDefinition("F19", "Personality FamilyFit", "Personality"),
            new FormulaDefinition("F20", "CareerFit Absolute", "Integración"),
            new FormulaDefinition("F21", "RelativeFit", "Ranking"),
            new FormulaDefinition("F22", "ConvergenceStrong", "Convergencia"),
            new FormulaDefinition("F23", "ConvergencePartial", "Convergencia"),
        }.ToDictionary(f => f.Id, StringComparer.Ordinal);

    /// <summary>
    /// The 360 AGGREGATION ledger: F01–F05, recorded ONCE PER STUDENT rather than once per family.
    ///
    /// F01–F05 build the global aggregate map — every scored variable's source-integrated score, consensus,
    /// coverage and confidence index — before any family exists; F06 is the first 360 formula a family
    /// subscripts, and it is the family ledger's. Recording the pipeline here means each application is
    /// recorded exactly once instead of fourteen identical times, and leaves
    /// <see cref="Build"/>'s row count derivable from the rule set alone.
    ///
    /// Empty when no 360 evidence was aggregated (<c>v360_source = NO_DATA</c>): nothing executed, so
    /// nothing is recorded — which is every student until FM-CF-006 seeds the 40 items.
    ///
    /// GRANULARITY OF F01, stated plainly because it is the one place this ledger aggregates rather than
    /// reports. normalize_likert applies per ITEM ANSWER. The raw answers live in
    /// <c>vocational_responses</c> and are not copied here; what the aggregator retains, and what
    /// integrate_sources actually receives, is one score per (variable, rater source) — the mean of that
    /// source's normalized answers. So F01 is recorded at that granularity, with the aggregation named on
    /// the record's rule block. Duplicating up to 40 items × 4 raters of raw Likert values into every run's
    /// audit would restate rows that already exist under their own RLS, to make the count larger rather
    /// than the derivation clearer.
    /// </summary>
    public static IReadOnlyList<FormulaStep> BuildV360Aggregation(Adapters.InputQuality quality, CareerFitRules rules)
    {
        ArgumentNullException.ThrowIfNull(quality);
        ArgumentNullException.ThrowIfNull(rules);

        var steps = new List<FormulaStep>(64);
        if (quality.V360Variables.Count == 0)
        {
            return steps;
        }

        var sourceWeights = rules.Weights.V360Sources;
        foreach (var variable in quality.V360Variables)
        {
            AppendV360Variable(steps, variable, variable.Code, sourceWeights, rules.Thresholds.V360Confidence);
        }

        // The instrument arm: the SAME four formulas applied once more over the per-source OVERALL 360
        // scores. This is where the run's single careerfit360_confidence label comes from, and it is the
        // label F23 consults when it decides whether a STRONG 360 stands — so it is a step, not a summary.
        if (quality.V360Instrument is { } instrument)
        {
            AppendV360Variable(steps, instrument, V360Target, sourceWeights, rules.Thresholds.V360Confidence, isInstrument: true);
        }

        return steps;
    }

    /// <summary>One variable's (or the instrument's) F01 × sources, then F02 / F03 / F04 / F05.</summary>
    private static void AppendV360Variable(
        List<FormulaStep> steps,
        Adapters.V360VariableAudit variable,
        string target,
        IReadOnlyDictionary<string, double> sourceWeights,
        V360ConfidenceThresholds confidence,
        bool isInstrument = false)
    {
        var sourceScores = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var weights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var source in sourceWeights.Keys)
        {
            if (!variable.SourceScores.TryGetValue(source, out var score))
            {
                continue;   // that source did not answer: no score reached F02, so nothing executed for it
            }

            sourceScores[source] = score;
            weights[source] = sourceWeights[source];

            // F01 is not recorded for the instrument arm: its inputs are already-normalized variable
            // scores, so normalize_likert does not run a second time.
            if (isInstrument)
            {
                continue;
            }

            Add(steps,
                "F01",
                $"{target}.{source}",
                Inputs(("variable", (object?)variable.Code), ("source", source)),
                score,
                null,
                Inputs(
                    ("formula", "(response - 1) / 4 * 100"),
                    ("domain", "the integers 1..5; anything else fails closed (V360_RESPONSE_OUT_OF_RANGE)"),
                    ("applied", "per item answer; recorded once per (variable, rater source) as the mean of that source's normalized answers — the value integrate_sources receives"),
                    ("raw_answers", "vocational_responses, under their own RLS; not copied into the audit")));
        }

        var integrationRule = Inputs(
            ("formula", "sum(source_score * source_weight) / sum(source_weight over answering sources)"),
            ("weights", weights),
            ("valid_sources", variable.ValidSources));

        Add(steps, "F02", target, sourceScores, variable.Score, null, integrationRule);

        Add(steps,
            "F03",
            target,
            sourceScores,
            variable.Consensus,
            null,
            Inputs(
                ("formula", "100 - (max(source_scores) - min(source_scores))"),
                ("requires", "valid_sources >= 2"),
                ("valid_sources", variable.ValidSources),
                ("note", variable.Consensus is null
                    ? "undefined: fewer than two rater sources answered, so there is no second opinion to differ from"
                    : "defined")));

        Add(steps,
            "F04",
            target,
            sourceScores,
            variable.SourceCoverage,
            null,
            Inputs(
                ("formula", "sum(source_weight over answering sources)"),
                ("weights", weights),
                ("valid_sources", variable.ValidSources),
                ("not_item_coverage", $"items answered {variable.ItemsAnswered} of {variable.ItemsExpected} asked — recorded separately because the two fail differently")));

        Add(steps,
            "F05",
            target,
            Inputs(
                ("consensus", (object?)variable.Consensus),
                ("coverage", variable.SourceCoverage),
                ("valid_sources", variable.ValidSources)),
            variable.ConfidenceIndex,
            LabelFor(variable.ConfidenceIndex, confidence),
            Inputs(
                ("formula", "consensus_weight * consensus + coverage_weight * coverage * 100"),
                ("requires", "valid_sources >= 2 and a defined consensus"),
                ("valid_sources", variable.ValidSources),
                ("consensus_weight", confidence.ConsensusWeight),
                ("coverage_weight", confidence.CoverageWeight),
                ("high_min", confidence.HighMin),
                ("medium_min", confidence.MediumMin)));
    }

    /// <summary>The confidence label the index carries; NOT_DETERMINABLE when F05 declined to produce one.</summary>
    private static string LabelFor(double? index, V360ConfidenceThresholds confidence) =>
        index switch
        {
            null => Confidence.NotDeterminable.ToReferenceValue(),
            var i when i >= confidence.HighMin => Confidence.High.ToReferenceValue(),
            var i when i >= confidence.MediumMin => Confidence.Medium.ToReferenceValue(),
            _ => Confidence.Low.ToReferenceValue(),
        };

    /// <summary>Target of the steps that apply to a whole block rather than to one route, factor or subtest.</summary>
    private const string PcaTarget = "PCA";
    private const string CompetenciesTarget = "COMPETENCIES";
    private const string MilTarget = "MIL";
    private const string PersonalityTarget = "PERSONALITY";
    private const string V360Target = "360";
    private const string CareerFitTarget = "CAREERFIT";

    /// <summary>
    /// The ledger for one family of one run, in the order <see cref="CareerFitFormulas.EvaluateOwner"/>
    /// executed the formulas: PCA factors and routes → winner → competency attainments → CompetencyFit →
    /// PCA_Index → MIL → personality → CareerFit360 → CareerFitAbsolute → convergence → RelativeFit.
    /// <paramref name="evaluation"/> must be the OwnerEvaluation produced from the same
    /// <paramref name="assessment"/> and <paramref name="resolvedRules"/>; <paramref name="alternatives"/> is
    /// the N of F21 (how many families were ranked together) and is read only when the family carries a rank.
    /// </summary>
    public static IReadOnlyList<FormulaStep> Build(
        CareerFitAssessment assessment,
        ResolvedFamilyRules resolvedRules,
        CareerFitWeights weights,
        CareerFitThresholds thresholds,
        OwnerEvaluation evaluation,
        int alternatives)
    {
        ArgumentNullException.ThrowIfNull(assessment);
        ArgumentNullException.ThrowIfNull(resolvedRules);
        ArgumentNullException.ThrowIfNull(weights);
        ArgumentNullException.ThrowIfNull(thresholds);
        ArgumentNullException.ThrowIfNull(evaluation);

        var steps = new List<FormulaStep>(64);
        AppendPca(steps, assessment, resolvedRules, evaluation);
        AppendCompetencies(steps, assessment, resolvedRules, weights, evaluation);
        AppendPcaIndex(steps, weights, evaluation);
        AppendMil(steps, assessment, weights, thresholds, evaluation);
        AppendPersonality(steps, resolvedRules, evaluation);
        AppendV360(steps, evaluation);
        AppendAbsolute(steps, weights, evaluation);
        AppendConvergence(steps, thresholds, evaluation);
        AppendRelative(steps, evaluation, alternatives);
        return steps;
    }

    // ---------------------------------------------------------------- PCA (F07–F11)

    private static void AppendPca(
        List<FormulaStep> steps, CareerFitAssessment assessment, ResolvedFamilyRules resolvedRules, OwnerEvaluation evaluation)
    {
        var scored = evaluation.AuditInputs.PcaRoutes;
        if (scored.Count != resolvedRules.PcaRoutes.Count)
        {
            throw new ArgumentException(
                $"Family {evaluation.OwnerId}: the evaluation carries {scored.Count} scored PCA routes for {resolvedRules.PcaRoutes.Count} resolved ones.",
                nameof(evaluation));
        }

        var routeScores = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        for (var i = 0; i < scored.Count; i++)
        {
            var routeRules = resolvedRules.PcaRoutes[i];
            var route = scored[i];
            if (!string.Equals(routeRules.RouteId, route.RouteId, StringComparison.Ordinal))
            {
                throw new ArgumentException(
                    $"Family {evaluation.OwnerId}: scored route '{route.RouteId}' does not line up with resolved route '{routeRules.RouteId}'.",
                    nameof(evaluation));
            }

            // One record per factor that CONTRIBUTED — Components holds exactly those, in D/I/S/C order.
            var routeWeights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
            foreach (var (factor, match) in route.Components)
            {
                var rule = routeRules.Factor(factor)
                    ?? throw new ArgumentException(
                        $"Family {evaluation.OwnerId}: route '{route.RouteId}' scored factor '{factor}' the rules do not mention.", nameof(evaluation));
                routeWeights[factor] = rule.Weight;
                Add(steps,
                    StepIdForDirection(rule.Direction),
                    $"{route.RouteId}.{factor}",
                    Inputs(("score", (object?)assessment.Pca.Factor(factor))),
                    match,
                    null,
                    Inputs(
                        ("archetype", route.RouteId),
                        ("factor", factor),
                        ("direction", rule.Direction),
                        ("weight", rule.Weight),
                        ("source_text", rule.SourceText)));
            }

            Add(steps,
                "F10",
                route.RouteId,
                ToInputs(route.Components),
                route.Score,
                null,
                Inputs(
                    ("formula", "sum(match * weight) / sum(weight)"),
                    ("weights", routeWeights),
                    ("excluded", "OPEN direction or weight <= 0")));
            routeScores[route.RouteId] = route.Score;
        }

        Add(steps,
            "F11",
            PcaTarget,
            routeScores,
            evaluation.PcaRouteFit,
            evaluation.PcaWinningRoute,
            Inputs(("selection", "MAX"), ("tie_break", "FIRST_DECLARED"), ("routes", scored.Count)));
    }

    /// <summary>F07 / F08 / F09 by the direction the route rule declared; OPEN never reaches a record.</summary>
    private static string StepIdForDirection(string direction) => direction switch
    {
        "ACTIVE" => "F07",
        "PASSIVE" => "F08",
        "NEUTRAL" => "F09",
        _ => throw new ArgumentException($"A scored PCA factor cannot have direction '{direction}'", nameof(direction)),
    };

    // ---------------------------------------------------------------- competencies (F12–F14)

    private static void AppendCompetencies(
        List<FormulaStep> steps,
        CareerFitAssessment assessment,
        ResolvedFamilyRules resolvedRules,
        CareerFitWeights weights,
        OwnerEvaluation evaluation)
    {
        var attainments = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var appliedWeights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var rule in resolvedRules.CompetencyRules)
        {
            if (!weights.CompetencyRole.TryGetValue(rule.Role, out var roleWeight))
            {
                continue; // COMPLEMENTARY / DIFFERENTIATOR: no attainment is computed, so no step ran
            }

            var level = assessment.Competencies[rule.CompetencyId];
            var attainment = CareerFitFormulas.CompetencyAttainment(level, rule.Role, rule.MinimumLevel);
            var weight = rule.Weight is double w && w != 0.0 ? w : roleWeight;
            var key = rule.CompetencyId.ToString(CultureInfo.InvariantCulture);
            attainments[key] = attainment;
            appliedWeights[key] = weight;

            Add(steps,
                StepIdForCompetencyRole(rule.Role),
                $"competency:{key}",
                Inputs(("level", (object?)level)),
                attainment,
                null,
                Inputs(
                    ("role", rule.Role),
                    ("minimum_level", RequiredLevel(rule)),
                    ("weight", weight),
                    ("formula", "min(100, level / minimum_level * 100)")));
        }

        Add(steps,
            "F14",
            CompetenciesTarget,
            attainments,
            evaluation.CompetencyFit,
            null,
            Inputs(
                ("formula", "sum(attainment * weight) / sum(weight)"),
                ("weights", appliedWeights),
                ("excluded", "roles with no weight in rules.weights.competency_role")));
    }

    /// <summary>
    /// F12 for CRITICAL, F13 for IMPORTANT — the workbook names those two and no others. A rule set that gave
    /// a third role a scoring weight would still be scored (competency_attainment returns 100 for it), so the
    /// record is filed under F14, whose mean it feeds, rather than mislabelled as F12 or F13.
    /// </summary>
    private static string StepIdForCompetencyRole(string role) => role switch
    {
        "CRITICAL" => "F12",
        "IMPORTANT" => "F13",
        _ => "F14",
    };

    /// <summary>The minimum level competency_attainment actually applied (the reference's defaults: 2 CRITICAL, 1 IMPORTANT).</summary>
    private static object? RequiredLevel(CompetencyRule rule) => rule.Role switch
    {
        "CRITICAL" => rule.MinimumLevel ?? 2,
        "IMPORTANT" => rule.MinimumLevel ?? 1,
        _ => null,
    };

    // ---------------------------------------------------------------- F15

    private static void AppendPcaIndex(List<FormulaStep> steps, CareerFitWeights weights, OwnerEvaluation evaluation) =>
        Add(steps,
            "F15",
            PcaTarget,
            Inputs(("pca_route_fit", (object?)evaluation.PcaRouteFit), ("competency_fit", evaluation.CompetencyFit)),
            evaluation.PcaIndex,
            null,
            Inputs(
                ("formula", "W_DISC * pca_route_fit + W_COMP * competency_fit"),
                ("weights", new OrderedDictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["DISC"] = weights.PcaInternal.Disc,
                    ["COMPETENCIES"] = weights.PcaInternal.Competencies,
                })));

    // ---------------------------------------------------------------- MIL (F16–F17)

    private static void AppendMil(
        List<FormulaStep> steps,
        CareerFitAssessment assessment,
        CareerFitWeights weights,
        CareerFitThresholds thresholds,
        OwnerEvaluation evaluation)
    {
        var percentiles = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var roles = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var milWeights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var bands = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (subtest, component) in evaluation.AuditInputs.Mil.Components)
        {
            percentiles[subtest] = component.Percentile;
            roles[subtest] = component.Role;
            milWeights[subtest] = component.Weight;
            bands[subtest] = component.Band;
        }

        Add(steps,
            "F16",
            MilTarget,
            percentiles,
            evaluation.MilFit,
            null,
            Inputs(
                ("formula", "sum(percentile * weight) / sum(weight)"),
                ("roles", roles),
                ("weights", milWeights),
                ("bands", bands),
                ("role_weights", ToInputs(weights.MilRole)),
                ("band_rules", string.Join(", ", thresholds.MilBands.Select(b => $"{b.Name} {b.Min}-{b.Max}")))));

        // F17 is subscripted per subtest: rel_k = percentile_k / max(P5) * 100, over all five, always.
        var max = CareerFitFormulas.MilSubtests.Max(assessment.Mil.Subtest);
        foreach (var (subtest, relative) in evaluation.AuditInputs.Mil.RelativeStrengths)
        {
            Add(steps,
                "F17",
                subtest,
                Inputs(("percentile", (object?)assessment.Mil.Subtest(subtest)), ("max_percentile", max)),
                relative,
                null,
                Inputs(
                    ("formula", "percentile / max(P5) * 100"),
                    ("scope", "intra-person; not family-specific and never a fit")));
        }
    }

    // ---------------------------------------------------------------- personality (F18–F19)

    private static void AppendPersonality(List<FormulaStep> steps, ResolvedFamilyRules resolvedRules, OwnerEvaluation evaluation)
    {
        var scored = evaluation.AuditInputs.Personality.AllRoutes;
        if (scored.Count != resolvedRules.PersonalityRoutes.Count)
        {
            throw new ArgumentException(
                $"Family {evaluation.OwnerId}: the evaluation carries {scored.Count} scored personality routes for {resolvedRules.PersonalityRoutes.Count} resolved ones.",
                nameof(evaluation));
        }

        var routeScores = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        for (var i = 0; i < scored.Count; i++)
        {
            var routeRules = resolvedRules.PersonalityRoutes[i];
            var route = scored[i];
            var poles = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
            var dimensionWeights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
            foreach (var dimension in routeRules.Dimensions)
            {
                if (!route.Components.ContainsKey(dimension.Dimension))
                {
                    continue; // OPEN, no pole, or weight <= 0: it never entered the mean
                }

                poles[dimension.Dimension] = dimension.PreferredPole;
                dimensionWeights[dimension.Dimension] = dimension.Weight ?? 1.0;
            }

            Add(steps,
                "F18",
                route.RouteId,
                ToInputs(route.Components),
                route.Score,
                null,
                Inputs(
                    ("formula", "sum(pole_score * weight) / sum(weight)"),
                    ("preferred_poles", poles),
                    ("weights", dimensionWeights),
                    ("excluded", "rule_type OPEN, no preferred pole, or weight <= 0")));
            routeScores[route.RouteId] = route.Score;
        }

        Add(steps,
            "F19",
            PersonalityTarget,
            routeScores,
            evaluation.PersonalityFit,
            evaluation.PersonalityWinningRoute,
            Inputs(("selection", "MAX"), ("tie_break", "FIRST_DECLARED"), ("gate", "NONE — personality never gates")));
    }

    // ---------------------------------------------------------------- 360 (F06)

    private static void AppendV360(List<FormulaStep> steps, OwnerEvaluation evaluation)
    {
        var scores = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        var combinedWeights = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (code, evidence) in evaluation.AuditInputs.V360.Variables)
        {
            scores[code] = evidence.Score;
            combinedWeights[code] = evidence.CombinedWeight;
        }

        var rule = Inputs(
            ("formula", "sum(score * base_weight * relevance) / sum(base_weight * relevance)"),
            ("selection", "use_mode = BASE and relevance > 0"),
            ("weights", combinedWeights),
            ("usable_variables", scores.Count));
        if (scores.Count == 0)
        {
            // The NoData 360 of P1-P3, stated on the record rather than left to be inferred from a bare 0.0.
            rule["note"] = "no usable 360 variable; F06 yields 0.0 and the 0.30 block weight multiplies zero";
        }

        Add(steps, "F06", V360Target, scores, evaluation.CareerFit360, null, rule);
    }

    // ---------------------------------------------------------------- F20

    private static void AppendAbsolute(List<FormulaStep> steps, CareerFitWeights weights, OwnerEvaluation evaluation) =>
        Add(steps,
            "F20",
            CareerFitTarget,
            Inputs(
                ("pca_index", (object?)evaluation.PcaIndex),
                ("mil_fit", evaluation.MilFit),
                ("personality_fit", evaluation.PersonalityFit),
                ("careerfit360", evaluation.CareerFit360)),
            evaluation.CareerFitAbsolute,
            null,
            Inputs(
                ("formula", "PCA * pca_index + MIL * mil_fit + PERSONALITY * personality_fit + VOCATIONAL_360 * careerfit360"),
                ("weights", new OrderedDictionary<string, object?>(StringComparer.Ordinal)
                {
                    ["PCA"] = weights.CareerFit.Pca,
                    ["MIL"] = weights.CareerFit.Mil,
                    ["PERSONALITY"] = weights.CareerFit.Personality,
                    ["VOCATIONAL_360"] = weights.CareerFit.Vocational360,
                }),
                ("scale", "0-100 score; never a percentage or a probability")));

    // ---------------------------------------------------------------- convergence (F22–F23)

    private static void AppendConvergence(List<FormulaStep> steps, CareerFitThresholds thresholds, OwnerEvaluation evaluation)
    {
        var convergence = thresholds.Convergence;
        var fits = new (string Instrument, double Fit)[]
        {
            ("PCA", evaluation.PcaIndex),
            ("MIL", evaluation.MilFit),
            ("PERSONALITY", evaluation.PersonalityFit),
            ("360", evaluation.CareerFit360),
        };

        foreach (var (instrument, fit) in fits)
        {
            var (strongMin, partialMin, source, provenance) = Cut(convergence, instrument);

            // The raw evidence_support test, re-run through the same static the engine used. The 360 support
            // convergence_level finally counts can be a DOWNGRADE of this one (a STRONG 360 whose confidence
            // is LOW or NOT_DETERMINABLE counts PARTIAL); that is a rule of convergence_level, not of F22, so
            // it is recorded on F22's rule block instead of being written into F22's own answer.
            var raw = CareerFitFormulas.EvidenceSupport(fit, convergence, instrument);
            var final = evaluation.ConvergenceDetail.Supports[instrument];

            var strongRule = Inputs(
                ("test", "fit >= strong_support_min"),
                ("threshold", strongMin),
                ("threshold_source", source),
                ("threshold_provenance", provenance));
            if (raw != final)
            {
                strongRule["final_support"] = final.ToReferenceValue();
                strongRule["downgrade_reason"] =
                    $"careerfit360_confidence = {evaluation.CareerFit360Confidence.ToReferenceValue()}; a STRONG 360 counts PARTIAL below MEDIUM confidence";
            }

            Add(steps, "F22", instrument, Inputs(("fit", (object?)fit)), null, raw == Support.Strong ? "STRONG" : "NOT_STRONG", strongRule);

            if (raw == Support.Strong)
            {
                continue; // evidence_support returned on the strong test; F23 did not execute
            }

            Add(steps,
                "F23",
                instrument,
                Inputs(("fit", (object?)fit)),
                null,
                raw.ToReferenceValue(),
                Inputs(
                    ("test", "partial_support_min <= fit < strong_support_min"),
                    ("threshold", partialMin),
                    ("threshold_source", source),
                    ("threshold_provenance", provenance)));
        }
    }

    /// <summary>The cut that decided this instrument: the D5 per_instrument pair when the rule set carries one, else the spec's single pair.</summary>
    private static (double StrongMin, double PartialMin, string Source, object? Provenance) Cut(
        ConvergenceThresholds thresholds, string instrument)
    {
        if (thresholds.PerInstrument is not null && thresholds.PerInstrument.TryGetValue(instrument, out var perInstrument))
        {
            return (perInstrument.StrongMin, perInstrument.PartialMin, "per_instrument", perInstrument.Provenance);
        }

        return (thresholds.StrongMin, thresholds.PartialMin, "spec_pair", "13_FORMULAS_ENGINE F22/F23");
    }

    // ---------------------------------------------------------------- F21

    private static void AppendRelative(List<FormulaStep> steps, OwnerEvaluation evaluation, int alternatives)
    {
        if (evaluation.RankPosition is not int rank || evaluation.CareerFitRelative is not double relative)
        {
            return; // assign_relative_fit has not run for this family, so F21 did not execute
        }

        Add(steps,
            "F21",
            CareerFitTarget,
            Inputs(("rank_position", (object?)rank), ("alternatives", alternatives), ("careerfit_absolute", evaluation.CareerFitAbsolute)),
            relative,
            null,
            Inputs(
                ("formula", "N == 1 ? 100 : 100 * (N - rank) / (N - 1)"),
                ("ordering", "careerfit_absolute descending; ties keep family order"),
                ("scale", "rank-derived spread; never a percentage or a probability")));
    }

    // ---------------------------------------------------------------- helpers

    private static void Add(
        List<FormulaStep> steps,
        string stepId,
        string target,
        IReadOnlyDictionary<string, object?> inputs,
        double? output,
        string? outputLabel,
        IReadOnlyDictionary<string, object?> rule)
    {
        var definition = Formulas[stepId];
        steps.Add(new FormulaStep(steps.Count + 1, definition.Id, definition.Name, definition.Block, target, inputs, output, outputLabel, rule));
    }

    private static OrderedDictionary<string, object?> Inputs(params (string Key, object? Value)[] entries)
    {
        var map = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in entries)
        {
            map[key] = value;
        }

        return map;
    }

    private static OrderedDictionary<string, object?> ToInputs<TValue>(IReadOnlyDictionary<string, TValue> source)
    {
        var map = new OrderedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var (key, value) in source)
        {
            map[key] = value;
        }

        return map;
    }
}
