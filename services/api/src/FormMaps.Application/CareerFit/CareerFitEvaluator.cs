using FormMaps.Application.Auth;
using FormMaps.Application.CareerFit.Adapters;
using FormMaps.Application.CareerFit.Resolver;

namespace FormMaps.Application.CareerFit;

// FM-CF-010 (P1–P3 integration). The orchestrator: read → adapt → rules → EvaluateOwner per SCORABLE
// family → AssignRelativeFit → write → return, in that order, for one student under one rule-set
// version. Everything numeric happens in CareerFitFormulas (FM-CF-004), every seam decision in the
// FM-CF-005 adapters (which DISC graph — default graph 1, the legacy scorer's; a competency the PCA
// result does not carry — level 0 with a warning; a LIA tail percentile of 0 / 100 — clamped to 1 / 99
// with a warning), the rule set comes resolved and validated once per process from FM-CF-003/009, and
// the rows go through the FM-CF-002 tables. EvaluateCore is the pure centre (inputs + rule set → ranked
// families) so tests can hold this path, not just the formulas, to the reference engine at 1e-9.
//
// 360 (FM-CF-007/008). The registered IV360Adapter is VocationalV360Adapter: it aggregates the
// student's stored vocational item responses to VARIABLE level (F01→F02/F03/F04→F05) and F06 weights
// each variable by base_weight × relevance from the family's own v360_rules. It is wired and tested,
// and it changes nothing at runtime yet, because the 40 items are not seeded (FM-CF-006, blocked on
// TIMS): no stored response carries a rules.v360_variables code, so the adapter selects
// NoDataV360Adapter — explicitly, by name — and every family scores careerfit360 = 0.0 with confidence
// NOT_DETERMINABLE, exactly what the reference engine produces for a student with no 360 evidence.
// Consequences, all deliberate and all on the record (InputQuality v360_source NO_DATA, warning
// V360_NO_DATA, evidence."360" false): the 360 weight (0.30) multiplies zero for EVERY family, so
// every CareerFitAbsolute is uniformly lower and the ranking is untouched; the 360 instrument reads
// DIVERGENT in convergence_level, so convergence counts at most THREE STRONG instruments — SOLID is
// the ceiling and VERY_HIGH is unreachable. Once the items exist, SOLID stays the ceiling anyway for
// as long as 360 is SELF-ONLY (manifest decision 1): one rater leaves consensus undefined, so the
// confidence label is NOT_DETERMINABLE and F23 downgrades a STRONG 360 to PARTIAL.
//
// Deliberately NOT here: any HTTP surface (FM-CF-012 — the seven endpoints and the flag), any
// per-user authorization (the endpoint's job; RLS on every read and write is the backstop, so a caller
// who cannot see the student's rows gets "not ready", never a score), the explainability payload
// (FM-CF-011), and a per-formula-step audit table (the family row carries evaluate_owner's audit_inputs
// verbatim; FM-CF-010's finer-grained ledger is still open).

/// <summary>Evaluates one student against every scorable family of the active rule set and persists the run.</summary>
public interface ICareerFitEvaluator
{
    /// <summary>
    /// Read the student's rows under <paramref name="context"/>'s RLS session, adapt them, score every scorable
    /// family, rank, persist, and return the run with families in rank order. <paramref name="graphOverride"/>
    /// selects the DISC graph (default <see cref="DiscAdapter.DefaultGraph"/>). Throws
    /// <see cref="CareerFitInputException"/> when an instrument is missing or unrepairable — nothing is written.
    /// </summary>
    Task<CareerFitRun> EvaluateAsync(
        RequestContext context,
        string userId,
        DiscGraphChoice? graphOverride = null,
        CancellationToken cancellationToken = default);
}

