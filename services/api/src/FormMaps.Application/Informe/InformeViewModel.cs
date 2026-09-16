namespace FormMaps.Application.Informe;

// The typed contract of the Career & University Informe, ported from the legacy renderer's
// informe/types.ts (tafurfede/formmaps-platform, PR #352). The document is rendered from this
// shape and from nothing else: the assembler is the single place data enters it.
//
// One rule governs every member here — ABSENCE MUST BE REPRESENTABLE. The legacy assembler once
// substituted a zero-filled academics snapshot for a missing one and coerced every factor with
// Number(x ?? 0); by the time the renderer saw the data, "never measured" and "measured zero" were
// the same value and a student with no competencies was told "todas tus competencias están en un
// buen nivel". Hence: Academics is nullable, Disc is nullable, Competences is nullable, every
// CareerBreakdown factor is nullable, and InformeCoverage is the ONE place that answers "was this
// measured?" — four states the renderer must tell apart from the view model alone:
//   MEASURED    instrument completed, value present (a real 0 renders as 0)
//   ABSENT      instrument never completed          → reserved-space component (white + dashed + "—")
//   PARTIAL     completed but a known subset missing (13 of 24 competencies)
//   UNAVAILABLE the engine refused to compute       → its reason, never an empty ranking
// Nothing downstream may infer absence from a zero.

/// <summary>The student the informe is for. School and grade are optional cover-page lines.</summary>
public sealed record InformeStudent(string Id, string Name, string? School = null, string? Grade = null, string? Email = null);

/// <summary>One DISC graph: the four dimensions as 0–100 scores.</summary>
public sealed record DiscGraph(double D, double I, double S, double C);

/// <summary>
/// The three behavioural graphs plus the one the matching engine uses. UnderPressure (graph 2, the
/// instinctive core) is the canonical <see cref="Primary"/>; WorkAdaptation is graph 1, SelfImage graph 3.
/// </summary>
public sealed record DiscMatrix(DiscGraph WorkAdaptation, DiscGraph UnderPressure, DiscGraph SelfImage, DiscGraph Primary);

/// <summary>One competency from the PCA result, level 1–4.</summary>
public sealed record Competence(string Name, int Level);

/// <summary>The five MIL cognitive domains, 0–100.</summary>
public sealed record MilScores(double Reasoning, double Detection, double Numeric, double Memory, double Orientation);

/// <summary>
/// The MIL composite. <see cref="Band"/> is the INSTRUMENT's own five-band word (Insuficiente … Excepcional);
/// the document never prints it — every 0–100 scale in the informe uses the 34/67 bands of <see cref="Bands"/>.
/// </summary>
public sealed record MilComposite(double Raw, double Percent, string Band);

/// <summary>The cognitive profile: domain scores and the composite.</summary>
public sealed record CognitiveProfile(MilScores Mil, MilComposite Composite);

/// <summary>Aggregated 360 evidence: one evaluators' average per category (0–5). There is NO self score yet.</summary>
public sealed record ThreeSixtySummary(IReadOnlyDictionary<string, double> Categories, int EvaluatorCount);

/// <summary>Activity counts from the academic history.</summary>
public sealed record ActivitiesSnapshot(int Total, int LeadershipRoles, bool HasWorkExperience);

/// <summary>Academic snapshot. Nullable fields were never entered; the record itself is null when there is no history at all.</summary>
public sealed record AcademicsSnapshot(
    double? GpaUnweighted,
    int? SatTotal,
    int? ActComposite,
    int ApCourseCount,
    int HonorsCourseCount,
    int IbCourseCount,
    int TotalCourses,
    ActivitiesSnapshot Activities);

/// <summary>
/// Per-factor contribution to a career's score. Null means the factor was NEVER MEASURED — not a
/// measured 0. The renderer draws null as a dashed track and an em dash, and 0 as a real zero.
/// </summary>
public sealed record CareerBreakdown(double? DiscScore, double? MilScore, double? InterestsScore, double? MotivatorsScore);

