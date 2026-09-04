using System.Text.Json;
using System.Text.Json.Serialization;
using FormMaps.Application.CareerFit;
using FormMaps.Application.CareerFit.Adapters;

namespace FormMaps.Api.Contracts.CareerFit;

// FM-CF-011. The explainability payload: what a counselor or a student is told about WHY a family sits
// where it sits. Structured evidence only — the winning routes, the gates, the convergence and each
// instrument's support, the critical competency gaps, the MIL relative strengths, and the 360 evidence
// with its confidence. Built by projection from the run FM-CF-010 already produced and persisted; it
// computes nothing, so it cannot disagree with the scores it explains.
//
// NO NUMBER THAT COULD BE READ AS A LIKELIHOOD. Manifest guardrail 3 and the rule set's own
// absolute_reference note say the product must never present CareerFitAbsolute as a percentage. This
// payload goes further and carries NO family-level fit scalar at all — not careerfit_absolute, not
// careerfit_relative, not pca_index, not mil_fit. What it carries about "how well" is the ORDINAL rank,
// the gate labels and the convergence label, all of which are categorical by construction and cannot be
// rendered as "78% chance of being an engineer". The per-instrument numbers that do appear are evidence
// INSIDE an instrument (a 360 variable's rater score, a MIL subtest's relative strength, a competency's
// level against its required level) and are named for what they are. A caller that needs the scalars has
// the run itself; this shape exists so a UI cannot accidentally show one.
//
// 360, AND WHY IT HAS ITS OWN SHAPE. The 360 block is the one instrument that may be wholly absent (the
// 40 items are not seeded — FM-CF-006, blocked on TIMS), and "absent" must never render as "weak". So
// V360Explanation always states its own source and confidence: with evidence, the variables that reached
// F06 with their relevance weights and the confidence F05 produced; with none, source NO_DATA, confidence
// NOT_DETERMINABLE and a Reason saying so in as many words. A consumer that shows a 360 section reads
// Determinable, not the length of Variables.
//
// Deliberately NOT here: any HTTP mapping, route, authorization or feature flag (FM-CF-012 owns the
// seven endpoints and FORMMAPS_ROUTE_CAREERFIT_TO_DOTNET), any narrative copy or translated string (a
// label here is a stable machine value — the wording is the client's), any scoring, and the per-formula
// audit ledger (FM-CF-010 — that is evidence for an auditor, and it carries every scalar this shape
// deliberately withholds).

/// <summary>The explainability payload for one evaluated run: the evidence behind every family, in rank order.</summary>
public sealed record CareerFitExplanation(
    Guid RunId,
    DateTimeOffset EvaluatedAt,
    string RulesVersion,
    EvidenceQuality Quality,
    IReadOnlyList<FamilyExplanation> Families)
{
    /// <summary>The serializer FM-CF-012 will use: snake_case keys, enums as their reference strings, nulls kept so a consumer can tell "absent" from "not applicable".</summary>
    public static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = null,   // subtest codes, 360 variable codes and rater sources keep their own spelling
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
    };

    /// <summary>Project a persisted run into its explanation. Reads only; every value here was already computed and persisted by FM-CF-010.</summary>
    public static CareerFitExplanation From(CareerFitRun run)
    {
        ArgumentNullException.ThrowIfNull(run);
        return new CareerFitExplanation(
            RunId: run.Id,
            EvaluatedAt: run.CreatedAt,
            RulesVersion: run.RulesVersion,
            Quality: EvidenceQuality.From(run.Quality),
            Families: [.. run.Families.Select(family => FamilyExplanation.From(family, run.Quality))]);
    }
}

/// <summary>What the engine had to work with: which instruments carried evidence, which DISC graph was read, and every repair the adapters made.</summary>
public sealed record EvidenceQuality(
    IReadOnlyDictionary<string, bool> Instruments,
    string DiscGraph,
    bool HasRepairs,
    IReadOnlyList<RecordedRepair> Repairs)
{
    /// <summary>Project the adapters' quality record. A run only exists when PCA, MIL and personality were all readable, so those three are always true.</summary>
    public static EvidenceQuality From(InputQuality quality)
    {
        ArgumentNullException.ThrowIfNull(quality);
        var has360 = !string.Equals(quality.V360Source, V360Sources.NoData, StringComparison.Ordinal);
        return new EvidenceQuality(
            Instruments: new Dictionary<string, bool>(StringComparer.Ordinal)
            {
                [InputInstruments.Pca] = true,
                [InputInstruments.Mil] = true,
                [InputInstruments.Personality] = true,
                [InputInstruments.V360] = has360,
            },
            DiscGraph: quality.DiscGraph.ToString(),
            HasRepairs: quality.HasRepairs,
            Repairs: [.. quality.Warnings.Select(w => new RecordedRepair(w.Instrument, w.Code, w.Message))]);
    }
}

