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
// 360 IN P1–P3. No variable-level 360 aggregation exists before FM-CF-006 (items) and FM-CF-007
// (aggregation), so the registered IV360Adapter is NoDataV360Adapter: every family scores
// careerfit360 = 0.0 with confidence NOT_DETERMINABLE, exactly what the reference engine produces for
// a student with no 360 evidence. Consequences, all deliberate and all on the record (InputQuality
// v360_source NO_DATA, warning V360_NO_DATA, evidence."360" false): the 360 weight (0.30) multiplies
// zero for EVERY family, so every CareerFitAbsolute is uniformly lower and the ranking is untouched;
// the 360 instrument reads DIVERGENT in convergence_level, so convergence counts at most THREE
// STRONG instruments — SOLID is the ceiling and VERY_HIGH is unreachable until FM-CF-007.
//
// THE AUDIT. Two layers, both on the family row's "audit" jsonb and both written by the same transaction as
// the scores. evaluate_owner's own blocks (audit_inputs / convergence_detail / critical_gaps /
// mil_relative_strengths) say what each instrument produced; CareerFitAuditLedger's formula_steps say HOW —
// one record per F01–F23 application the evaluation actually executed, naming the step, its inputs, its
// output and the rule or threshold that governed it. The ledger is attached in EvaluateCore AFTER
// AssignRelativeFit and is built by READING what EvaluateOwner already returned, never by re-scoring, so it
// cannot move a number (see CareerFitAuditLedger's header for why it is a jsonb array and not a table).
//
// Deliberately NOT here: any HTTP surface (FM-CF-012 — the seven endpoints and the flag), any
// per-user authorization (the endpoint's job; RLS on every read and write is the backstop, so a caller
// who cannot see the student's rows gets "not ready", never a score), and the explainability payload
// (FM-CF-011 — the ledger is evidence for an auditor, not copy for a student).

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
    /// every scorable family in the rule set's family order, AssignRelativeFit, then attach each family's
    /// per-formula-step audit ledger. Returns the families in rank order (1 = best); ties keep family order.
    /// The rule set's own thresholds — including the D5 per_instrument recut — are used; a test wanting
    /// reference-engine parity strips them (see CareerFitEvaluatorTests).
    ///
    /// The ledger is attached HERE and not inside EvaluateOwner, and it is built by reading what EvaluateOwner
    /// already returned rather than by re-scoring anything: EvaluateOwner is the reference engine's
    /// evaluate_owner, held to it at 1e-9 (measured bit-exact) by the parity fixture, and it stays that
    /// function. Attaching after AssignRelativeFit is also what lets F21 be a recorded step at all — the rank
    /// does not exist until the whole ranked set does.
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

        var ranked = CareerFitFormulas.AssignRelativeFit(evaluations);

        var audited = new List<OwnerEvaluation>(ranked.Count);
        foreach (var family in ranked)
        {
            audited.Add(family with
            {
                AuditSteps = CareerFitAuditLedger.Build(
                    assessment, ruleSet.Family(family.OwnerId), ruleSet.Rules.Weights, ruleSet.Rules.Thresholds, family, ranked.Count),
            });
        }

        return audited;
    }
}
