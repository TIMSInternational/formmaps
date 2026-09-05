namespace FormMaps.Application.CareerFit.Adapters;

// FM-CF-005. The audit side of the adapters: which DISC graph fed the engine, which competency names
// were not recognised, which ids were defaulted, how each personality pole pair was derived, where the
// 360 aggregates came from, and one InputWarning per clamp / default / substitution / choice. The
// orchestrator (FM-CF-010) persists InputQuality next to the scores so a reviewer can tell "the engine
// said X" from "the engine said X on inputs we had to repair". Nothing here is presented to a student
// (FM-CF-011 owns presentation) and nothing here is a score.

/// <summary>Instrument labels used on warnings and exceptions (the convergence instruments, the competency block, and the reader's authorization gate).</summary>
public static class InputInstruments
{
    public const string Pca = "PCA";
    public const string Competencies = "COMPETENCIES";
    public const string Mil = "MIL";
    public const string Personality = "PERSONALITY";
    public const string V360 = "360";

    /// <summary>
    /// Not an instrument: the STUDENT themselves. Carried by the one failure that means "this caller may not see
    /// this student" rather than "this student has not completed X" — <c>CareerFitInputReader</c>'s gate read
    /// against the policied "users" table.
    /// </summary>
    public const string Student = "STUDENT";
}

/// <summary>Stable codes for <see cref="InputWarning.Code"/> and <see cref="CareerFitInputException.Code"/>. Add, never rename: they are persisted.</summary>
public static class InputWarningCodes
{
    // PCA / DISC
    public const string DiscGraphSelected = "DISC_GRAPH_SELECTED";
    public const string DiscGraphAbsent = "DISC_GRAPH_ABSENT";
    public const string DiscMissing = "DISC_MISSING";
    public const string DiscGraphChoiceInvalid = "DISC_GRAPH_CHOICE_INVALID";
    public const string DiscFactorClamped = "DISC_FACTOR_CLAMPED";
    public const string DiscFactorNotANumber = "DISC_FACTOR_NAN";

    /// <summary>
    /// The chosen graph is only PARTIALLY present — at least one of D/I/S/C is absent, JSON null or not a
    /// number, but not all four. Fail-closed, never a warning: 0 is a real, extreme DISC value, so a
    /// substituted 0 invents a profile rather than recording a gap. (Replaces the never-emitted
    /// DISC_AXIS_MISSING slot, which nothing ever wrote and nothing has persisted.)
    /// </summary>
    public const string DiscFactorMissing = "DISC_FACTOR_MISSING";

    // Competencies
    public const string CompetencyNameUnknown = "COMPETENCY_NAME_UNKNOWN";
    public const string CompetencyNameDuplicate = "COMPETENCY_NAME_DUPLICATE";
    public const string CompetencyMissingDefaulted = "COMPETENCY_MISSING_DEFAULTED";
    public const string CompetencyLevelClamped = "COMPETENCY_LEVEL_CLAMPED";
    public const string CompetencyLevelRounded = "COMPETENCY_LEVEL_ROUNDED";
    public const string CompetencyLevelNotANumber = "COMPETENCY_LEVEL_NAN";
    public const string CompetencyLevelMissing = "COMPETENCY_LEVEL_MISSING";
    public const string CompetencyDefinitionsCollide = "COMPETENCY_DEFINITIONS_COLLIDE";
    public const string CompetenciesMissing = "COMPETENCIES_MISSING";

    // MIL
    public const string MilPercentileClamped = "MIL_PERCENTILE_CLAMPED";
    public const string MilSubtestMissing = "MIL_SUBTEST_MISSING";
    public const string MilPercentileOutOfDomain = "MIL_PERCENTILE_OUT_OF_DOMAIN";
    public const string MilPercentileNotInteger = "MIL_PERCENTILE_NOT_INTEGER";
    public const string MilPercentilesMissing = "MIL_PERCENTILES_MISSING";

    // Personality
    public const string PersonalityDerivedFromCounts = "PERSONALITY_DERIVED_FROM_COUNTS";
    public const string PersonalityDerivedFromIntensity = "PERSONALITY_DERIVED_FROM_INTENSITY";
    public const string PersonalityDimensionUnanswered = "PERSONALITY_DIMENSION_UNANSWERED";
    public const string PersonalityDimensionMissing = "PERSONALITY_DIMENSION_MISSING";
    public const string PersonalityPoleUnknown = "PERSONALITY_POLE_UNKNOWN";
    public const string PersonalityWinnerContradictsCounts = "PERSONALITY_WINNER_CONTRADICTS_COUNTS";
    public const string PersonalityIntensityClamped = "PERSONALITY_INTENSITY_CLAMPED";
    public const string PersonalityNoEvidence = "PERSONALITY_NO_EVIDENCE";
    public const string PersonalityScoresMissing = "PERSONALITY_SCORES_MISSING";

    // 360
    public const string V360NoData = "V360_NO_DATA";
    public const string V360Adapted = "V360_ADAPTED";
    public const string V360SingleRater = "V360_SINGLE_RATER";
    public const string V360UnknownCode = "V360_UNKNOWN_CODE";
    public const string V360PartialCoverage = "V360_PARTIAL_COVERAGE";
    public const string V360IndExcluded = "V360_IND_EXCLUDED";
    public const string V360RankNotScored = "V360_RANK_NOT_SCORED";
    public const string V360RaterGroupUnknown = "V360_RATER_GROUP_UNKNOWN";
    public const string V360ResponseOutOfRange = "V360_RESPONSE_OUT_OF_RANGE";

    // Reader authorization gate (FM-CF-010) — not an instrument defect: the caller's RLS session cannot see the
    // student's "users" row, so no instrument of theirs may be read either.
    public const string StudentNotVisible = "STUDENT_NOT_VISIBLE";
}