/// <summary>One repair, substitution or choice the adapters recorded. <see cref="Code"/> is a stable <see cref="InputWarningCodes"/> value; <see cref="Message"/> is engineer-facing text, not student copy.</summary>
public sealed record RecordedRepair(string Instrument, string Code, string Message);

/// <summary>
/// The evidence behind one family. Carries no fit scalar by design (see this file's header):
/// <see cref="Rank"/> is ordinal, and every other "how well" is a categorical label.
/// </summary>
public sealed record FamilyExplanation(
    int FamilyId,
    int? Rank,
    GateExplanation Gates,
    ConvergenceExplanation Convergence,
    PcaExplanation Pca,
    CompetencyExplanation Competencies,
    MilExplanation Mil,
    PersonalityExplanation Personality,
    V360Explanation V360,
    IReadOnlyList<Modulator> Modulators)
{
    /// <summary>Project one evaluated family. <paramref name="quality"/> supplies the run-level 360 facts a family row does not carry (which raters answered, why there was nothing to read).</summary>
    public static FamilyExplanation From(OwnerEvaluation family, InputQuality quality)
    {
        ArgumentNullException.ThrowIfNull(family);
        ArgumentNullException.ThrowIfNull(quality);

        // The 360 verdict is withheld — not relabelled — when the instrument carried no evidence: see
        // ConvergenceExplanation and V360Explanation.SupportOf. Every other instrument always has one.
        var v360Determinable = V360Explanation.IsDeterminable(quality);

        return new FamilyExplanation(
            FamilyId: family.OwnerId,
            Rank: family.RankPosition,
            Gates: new GateExplanation(
                family.CompetencyGate.ToReferenceValue(),
                family.MilGate.ToReferenceValue(),
                family.FinalGate.ToReferenceValue()),
            Convergence: new ConvergenceExplanation(
                family.ConvergenceLevel.ToReferenceValue(),
                family.ConvergenceDetail.StrongCount,
                family.ConvergenceDetail.Supports.ToDictionary(
                    s => s.Key,
                    s => !v360Determinable && s.Key == InputInstruments.V360 ? null : s.Value.ToReferenceValue(),
                    StringComparer.Ordinal)),
            Pca: new PcaExplanation(
                family.PcaWinningRoute,
                [.. family.AuditInputs.PcaRoutes.Select(r => new RouteEvidence(r.RouteId, r.Components))]),
            Competencies: new CompetencyExplanation(
                [.. family.CriticalGaps.Select(g => new CompetencyGapEvidence(g.CompetencyId, g.Level, g.Required))]),
            Mil: new MilExplanation(
                family.AuditInputs.Mil.LearningCapacityIndicator,
                family.MilRelativeStrengths,
                family.AuditInputs.Mil.Components.ToDictionary(
                    c => c.Key, c => new MilSubtestEvidence(c.Value.Band, c.Value.Role), StringComparer.Ordinal)),
            Personality: new PersonalityExplanation(
                family.PersonalityWinningRoute,
                [.. family.AuditInputs.Personality.AllRoutes.Select(r => new RouteEvidence(r.RouteId, r.Components))]),
            V360: V360Explanation.From(family, quality),
            Modulators: [.. ModulatorsOf(family)]);
    }

    /// <summary>
    /// The MODULATORS, as structured facts rather than prose. A modulator is something that moves this
    /// family's reading without being one of the four instrument fits: a MIL subtest this student is
    /// relatively strong or weak on and a 360 variable this family weights heavily (base_weight ×
    /// relevance — the reason two families read the same 360 evidence differently). Ordered most
    /// influential first.
    ///
    /// THE MIL NUMBER IS MAX-RELATIVE, NOT MEAN-RELATIVE, AND THE SENTENCE SAYS SO. The reference's
    /// mil_relative_strengths divides each subtest percentile by the student's OWN STRONGEST subtest and
    /// multiplies by 100 (formmaps_engine_reference.py:253-254 — <c>m = max(DC, RZ, VN, MT, OR)</c>), which
    /// CareerFitFormulas.CalculateMil reproduces. So the top subtest is always exactly 100 and no value is
    /// ever negative; an earlier version of this payload described the number as "signed against the
    /// student's own mean", which was wrong twice over and made the ordering's Math.Abs a no-op.
    ///
    /// The workbook ALSO carries a per-family <c>v360_route_modulators_text</c> — a free Spanish sentence
    /// from TIMS ("OC/EC→innovación; OL/EI→gerencial"). It is deliberately not surfaced here: it is not
    /// parsed into <c>CareerFitRules</c> by P1–P3, it is prose rather than evidence, and it names route
    /// flavours (innovación, gerencial) that the engine does not score. If TIMS wants it in the payload it
    /// is a rule-set parsing change first, and it belongs beside the family's name, not beside its gaps.
    /// </summary>
    private static IEnumerable<Modulator> ModulatorsOf(OwnerEvaluation family)
    {
        foreach (var (subtest, strength) in family.MilRelativeStrengths.OrderByDescending(s => s.Value))
        {
            yield return new Modulator(
                InputInstruments.Mil, subtest, strength,
                // No "percentile" in the SHIPPED sentence: the contract test walks the serialised JSON for
                // *percent* (guardrail 3, and MilSubtestEvidence's remarks). The share is the same fact.
                "relative strength as a share of the student's strongest MIL subtest, which is 100 by construction");
        }

        foreach (var (code, evidence) in family.AuditInputs.V360.Variables.OrderByDescending(v => v.Value.CombinedWeight))
        {
            yield return new Modulator(InputInstruments.V360, code, evidence.CombinedWeight, "base_weight × this family's relevance for the variable");
        }
    }
}

