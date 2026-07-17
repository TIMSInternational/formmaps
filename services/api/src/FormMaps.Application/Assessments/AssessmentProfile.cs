using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

// Server-authoritative assembly of EVERYTHING the three assessments produce — LIA (cognitive),
// PCA (DISC + competences), and 360 — plus student academics/preferences, into one typed object.
// Faithful port of legacy api/src/lib/assessmentProfile.ts (assembleCompleteProfile). This is the
// single read every downstream engine + AI prompt consumes; no consumer reads raw assessment tables
// directly. Pure normalization/scoring/fingerprint logic lives in the sibling Application helpers
// (PcaNormalization / Evaluation360Scoring / MilComposite / AssessmentProfileMath); the 10 reads live
// in Infrastructure.CompleteProfileAssembler. Authorization is the CALLER's responsibility (matching
// the legacy lib, which takes a bare userId) — the assembler queries by userId under the caller's
// read-only RLS session.

/// <summary>One DISC graph (0–100 per axis). camelCase on the wire: d/i/s/c.</summary>
public sealed record DiscGraph(double D, double I, double S, double C);

/// <summary>
/// The three TIMS DISC graphs + the canonical <see cref="Primary"/> (= <see cref="UnderPressure"/>,
/// the instinctive core style used for matching).
/// </summary>
public sealed record DiscMatrix(
    DiscGraph WorkAdaptation,
    DiscGraph UnderPressure,
    DiscGraph SelfImage,
    DiscGraph Primary);

/// <summary>A PCA competence (name + level; legacy `number`, integer 1–4 in practice).</summary>
public sealed record CompetenceEntry(string Name, double Level);

/// <summary>One LIA domain's surfaced result. camelCase: domain/type/percent/accuracy/timeSpent.</summary>
public sealed record LiaExamEntry(string Domain, string Type, int Percent, int Accuracy, int? TimeSpent);

/// <summary>
/// LIA block: the 5 mil percents (object keyed by milReasoning/milDetection/milNumeric/milMemory/
/// milOrientation, in that iteration order = the legacy object-literal order), per-exam detail, and the
/// 300-pt composite.
/// </summary>
public sealed record LiaProfile(
    IReadOnlyDictionary<string, int> Mil,
    IReadOnlyList<LiaExamEntry> PerExam,
    MilCompositeResult Composite);

/// <summary>PCA block: the DISC matrix (null when absent) + competences (null when absent).</summary>
public sealed record PcaProfile(DiscMatrix? Disc, IReadOnlyList<CompetenceEntry>? Competences);

/// <summary>
/// 360 block: weighted per-category averages (legacy Record&lt;string,number&gt;; insertion order preserved,
/// first-seen during the feedback read) + evaluator count (incl. self).
/// </summary>
public sealed record ThreeSixtyProfile(
    IReadOnlyDictionary<string, double> Categories,
    int EvaluatorCount);

/// <summary>Extracurricular summary folded into the academics block.</summary>
public sealed record ActivitiesSummary(int Total, int LeadershipRoles, bool HasWorkExperience);

/// <summary>Student academics read fresh from the DB (never client-supplied).</summary>
public sealed record AcademicsProfile(
    double? GpaUnweighted,
    int? SatTotal,
    int? ActComposite,
    int ApCourseCount,
    int HonorsCourseCount,
    int IbCourseCount,
    int TotalCourses,
    ActivitiesSummary Activities);

/// <summary>Student college preferences (text[] fields, empty when unset).</summary>
public sealed record PreferencesProfile(
    IReadOnlyList<string> PreferredFields,
    IReadOnlyList<string> TargetCareers,
    IReadOnlyList<string> PreferredCountries);

/// <summary>Which of the three assessments are complete.</summary>
public sealed record ProfileCompleteness(bool Lia, bool Pca, bool ThreeSixty);

/// <summary>The complete server-authoritative assessment profile for one user.</summary>
public sealed record CompleteAssessmentProfile(
    string UserId,
    LiaProfile Lia,
    PcaProfile Pca,
    ThreeSixtyProfile ThreeSixty,
    AcademicsProfile Academics,
    PreferencesProfile Preferences,
    ProfileCompleteness Completeness,
    string Fingerprint);

/// <summary>Assembles the complete assessment profile for a user (legacy assembleCompleteProfile).</summary>
public interface ICompleteProfileAssembler
{
    Task<CompleteAssessmentProfile> AssembleAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}
