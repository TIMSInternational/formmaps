using FormMaps.Application.Auth;

namespace FormMaps.Application.Counselor;

/// <summary>
/// Enriched caseload read (FM-DOTNET-068 — routes/counselor.ts GET /me/students → counselorAnalyticsService
/// listEnrichedStudents). The deferred companion to FM-067. Loads the raw caseload data (active-assignment students +
/// grades, PCA sessions, 360 eval groups, PCA evaluations, career profiles, alert counts, school course credits, and
/// the school's required-credits) for the calling counselor; the pure <see cref="EnrichedCaseloadComputer"/> does the
/// GPA/credit/badge/status enrichment + filter/sort/paginate. Read-only RLS session.
/// </summary>
public interface ICounselorCaseloadReader
{
    /// <summary>Loads the full caseload bundle. Empty students ⇒ the computer returns the empty-page shape.</summary>
    Task<CaseloadData> GetCaseloadDataAsync(
        RequestContext context, string counselorId, CancellationToken cancellationToken = default);
}

/// <summary>The raw caseload data bundle (one round-trip of loads); all enrichment lives in the pure computer.</summary>
public sealed record CaseloadData(
    IReadOnlyList<CaseloadStudent> Students,
    IReadOnlyList<CaseloadGrade> Grades,
    IReadOnlyList<CaseloadPcaSession> PcaSessions,
    IReadOnlyList<CaseloadEvalGroup> EvalGroups,
    IReadOnlyList<CaseloadPcaEval> PcaEvals,
    IReadOnlyList<CaseloadProfile> Profiles,
    IReadOnlyDictionary<string, int> AlertCounts,
    IReadOnlyDictionary<string, double> CourseCredits,
    double CreditsRequired,
    IReadOnlyList<string> PersonalityCompletedUserIds)
{
    public static CaseloadData Empty { get; } = new(
        [], [], [], [], [], [], new Dictionary<string, int>(), new Dictionary<string, double>(), 120, []);
}

/// <summary>A caseload student (from the active assignment include). createdDate → ISO-Z <c>createdAt</c>.</summary>
public sealed record CaseloadStudent(
    string Id, string? Name, string? Email, int? GradeLevel, bool IsActive, string CreatedAt);

/// <summary>A student_grades row: grade label (nullable), credits (computed double), courseId (for the credit fallback).</summary>
public sealed record CaseloadGrade(string StudentId, string? Grade, double Credits, string CourseId);

/// <summary>A pca_exam_sessions row: userId, examType (::text), status (::text — 'Completed'/'InProgress'/…).</summary>
public sealed record CaseloadPcaSession(string UserId, string ExamType, string Status);

/// <summary>An evaluation_groups row: evaluatedUserId + isEvaluationCompleted.</summary>
public sealed record CaseloadEvalGroup(string EvaluatedUserId, bool IsCompleted);

/// <summary>A pca_evaluations row: userId + isCompleted (NO isActive filter, matching legacy).</summary>
public sealed record CaseloadPcaEval(string UserId, bool IsCompleted);

/// <summary>A user_career_profiles row (isAnalysisComplete only): userId + the raw careerMatches jsonb text.</summary>
public sealed record CaseloadProfile(string UserId, string CareerMatchesJson);

/// <summary>Query options (all pre-normalized by the endpoint: empty query strings → null; page/limit clamped).</summary>
public sealed record EnrichedCaseloadOptions(
    string? Search, string? Status, string? SortBy, string? SortOrder, int Page, int Limit);

/// <summary>The paginated enriched result: <c>{ data, total, page, limit, totalPages }</c>.</summary>
public sealed record EnrichedCaseloadResult(
    IReadOnlyList<EnrichedStudent> Data, int Total, int Page, int Limit, int TotalPages);

/// <summary>One enriched student row (the My Students page columns).</summary>
public sealed record EnrichedStudent(
    string Id,
    string? Name,
    string? Email,
    int? GradeLevel,
    bool IsActive,
    string CreatedAt,
    string Status,
    double? Gpa,
    CreditProgress CreditProgress,
    string Lia,
    string Pca,
    string Eval360,
    string Personality,
    string? CareerPath,
    int AlertCount);

/// <summary>Credit progress: earned/required credit doubles + the integer percentage (JsRound, 0 when required ≤ 0).</summary>
public sealed record CreditProgress(double Earned, double Required, int Percentage);
