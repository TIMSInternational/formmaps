using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

// FM-CF-007 (variable-level aggregation) + FM-CF-008 (per-family relevance weighting, the adapter's half
// of it). The platform's vocational chassis stores one row per rater group per item; the engine wants one
// V360Aggregate per 360 VARIABLE. This file is the whole of that translation and nothing else:
//
//   item responses -> per source, per variable, the mean of F01-normalized answers
//                  -> F02/F03/F04 IntegrateSources over rules.weights.v360_sources
//                  -> F05 Confidence360 over rules.thresholds.v360_confidence
//                  -> V360Aggregate(score, consensus, confidence_index)
//
// Every number comes from CareerFitFormulas; this file restates no arithmetic. Per-family relevance
// weighting (F06, base_weight x relevance) is evaluate_owner's and stays there — the adapter's only part
// in FM-CF-008 is deciding WHICH variables may reach it (see ExcludedInV1).
//
// Deliberately NOT here: any I/O (the caller reads the rows — FM-CF-010's CareerFitInputReader, through
// the chassis's own VocationalResponseLoader), any per-family arithmetic (the aggregate map is global; a
// family sees it only through its own v360_rules), any use of ThreeSixtyProfile (that block is the
// platform's CATEGORY-level 360 and cannot answer a VARIABLE-level question), and any item text — the 40
// texts are TIMS's to deliver (FM-CF-006) and nothing here invents one.
//
// WHAT THIS ASSUMES ABOUT FM-CF-006, AND HOW IT FAILS IF THE ASSUMPTION IS WRONG. The items are not
// seeded yet, so the carrier of a variable code is not yet a fact. This adapter reads it from
// vocational_responses."dimensionKey" — the chassis's own per-response variable slot, the one
// VocationalScoring already groups on. If FM-CF-006 seeds the codes somewhere else, NOTHING here matches,
// the adapter selects the NoData path, and the run reads exactly as it does today (zero 360, confidence
// NOT_DETERMINABLE) instead of scoring something wrong. That degradation is the point.

/// <summary>
/// Aggregates a student's stored 360 item responses to VARIABLE level: per code in
/// rules.v360_variables, the source-integrated score, the consensus across rater sources and the
/// confidence index, plus a per-variable audit trail. Pure and I/O-free.
/// </summary>
public static class V360Aggregation
{
    /// <summary>
    /// FM-CF-008 — the V1 exclusion, by name. IND (P36, "Afinidad por Industrias") is a SELECTION over 20
    /// industries, not a Likert item: the reference's aggregate is one scalar per variable, and turning a
    /// 20-industry vector into a scalar for a career family needs an industry → family projection that TIMS
    /// has not delivered. Any number the adapter emitted for it would be invented, and it would be the
    /// heaviest invention in the block — IND carries base_weight 0.1, four times AN's, and appears in
    /// EVERY scorable family's v360_rules. So it is excluded here, at the point where the evidence is read,
    /// and the exclusion is recorded on the run (V360_IND_EXCLUDED). The rule set is untouched: when TIMS
    /// delivers the projection, the exclusion is deleted and F06 picks IND up from the rules it already
    /// carries. Removing it leaves every scorable family with weighted BASE rules (pinned by a test).
    /// </summary>
    public static readonly IReadOnlyList<string> ExcludedInV1 = ["IND"];