/// <summary>The three gates as their persisted labels (SATISFIED / CONDITIONED / CRITICAL).</summary>
public sealed record GateExplanation(string Competencies, string Mil, string Final);

/// <summary>
/// Cross-instrument agreement: the level, how many instruments read STRONG, and each instrument's own
/// support label. A value is NULL where the instrument carried no evidence at all — today only "360",
/// which may be wholly absent (FM-CF-006). The engine still computes DIVERGENT for it, because the
/// reference evaluates evidence_support on the 0.0 that no-evidence produces and parity is not
/// negotiable; passing that verdict on would render "absent" exactly as "weak". The key is kept so a
/// consumer can tell "no verdict" from "instrument not reported".
/// </summary>
public sealed record ConvergenceExplanation(string Level, int StrongInstruments, IReadOnlyDictionary<string, string?> Supports);

/// <summary>The winning PCA archetype and every route that competed, with the per-factor match that produced it.</summary>
public sealed record PcaExplanation(string WinningRoute, IReadOnlyList<RouteEvidence> Routes);

/// <summary>One route's identity and the components that made its score. No route score: the winner is the evidence, the number is not.</summary>
public sealed record RouteEvidence(string RouteId, IReadOnlyDictionary<string, double> Components);

/// <summary>The gaps: every CRITICAL competency this family requires that the student sits below.</summary>
public sealed record CompetencyExplanation(IReadOnlyList<CompetencyGapEvidence> CriticalGaps);

/// <summary>One critical gap — competency levels on the rule set's 0–4 scale, never a percentage.</summary>
public sealed record CompetencyGapEvidence(int CompetencyId, int Level, int Required);

/// <summary>MIL evidence: the capacity band label, the per-subtest relative strengths, and each subtest as scored.</summary>
public sealed record MilExplanation(
    string LearningCapacityIndicator,
    IReadOnlyDictionary<string, double> RelativeStrengths,
    IReadOnlyDictionary<string, MilSubtestEvidence> Subtests);

/// <summary>
/// One MIL subtest as this family reads it: the BAND the student's score falls in and the role the family
/// gives the subtest. The raw LIA percentile is deliberately NOT carried. Two reasons, and the manifest's
/// own validation for this slice is only the first: a field named <c>percentile</c> fails the "no
/// *percent* on a family result" contract, and it fails it for a good reason — a 0–100 number beside a
/// career family reads as a likelihood however it is labelled. The second is worse: TIMS open question 1
/// (what population the MIL percentiles are normed on) is unanswered, so the number's meaning is not yet
/// known, while the band is the workbook's own presentation category and is stable under a re-norm.
/// </summary>
public sealed record MilSubtestEvidence(string Band, string Role);

/// <summary>The winning personality route and every route that competed.</summary>
public sealed record PersonalityExplanation(string WinningRoute, IReadOnlyList<RouteEvidence> Routes);