/// <summary>One recorded repair, substitution or choice. <see cref="Instrument"/> is an <see cref="InputInstruments"/> value; <see cref="Code"/> an <see cref="InputWarningCodes"/> value.</summary>
public sealed record InputWarning(string Instrument, string Code, string Message);

/// <summary>
/// Which of the three TIMS DISC graphs feeds the engine's PCAInput. The numeric value is the TIMS graph
/// index (the N in Pca{D,I,S,C}{N}). There is deliberately no member with value 0: an uninitialised
/// choice is not a choice and <see cref="DiscAdapter"/> rejects it. Named DiscGraphChoice, not DiscGraph,
/// because <see cref="FormMaps.Application.Assessments.DiscGraph"/> is already the platform's record for
/// one graph's four axes and the two are used side by side.
/// </summary>
public enum DiscGraphChoice
{
    /// <summary>
    /// Graph 1 — Work Adaptation (adapted / public style). What legacy /careers/score receives
    /// (apps/web/src/hooks/useTimsQueries.ts sends pcaD1..pcaC1). The adapters' DEFAULT, so the FM-CF-013
    /// shadow compares like with like; TIMS open question 4 decides the final value.
    /// </summary>
    WorkAdaptation = 1,

    /// <summary>Graph 2 — Under Pressure (instinctive core). The platform's canonical <c>DiscMatrix.Primary</c> (AssessmentProfile.cs).</summary>
    UnderPressure = 2,

    /// <summary>Graph 3 — Natural / self-image (<c>DiscMatrix.SelfImage</c> on the platform).</summary>
    Natural = 3,
}

/// <summary>How one personality dimension's pole pair was derived (see <see cref="PersonalityAdapter"/>).</summary>
public enum PersonalityPoleDerivation
{
    /// <summary>100 × count(pole) / (firstCount + secondCount): the continuous, faithful path.</summary>
    Counts,

    /// <summary>50 + normalizedIntensity / 2 on the winner, 100 − that on the loser: counts were not stored.</summary>
    Intensity,

    /// <summary>No item answered on the dimension (0 / 0): 50 / 50.</summary>
    Unanswered,
}

/// <summary>Names an <see cref="IV360Adapter"/> implementation in <see cref="InputQuality.V360Source"/>.</summary>
public static class V360Sources
{
    /// <summary>No 360 evidence was consulted, or none of it was scorable (<see cref="NoDataV360Adapter"/>).</summary>
    public const string NoData = "NO_DATA";

    /// <summary>Aggregated from the vocational chassis's stored item responses (<see cref="VocationalV360Adapter"/>, FM-CF-007).</summary>
    public const string VocationalResponses = "VOCATIONAL_RESPONSES";
}

/// <summary>Everything the orchestrator persists for audit about how the engine inputs were produced.</summary>
public sealed record InputQuality(
    DiscGraphChoice DiscGraph,
    IReadOnlyList<string> UnknownCompetencyNames,
    IReadOnlyList<int> DefaultedCompetencyIds,
    IReadOnlyDictionary<string, PersonalityPoleDerivation> PersonalityDerivation,
    string V360Source,
    IReadOnlyList<InputWarning> Warnings)
{
    /// <summary>
    /// The FM-CF-007 aggregator's per-VARIABLE trail — one entry per 360 variable that reached an
    /// aggregate, carrying what F02–F05 produced for it and how much of its item set was answered. Empty
    /// whenever <see cref="V360Source"/> is <see cref="V360Sources.NoData"/>, which is every student until
    /// FM-CF-006 seeds the items. Init-only so the positional constructor, and every caller of it, is
    /// unchanged.
    /// </summary>
    public IReadOnlyList<V360VariableAudit> V360Variables { get; init; } = [];

    /// <summary>
    /// The same trail at INSTRUMENT level: F02/F03/F04/F05 applied once over the per-source overall 360
    /// scores, which is where the run's single <c>careerfit360_confidence</c> label comes from (see
    /// <c>V360Aggregation.GlobalConfidence</c>). Null when no 360 evidence was aggregated.
    /// </summary>
    public V360VariableAudit? V360Instrument { get; init; }

    /// <summary>
    /// FM-CF-010's step ledger for the part of the derivation that happens ONCE PER STUDENT rather than
    /// once per family: F01–F05, the 360 aggregation pipeline. The family ledger
    /// (<see cref="OwnerEvaluation.AuditSteps"/>) starts at F06, because F06 is the first 360 formula that
    /// is subscripted by a family. Empty when no 360 evidence was aggregated — nothing executed, so
    /// nothing is recorded.
    /// </summary>
    public IReadOnlyList<FormulaStep> V360FormulaSteps { get; init; } = [];

    private static readonly HashSet<string> Informational = new(StringComparer.Ordinal)
    {
        InputWarningCodes.DiscGraphSelected,
        InputWarningCodes.PersonalityDerivedFromCounts,
        InputWarningCodes.PersonalityDerivedFromIntensity,
        InputWarningCodes.V360NoData,
        InputWarningCodes.V360Adapted,
        InputWarningCodes.V360SingleRater,
        InputWarningCodes.V360IndExcluded,
        InputWarningCodes.V360RankNotScored,
    };

    /// <summary>True when at least one warning is a repair (anything but the informational graph / derivation / 360-source notes).</summary>
    public bool HasRepairs => Warnings.Any(w => !Informational.Contains(w.Code));
}

/// <summary>The engine's inputs for one student together with their <see cref="InputQuality"/>.</summary>
public sealed record CareerFitAssessmentInputs(CareerFitAssessment Assessment, InputQuality Quality);