    /// <summary>
    /// Platform rater group (<see cref="VocationalScoring.Groups"/>) → the engine source keyed in
    /// rules.weights.v360_sources. The chassis's fourth group is "sibling_friend"; the rule set calls it
    /// PEER. Two groups of the same type (the chassis keeps two teachers as two groups) pool into that ONE
    /// source, because the reference's integrate_sources has exactly one score per source and would
    /// otherwise see a duplicate key.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> SourceOfGroup =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["self"] = "SELF",
            ["parent"] = "PARENT",
            ["teacher"] = "TEACHER",
            ["sibling_friend"] = "PEER",
        };

    private const string LikertType = "likert";
    private const string RankingType = "ranking";

    /// <summary>
    /// The 360 variable whose item is the student's own forced ranking of 20 areas (P35). TIMS open
    /// question 5 — "does P35 enter the score at 0.10?" — is UNANSWERED, and this adapter does not answer
    /// it. The weight is the rule set's: RANK carries base_weight 0 in rules.v360_variables and appears in
    /// no family's v360_rules in 1.0.0-draft.1, so it contributes nothing today, and if TIMS says yes that
    /// is a rule-set change, not a change here. What the adapter cannot do either way is manufacture the
    /// scalar: a ranking of 20 AREAS scores a family only through an area → family projection, and the
    /// aggregate map is global — it is built once for all fourteen families. So the ranking is recognised,
    /// recorded as not scored (V360_RANK_NOT_SCORED), and left alone. The same wall applies to the other
    /// vector and free-text variables (ACT, BARR, OPEN_TALENT, OPEN_10Y), which likewise carry base_weight
    /// 0 and appear in no family's rules.
    /// </summary>
    public const string RankingVariable = "RANK";

    /// <summary>
    /// Aggregate one student's rater groups to variable level under <paramref name="rules"/>. Returns the
    /// <see cref="NoDataV360Adapter"/> adaptation — empty map, NOT_DETERMINABLE, source NO_DATA — when no
    /// response maps to a scorable 360 variable, which is the case for EVERY student until FM-CF-006 seeds
    /// the items. Throws <see cref="CareerFitInputException"/> for a Likert rating outside 1..5.
    /// </summary>
    public static V360Adaptation Adapt(CareerFitRules rules, IReadOnlyList<ScoringGroup>? raterGroups)
    {
        ArgumentNullException.ThrowIfNull(rules);

        if (raterGroups is null || raterGroups.Count == 0)
        {
            return NoDataV360Adapter.Adapt(
                "360 not adapted: the student has no completed vocational rater group; aggregates empty, confidence NOT_DETERMINABLE.");
        }

        var warnings = new List<InputWarning>();
        var collected = Collect(rules, raterGroups, warnings);

        // THE NO-EVIDENCE SELECTION, MADE EXPLICITLY. Not "the dictionary came out empty": the adapter
        // asks whether any response reached a scorable variable and, when none did, hands over to the
        // fallback by name. Warnings gathered on the way (an unknown code, an unknown rater group) are
        // kept — they are the evidence for WHY there was nothing to score.
        if (collected.Count == 0)
        {
            var fallback = NoDataV360Adapter.Adapt(
                "360 not adapted: the student's vocational responses carry no code from rules.v360_variables "
                + "(the 40 items are not seeded — FM-CF-006); aggregates empty, confidence NOT_DETERMINABLE.");
            return fallback with { Warnings = [.. warnings, .. fallback.Warnings] };
        }

        var sourceWeights = rules.Weights.V360Sources;
        var aggregates = new OrderedDictionary<string, V360Aggregate>(StringComparer.Ordinal);
        var audits = new List<V360VariableAudit>(collected.Count);

        // The rule set's DECLARED variable order, never the order the responses happened to arrive in:
        // F06 accumulates its weighted means in sequence and the port is held to the reference bit for bit.
        foreach (var variable in rules.V360Variables)
        {
            if (!collected.TryGetValue(variable.Code, out var evidence))
            {
                continue;
            }

            var scores = sourceWeights.Keys
                .Select(source => new SourceScore(source, evidence.MeanFor(source)))
                .ToList();

            var integration = CareerFitFormulas.IntegrateSources(scores, sourceWeights);
            if (integration.Score is not double score)
            {
                continue; // no source answered this variable; the reference produces no aggregate either
            }

            var confidence = CareerFitFormulas.Confidence360(
                integration.Consensus, integration.Coverage, integration.ValidSources, rules.Thresholds.V360Confidence);

            aggregates[variable.Code] = new V360Aggregate(score, integration.Consensus, confidence.Index);
            audits.Add(new V360VariableAudit(
                Code: variable.Code,
                Score: score,
                Consensus: integration.Consensus,
                ConfidenceIndex: confidence.Index,
                SourceCoverage: integration.Coverage,
                ValidSources: integration.ValidSources,
                ItemsAnswered: evidence.ItemsAnswered,
                ItemsExpected: evidence.ItemsExpected,
                Sources: evidence.SourcesInWeightOrder(sourceWeights.Keys))
            {
                // F01's output per source, which is F02's input. Kept so the integrated score above is
                // re-derivable from the record alone (FM-CF-010's F01/F02 steps read exactly this).
                SourceScores = Kept(integration.SourceScores),
            });

            if (evidence.ItemsAnswered < evidence.ItemsExpected * evidence.SourceCount)
            {
                warnings.Add(new InputWarning(
                    InputInstruments.V360,
                    InputWarningCodes.V360PartialCoverage,
                    $"360 variable {variable.Code}: {evidence.ItemsAnswered} of {evidence.ItemsExpected * evidence.SourceCount} "
                    + $"item answers present across {evidence.SourceCount} rater source(s); the score is the mean of the answers given."));
            }
        }

        // Belt and braces on the same selection: if nothing survived integration, the fallback is still the
        // answer. Reachable only if a variable's every source dropped out, which Collect already prevents —
        // and an empty map reported as VOCATIONAL_RESPONSES would be exactly the "accident of an empty
        // query" this adapter exists to make impossible.
        if (aggregates.Count == 0)
        {
            var fallback = NoDataV360Adapter.Adapt(
                "360 not adapted: no 360 variable survived source integration; aggregates empty, confidence NOT_DETERMINABLE.");
            return fallback with { Warnings = [.. warnings, .. fallback.Warnings] };
        }

        var (globalIntegration, global) = GlobalConfidence(rules, audits, sourceWeights);

        // V1 IS SELF-ONLY 360 (careerfit.manifest.json decision 1), so this is the normal case, not an
        // edge one: with a single rater source there is no second opinion to differ from, the reference's
        // consensus (100 − (max − min) over the sources) is undefined and returns None, and F05 refuses to
        // label a confidence at all. Every aggregate therefore carries a real score, a null consensus and a
        // null confidence index, and the run's global confidence is NOT_DETERMINABLE — which in
        // convergence_level downgrades a STRONG 360 to PARTIAL, capping convergence at SOLID. That is the
        // honest reading of one rater. The alternative — calling one rater unanimous and emitting consensus
        // 100 — would make the weakest evidence look like the strongest.
        if (globalIntegration.ValidSources == 1)
        {
            warnings.Add(new InputWarning(
                InputInstruments.V360,
                InputWarningCodes.V360SingleRater,
                $"360 answered by ONE rater source ({globalIntegration.SourceScores!.Keys.First()}): consensus across raters is "
                + "undefined with a single rater, so every variable's consensus and confidence index are null and the global "
                + "confidence is NOT_DETERMINABLE. V1 is self-only 360; multi-rater is V1.1."));
        }

        warnings.Add(new InputWarning(
            InputInstruments.V360,
            InputWarningCodes.V360Adapted,
            $"360 adapted from the vocational chassis: {aggregates.Count} of {rules.V360Variables.Count} variables scored "
            + $"from {globalIntegration.ValidSources} rater source(s); global confidence {global.Label}."));

        return new V360Adaptation(aggregates, global.Label, V360Sources.VocationalResponses, warnings, audits)
        {
            // The instrument arm of the same four formulas, recorded rather than left implicit in the one
            // Confidence label: it is what F23 consults when it decides whether a STRONG 360 stands.
            Instrument = new V360VariableAudit(
                Code: InputInstruments.V360,
                Score: globalIntegration.Score,
                Consensus: globalIntegration.Consensus,
                ConfidenceIndex: global.Index,
                SourceCoverage: globalIntegration.Coverage,
                ValidSources: globalIntegration.ValidSources,
                ItemsAnswered: audits.Sum(a => a.ItemsAnswered),
                ItemsExpected: audits.Sum(a => a.ItemsExpected),
                Sources: sourceWeights.Keys.Where(k => globalIntegration.SourceScores?.ContainsKey(k) == true).ToList())
            {
                SourceScores = Kept(globalIntegration.SourceScores),
            },
        };
    }

    /// <summary>
    /// The ONE global <see cref="Confidence"/> label evaluate_owner receives as
    /// <c>careerfit360_confidence</c>, and the only place a 360 confidence can downgrade a STRONG 360 to
    /// PARTIAL in convergence_level (F23). It is F05 applied once at INSTRUMENT level: each rater source's
    /// overall 360 score is the mean of the variable scores it produced, those go through the same
    /// IntegrateSources the variables use, and the resulting consensus / coverage / valid_sources go
    /// through Confidence360. One rater → no consensus → NOT_DETERMINABLE, which is what V1 (self-only)
    /// gets, and no spread is manufactured to avoid it.
    ///
    /// This is the GLOBAL arm of TIMS open question 7 ("which confidence gates the 360 'strong' test —
    /// global, or the relevance-weighted index"). The other arm is already computed and already shipped
    /// next to it: CalculateCareerFit360 returns the relevance-weighted mean of the same per-variable
    /// confidence indices as <c>CareerFit360Result.ConfidenceIndex</c>, per family. When TIMS answers,
    /// whichever arm loses is deleted; neither has to be recomputed.
    /// </summary>
    private static (SourceIntegration Integration, ConfidenceResult Confidence) GlobalConfidence(
        CareerFitRules rules, IReadOnlyList<V360VariableAudit> audits, IReadOnlyDictionary<string, double> sourceWeights)
    {
        var perSource = new List<SourceScore>(sourceWeights.Count);
        foreach (var source in sourceWeights.Keys)
        {
            var scored = audits.Where(a => a.Sources.Contains(source)).ToList();
            perSource.Add(new SourceScore(source, scored.Count == 0 ? null : scored.Average(a => a.Score!.Value)));
        }

        var integration = CareerFitFormulas.IntegrateSources(perSource, sourceWeights);
        return (integration, CareerFitFormulas.Confidence360(
            integration.Consensus, integration.Coverage, integration.ValidSources, rules.Thresholds.V360Confidence));
    }

    /// <summary>The valid source scores integrate_sources kept, as an owned map; empty rather than null when no source answered.</summary>
    private static IReadOnlyDictionary<string, double> Kept(IReadOnlyDictionary<string, double>? sourceScores) =>
        sourceScores is null
            ? new Dictionary<string, double>(StringComparer.Ordinal)
            : new Dictionary<string, double>(sourceScores, StringComparer.Ordinal);

    // ---------------------------------------------------------------- collection

    /// <summary>
    /// Bucket the raw responses: variable code → source → the F01-normalized answers, plus the item set the
    /// variable was asked on. Everything that is NOT a scorable Likert answer is dropped here and recorded:
    /// an unknown rater group, an unknown / absent variable code, the V1-excluded codes, the ranking item.
    /// </summary>
    private static OrderedDictionary<string, VariableEvidence> Collect(
        CareerFitRules rules, IReadOnlyList<ScoringGroup> raterGroups, List<InputWarning> warnings)
    {
        var codes = rules.V360Variables.Select(v => v.Code).ToHashSet(StringComparer.Ordinal);
        var excluded = new HashSet<string>(ExcludedInV1, StringComparer.Ordinal);
        var collected = new OrderedDictionary<string, VariableEvidence>(StringComparer.Ordinal);
        var reportedGroups = new HashSet<string>(StringComparer.Ordinal);
        var reportedCodes = new HashSet<string>(StringComparer.Ordinal);
        var reportedExclusions = new HashSet<string>(StringComparer.Ordinal);
        var rankingReported = false;

        foreach (var group in raterGroups)
        {
            if (!SourceOfGroup.TryGetValue(group.Group, out var source))
            {
                if (reportedGroups.Add(group.Group))
                {
                    warnings.Add(new InputWarning(
                        InputInstruments.V360,
                        InputWarningCodes.V360RaterGroupUnknown,
                        $"360 rater group '{group.Group}' is not one of the four the rule set weights "
                        + $"({string.Join(", ", SourceOfGroup.Keys)}); its answers were not aggregated."));
                }

                continue;
            }

            foreach (var response in group.Responses)
            {
                var code = response.DimensionKey;

                // P35. Recognised, never scored — see RankingVariable and TIMS open question 5.
                if (response.Type == RankingType)
                {
                    if (!rankingReported && (code is null || code == RankingVariable))
                    {
                        rankingReported = true;
                        warnings.Add(new InputWarning(
                            InputInstruments.V360,
                            InputWarningCodes.V360RankNotScored,
                            $"360 variable {RankingVariable} (P35, the student's own ranking) was answered but is not scored: "
                            + "its weight is the rule set's (base_weight 0 and no family rule in 1.0.0-draft.1) and a per-family "
                            + "scalar would need an area → family projection TIMS has not delivered — open question 5."));
                    }

                    continue;
                }

                if (response.Type != LikertType)
                {
                    continue; // multi_select / single_select / open: no scalar the engine can consume
                }

                if (code is null || !codes.Contains(code))
                {
                    if (code is not null && reportedCodes.Add(code))
                    {
                        warnings.Add(new InputWarning(
                            InputInstruments.V360,
                            InputWarningCodes.V360UnknownCode,
                            $"360 response code '{code}' is not a variable in rules.v360_variables ({rules.RulesVersion}); ignored."));
                    }

                    continue;
                }

                if (excluded.Contains(code))
                {
                    if (reportedExclusions.Add(code))
                    {
                        warnings.Add(new InputWarning(
                            InputInstruments.V360,
                            InputWarningCodes.V360IndExcluded,
                            $"360 variable {code} is excluded in V1 (a selection vector with no industry → family projection); "
                            + "its answers were read but not aggregated, and it reaches no family's CareerFit360."));
                    }

                    continue;
                }

                if (!collected.TryGetValue(code, out var evidence))
                {
                    evidence = new VariableEvidence();
                    collected[code] = evidence;
                }

                evidence.Ask(response.QuestionNumber);
                if (response.RatingValue is not double rating)
                {
                    continue; // the item was put to this rater and left blank: not an answer, and not a zero
                }

                evidence.Answer(source, Normalize(code, response.QuestionNumber, rating));
            }
        }

        // A variable every rater left blank is not evidence; drop it so it cannot become an empty mean.
        foreach (var code in collected.Where(e => e.Value.ItemsAnswered == 0).Select(e => e.Key).ToList())
        {
            collected.Remove(code);
        }

        return collected;
    }

    // F01, with the range failure turned into the adapters' typed, instrument-named exception. Fail closed
    // rather than repair: 1..5 is the whole domain of the item, so there is no value outside it that could
    // be "meant" — substituting one would invent the student's answer (same rule as MilAdapter's
    // non-integer percentile).
    private static double Normalize(string code, int questionNumber, double rating)
    {
        if (Math.Floor(rating) != rating || rating is < 1 or > 5)
        {
            throw new CareerFitInputException(
                InputInstruments.V360,
                InputWarningCodes.V360ResponseOutOfRange,
                $"360 response for variable {code} (question {questionNumber}) is {rating}; the Likert domain is the integers 1..5.");
        }

        return CareerFitFormulas.NormalizeLikert((int)rating)!.Value;
    }

    // One variable's evidence while it is being collected. ItemsExpected is the union of the question
    // numbers the variable was ASKED on across all raters (the seeded item set is not knowable from the
    // responses alone); ItemsAnswered counts the answers actually given, across raters.
    private sealed class VariableEvidence
    {
        private readonly OrderedDictionary<string, List<double>> _bySource = new(StringComparer.Ordinal);
        private readonly HashSet<int> _questions = [];

        public int ItemsExpected => _questions.Count;

        public int ItemsAnswered => _bySource.Values.Sum(v => v.Count);

        public int SourceCount => _bySource.Count;

        public IEnumerable<string> Sources => _bySource.Keys;

        public void Ask(int questionNumber) => _questions.Add(questionNumber);

        public void Answer(string source, double normalized)
        {
            if (!_bySource.TryGetValue(source, out var values))
            {
                values = [];
                _bySource[source] = values;
            }

            values.Add(normalized);
        }

        /// <summary>One source's score for this variable: the mean of its normalized answers, or null when it gave none.</summary>
        public double? MeanFor(string source) =>
            _bySource.TryGetValue(source, out var values) && values.Count > 0
                ? CareerFitFormulas.PythonSum(values) / values.Count
                : null;

        public IReadOnlyList<string> SourcesInWeightOrder(IEnumerable<string> order) =>
            order.Where(_bySource.ContainsKey).ToList();
    }
}

/// <summary>
/// The registered <see cref="IV360Adapter"/> (FM-CF-007): aggregates the student's stored vocational item
/// responses to variable level under the process's active rule set, and falls back to
/// <see cref="NoDataV360Adapter"/> — explicitly, by name — when none of them is a 360 variable, which is
/// every student until FM-CF-006 seeds the 40 items.
/// </summary>
public sealed class VocationalV360Adapter(ICareerFitRulesProvider rulesProvider) : IV360Adapter
{
    /// <inheritdoc />
    /// <remarks><paramref name="threeSixty"/> is deliberately unread: the platform's 360 block is aggregated at CATEGORY level and cannot answer a VARIABLE-level question.</remarks>
    public V360Adaptation Adapt(ThreeSixtyProfile? threeSixty, IReadOnlyList<ScoringGroup>? raterGroups) =>
        V360Aggregation.Adapt(rulesProvider.Rules, raterGroups);
}