/// <summary>
/// The 360 block, which is the one instrument that may be wholly absent. <see cref="Determinable"/> is the
/// question a consumer should ask — never the length of <see cref="Variables"/> — and
/// <see cref="Confidence"/> is NOT_DETERMINABLE with a <see cref="Reason"/> whenever it is false.
/// <see cref="Support"/> is NULL in that case rather than the engine's DIVERGENT: see
/// <c>SupportOf</c> for why the engine must keep emitting it and why this payload must not repeat it.
/// </summary>
public sealed record V360Explanation(
    bool Determinable,
    string Source,
    string Confidence,
    string? Support,
    IReadOnlyList<string> RaterSources,
    IReadOnlyList<V360VariableEvidenceView> Variables,
    string? Reason)
{
    /// <summary>
    /// The reason given when a student has no 360 evidence at all — every student until FM-CF-006 seeds
    /// the 40 items. Stated on the payload rather than left for a consumer to infer from an empty list,
    /// because "no evidence" and "weak evidence" must never render the same way.
    /// </summary>
    public const string NoEvidenceReason =
        "No 360 evidence was aggregated for this student, so CareerFit360 contributed nothing to any family and "
        + "the 360 instrument cannot support or contradict the others. This is an absence of data, not a weak result.";

    /// <summary>The reason given when 360 evidence exists but only one rater source answered, so consensus — and therefore confidence — is undefined.</summary>
    public const string SingleRaterReason =
        "360 evidence came from a single rater source, so there is no second opinion to agree or disagree with: "
        + "consensus is undefined and the confidence index cannot be computed. The scores are real; their reliability is unmeasured.";

    /// <summary>
    /// Did the run aggregate any 360 evidence at all? Read from the RUN's v360_source — never from the
    /// length of a family's variable list, which is empty both for a student with no 360 and for a family
    /// that weights none of the variables the student answered.
    /// </summary>
    public static bool IsDeterminable(InputQuality quality)
    {
        ArgumentNullException.ThrowIfNull(quality);
        return !string.Equals(quality.V360Source, V360Sources.NoData, StringComparison.Ordinal);
    }

    /// <summary>
    /// This family's 360 support verdict, or NULL when the instrument carried no evidence.
    ///
    /// THE ENGINE MUST KEEP SAYING DIVERGENT AND THIS PAYLOAD MUST NOT REPEAT IT. With no 360 the run's
    /// careerfit360 is 0.0, and the reference engine evaluates evidence_support on that 0.0 and returns
    /// DIVERGENT (formmaps_engine_reference.py); the port reproduces it bit for bit and neither may
    /// change. But DIVERGENT is a verdict about WEAK evidence, and rendering it for a student who has no
    /// 360 at all — which is every student until FM-CF-006 seeds the items — tells a counselor the 360
    /// contradicts the other instruments when there is no 360 to contradict anything. Null rather than a
    /// fourth label: a consumer that switches on STRONG / PARTIAL / DIVERGENT keeps working, and "no
    /// verdict" is what the absence actually is.
    /// </summary>
    private static string? SupportOf(OwnerEvaluation family, bool determinable) =>
        !determinable
            ? null
            : family.ConvergenceDetail.Supports.TryGetValue(InputInstruments.V360, out var support)
                ? support.ToReferenceValue()
                : Application.CareerFit.Support.Divergent.ToReferenceValue();

    /// <summary>Project the family's 360 evidence together with the run-level facts about where it came from.</summary>
    public static V360Explanation From(OwnerEvaluation family, InputQuality quality)
    {
        ArgumentNullException.ThrowIfNull(family);
        ArgumentNullException.ThrowIfNull(quality);

        var determinable = IsDeterminable(quality);
        var confidence = family.CareerFit360Confidence;
        var raterSources = quality.V360Instrument?.Sources ?? [];

        return new V360Explanation(
            Determinable: determinable,
            Source: quality.V360Source,
            Confidence: confidence.ToReferenceValue(),
            Support: SupportOf(family, determinable),
            RaterSources: raterSources,
            Variables: determinable
                ? [.. family.AuditInputs.V360.Variables.Select(v => new V360VariableEvidenceView(v.Key, v.Value.Score, v.Value.CombinedWeight))]
                : [],
            Reason: !determinable
                ? NoEvidenceReason
                : confidence == Application.CareerFit.Confidence.NotDeterminable && raterSources.Count <= 1
                    ? SingleRaterReason
                    : null);
    }
}

/// <summary>One 360 variable as it reached this family: the aggregated rater score and the weight this family gave it.</summary>
public sealed record V360VariableEvidenceView(string Code, double Score, double CombinedWeight);

/// <summary>One structured modulator: which instrument it belongs to, what it names, its magnitude and what the magnitude means.</summary>
public sealed record Modulator(string Instrument, string Code, double Magnitude, string Meaning);