/// <inheritdoc cref="ICareerFitEvaluator"/>
public sealed class CareerFitEvaluator(
    ICareerFitInputReader inputReader,
    ICareerFitRunWriter runWriter,
    ICareerFitRulesProvider rulesProvider,
    IV360Adapter v360Adapter) : ICareerFitEvaluator
{
    /// <inheritdoc />
    public async Task<CareerFitRun> EvaluateAsync(
        RequestContext context,
        string userId,
        DiscGraphChoice? graphOverride = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentException.ThrowIfNullOrWhiteSpace(userId);

        var raw = await inputReader.ReadAsync(context, userId, cancellationToken);
        var evaluation = Evaluate(raw, graphOverride ?? DiscAdapter.DefaultGraph);
        var receipt = await runWriter.WriteAsync(context, evaluation, cancellationToken);
        return CareerFitRun.Persisted(evaluation, receipt);
    }

    /// <summary>Adapt raw rows and score them under the process's active rule set — everything between the read and the write, no I/O.</summary>
    public CareerFitEvaluation Evaluate(CareerFitRawInputs raw, DiscGraphChoice graph)
    {
        ArgumentNullException.ThrowIfNull(raw);
        var ruleSet = new CareerFitActiveRuleSet(rulesProvider.Rules, rulesProvider.ResolvedFamilies);

        var inputs = CareerFitInputAdapters.Adapt(
            raw.DiscResult,
            raw.Competences,
            raw.LiaPercentiles,
            raw.PersonalityDimensionScores,
            raw.ThreeSixty,
            raw.V360RaterGroups,
            ruleSet.Rules.Competencies,
            v360Adapter,
            graph);

        RequireCompetenciesWereMeasured(inputs.Quality, ruleSet);

        var families = EvaluateCore(inputs.Assessment, ruleSet);

        return new CareerFitEvaluation(
            UserId: raw.UserId,
            SchoolId: raw.SchoolId,
            RulesVersion: rulesProvider.RulesVersion,
            DiscGraph: inputs.Quality.DiscGraph,
            Inputs: inputs.Assessment,
            Quality: inputs.Quality,
            Sources: raw.Sources,
            Families: families);
    }

    /// <summary>
    /// Fail closed when NOTHING in the competency block could be read — <c>pca_results.competences</c> NULL,
    /// an empty PcaCmps, or names that all matched nothing — so every rule-set id was defaulted.
    ///
    /// The adapter defaults an unmatched id to level 0 and records it, which is right for a PARTIAL gap: the
    /// student really was not measured on that one competency and F02's attainment arithmetic handles it. A
    /// WHOLLY defaulted block is a different thing. Twenty-four measured zeros are indistinguishable from
    /// twenty-four absences once they reach CalculateCompetencies, and the engine does not throw on them: it
    /// scores a complete, ranked, persisted run in which every family's COMP_GATE reads CRITICAL. That is
    /// then presented as a finding about the student — "critical behavioural gap on all fourteen families" —
    /// when the only fact available is that the platform holds no competency data for them.
    ///
    /// Same rule as a missing MIL subtest (<see cref="Adapters.MilAdapter"/>): repairable defects are
    /// recorded and scored, unmeasured instruments refuse. The orchestrator maps this to "not scorable"
    /// and nothing is written.
    /// </summary>
    private static void RequireCompetenciesWereMeasured(InputQuality quality, CareerFitActiveRuleSet ruleSet)
    {
        var expected = ruleSet.Rules.Competencies.Count;
        if (expected == 0 || quality.DefaultedCompetencyIds.Count < expected)
        {
            return;
        }

        var unknown = quality.UnknownCompetencyNames.Count == 0
            ? "none were present"
            : $"{quality.UnknownCompetencyNames.Count} name(s) were present but matched no rule-set competency: "
              + string.Join(", ", quality.UnknownCompetencyNames.Take(5))
              + (quality.UnknownCompetencyNames.Count > 5 ? ", …" : string.Empty);

        throw new Adapters.CareerFitInputException(
            Adapters.InputInstruments.Competencies,
            Adapters.InputWarningCodes.CompetenciesMissing,
            $"No competency level could be read: all {expected} rule-set competencies were defaulted ({unknown}). "
            + "Scoring would report a critical behavioural gap on every family from an absence of data.");
    }

    /// <summary>
    /// The pure centre: validate the assessment once (CareerFitFormulas.ValidateInputs), EvaluateOwner for
    /// every scorable family in the rule set's family order, then AssignRelativeFit. Returns the families in
    /// rank order (1 = best); ties keep family order. The rule set's own thresholds — including the D5
    /// per_instrument recut — are used; a test wanting reference-engine parity strips them (see
    /// CareerFitEvaluatorTests).
    /// </summary>
    public static IReadOnlyList<OwnerEvaluation> EvaluateCore(CareerFitAssessment assessment, CareerFitActiveRuleSet ruleSet)
    {
        ArgumentNullException.ThrowIfNull(assessment);
        ArgumentNullException.ThrowIfNull(ruleSet);

        CareerFitFormulas.ValidateInputs(assessment.Pca, assessment.Competencies, assessment.Mil, assessment.Personality);

        var evaluations = new List<OwnerEvaluation>(ruleSet.Families.Count);
        foreach (var family in ruleSet.Families)
        {
            evaluations.Add(CareerFitFormulas.EvaluateOwner(assessment, family, ruleSet.Rules.Weights, ruleSet.Rules.Thresholds));
        }

        return CareerFitFormulas.AssignRelativeFit(evaluations);
    }
}