/// <summary>One scored career (top-N, sorted descending). Confidence is the engine's word: high | good | moderate | low.</summary>
public sealed record InformeCareer(
    string ProgramId,
    string ProgramTitle,
    string Cluster,
    double TotalScore,
    string Confidence,
    CareerBreakdown Breakdown,
    bool NeedsBridging,
    IReadOnlyList<string> BridgingReasons,
    string BridgingPaths,
    string AiInsight);

/// <summary>Cluster-level aggregation derived from the scored careers. Name carries the engine key: "social · Ciencias Sociales y Humanas".</summary>
public sealed record InformeCluster(string Name, double AvgScore, int CareerCount);

/// <summary>The six university fit factors, 0–100.</summary>
public sealed record UniversityBreakdown(double AcademicFit, double ProgramMatch, double PreferenceFit, double ProfileFit, double BudgetFit, double Outcomes);

/// <summary>One scored university (top-N). The first match reason may be AI prose.</summary>
public sealed record InformeUniversity(
    string Id,
    string Name,
    string Country,
    double MatchScore,
    UniversityBreakdown MatchBreakdown,
    IReadOnlyList<string> MatchReasons);

/// <summary>One binary personality axis: the winning pole letter, its intensity 0–100, and whether the poles tied.</summary>
public sealed record PersonalityDimension(string WinningPole, double NormalizedIntensity, bool Balanced);

/// <summary>The four-letter personality type (e.g. "ENFJ"), its variant (laboral | estudiantil) and the axes keyed EI, SN, TF, JP.</summary>
public sealed record InformePersonality(string TypeCode, string Variant, IReadOnlyDictionary<string, PersonalityDimension> Dimensions);

/// <summary>Whether an instrument was completed, and when (ISO date) if known.</summary>
public sealed record InstrumentCoverage(bool Measured, string? Date = null);

/// <summary>Competency coverage: how many the PCA scored out of the catalogue, and which catalogue names it skipped when known.</summary>
public sealed record CompetencyCoverage(bool Measured, int Done, int Total, IReadOnlyList<string>? NotEvaluated = null, string? Date = null);

/// <summary>360 coverage: measured when at least one evaluator answered.</summary>
public sealed record ThreeSixtyCoverage(bool Measured, int Evaluators);

/// <summary>Career ranking coverage. When the engine declined to rank, <see cref="Reason"/> says why and is shown verbatim.</summary>
public sealed record CareersCoverage(bool Measured, string? Reason = null);

/// <summary>Presence flags. Every empty state in the renderer reads from here.</summary>
public sealed record InformeCoverage(
    InstrumentCoverage Pca,
    InstrumentCoverage Mil,
    CompetencyCoverage Competencias,
    InstrumentCoverage Personalidad,
    ThreeSixtyCoverage ThreeSixty,
    InstrumentCoverage Academico,
    InstrumentCoverage Universidades,
    CareersCoverage Careers);

/// <summary>One scoring factor. Weight is null when the engine exposes no fixed weight (CareerFit); the methodology page then draws the instrument flow, not a donut.</summary>
public sealed record ScoringFactor(string Id, string Label, double? Weight, bool Measured);

/// <summary>How the careers were scored. The methodology page renders FROM this so it can only describe factors the engine really used.</summary>
public sealed record InformeScoring(string Engine, IReadOnlyList<ScoringFactor> Factors);

/// <summary>The student's profile section of the view model.</summary>
public sealed record InformeProfile(
    DiscMatrix? Disc,
    CognitiveProfile Cognitive,
    IReadOnlyList<Competence>? Competences,
    IReadOnlyList<string> Interests,
    IReadOnlyList<string> Motivators,
    AcademicsSnapshot? Academics,
    string ProfileSummary,
    ThreeSixtySummary ThreeSixty);

/// <summary>The whole document's input. Careers and universities are top-N lists sorted descending.</summary>
public sealed record InformeViewModel(
    InformeStudent Student,
    DateTimeOffset GeneratedAt,
    InformeProfile Profile,
    IReadOnlyList<InformeCareer> Careers,
    IReadOnlyList<InformeCluster> Clusters,
    IReadOnlyList<InformeUniversity> Universities,
    string Fingerprint,
    InformePersonality? Personality,
    InformeCoverage Coverage,
    InformeScoring? Scoring);
