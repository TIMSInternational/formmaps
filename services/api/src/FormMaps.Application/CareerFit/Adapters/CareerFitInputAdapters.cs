using System.Text.Json;
using FormMaps.Application.Assessments;

namespace FormMaps.Application.CareerFit.Adapters;

/// <summary>
/// FM-CF-005. The seam between what the platform measures and what the engine consumes, composed:
/// <see cref="DiscAdapter"/> (which DISC graph), <see cref="CompetencyAdapter"/> (name → id, missing →
/// 0), <see cref="MilAdapter"/> (percentile tails), <see cref="PersonalityAdapter"/> (one intensity →
/// eight poles) and an <see cref="IV360Adapter"/>, into the engine's <see cref="CareerFitAssessment"/>
/// plus the <see cref="InputQuality"/> the orchestrator persists. Pure and I/O-free: the caller (FM-CF-010)
/// reads pca_results / lia_assessment_sessions / personality_assessment_sessions under its own RLS
/// session and hands the raw jsonb here. Deliberately NOT here: range validation
/// (CareerFitFormulas.ValidateInputs — the orchestrator calls it once on the assembled assessment, and
/// on these adapters' output it passes unless the rule set carries fewer than 24 competencies), rule
/// resolution (FM-CF-009) and any scoring.
/// </summary>
public static class CareerFitInputAdapters
{
    /// <summary>
    /// Adapt the raw platform rows for one student. <paramref name="discResult"/> and
    /// <paramref name="competences"/> are pca_results.discResult / .competences; <paramref name="liaPercentiles"/>
    /// is lia_assessment_sessions.percentiles; <paramref name="personalityDimensionScores"/> is
    /// personality_assessment_sessions.dimension_scores; <paramref name="threeSixty"/> is the profile's 360
    /// block (ignored by <see cref="NoDataV360Adapter"/>). Fail-closed cases throw
    /// <see cref="CareerFitInputException"/>; everything repairable lands in the quality record.
    /// </summary>
    public static CareerFitAssessmentInputs Adapt(
        JsonElement discResult,
        JsonElement competences,
        JsonElement liaPercentiles,
        JsonElement personalityDimensionScores,
        ThreeSixtyProfile? threeSixty,
        IReadOnlyList<CompetencyDefinition> competencyDefinitions,
        IV360Adapter? v360Adapter = null,
        DiscGraphChoice discGraph = DiscAdapter.DefaultGraph)
    {
        return Assemble(
            DiscAdapter.Adapt(discResult, discGraph),
            CompetencyAdapter.Adapt(competences, competencyDefinitions),
            MilAdapter.Adapt(liaPercentiles),
            PersonalityAdapter.Adapt(personalityDimensionScores),
            (v360Adapter ?? NoDataV360Adapter.Instance).Adapt(threeSixty));
    }

    /// <summary>Compose five adaptations into the engine assessment and its quality record. Warnings keep instrument order: PCA, competencies, MIL, personality, 360.</summary>
    public static CareerFitAssessmentInputs Assemble(
        DiscAdaptation disc,
        CompetencyAdaptation competencies,
        MilAdaptation mil,
        PersonalityAdaptation personality,
        V360Adaptation v360)
    {
        var warnings = new List<InputWarning>(
            disc.Warnings.Count + competencies.Warnings.Count + mil.Warnings.Count + personality.Warnings.Count + v360.Warnings.Count);
        warnings.AddRange(disc.Warnings);
        warnings.AddRange(competencies.Warnings);
        warnings.AddRange(mil.Warnings);
        warnings.AddRange(personality.Warnings);
        warnings.AddRange(v360.Warnings);

        var assessment = new CareerFitAssessment(
            disc.Pca,
            competencies.Levels,
            mil.Mil,
            personality.Personality,
            v360.Aggregates,
            v360.Confidence);

        var quality = new InputQuality(
            disc.Graph,
            competencies.UnknownNames,
            competencies.DefaultedIds,
            personality.Derivation,
            v360.Source,
            warnings);

        return new CareerFitAssessmentInputs(assessment, quality);
    }
}
