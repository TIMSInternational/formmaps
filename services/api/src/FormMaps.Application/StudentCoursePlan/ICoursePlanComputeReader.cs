using System.Text.Json;
using FormMaps.Application.Auth;
using FormMaps.Application.SchoolAdmin;

namespace FormMaps.Application.StudentCoursePlan;

/// <summary>
/// The two compute reads of course-plan.ts (FM-DOTNET-086 — L149-200, mounted /api/v1/student). Both self-scoped
/// (RequireIdentity, caller Identity/tenant RLS). GET /course-plan/recommendations gates on checkAssessmentCompletion
/// (the ported computeStudentCompletion over 4 loads) then scores the global active-course catalog against the caller's
/// preferredFields; GET /course-plan/eligibility computes per-course prerequisite eligibility over the caller's school
/// catalog. NB /course-plan/recommendations is LOCAL keyword scoring — NOT Bedrock (the aiLimiter'd recommendations
/// live in the separate course.ts, which stays Node).
/// </summary>
public interface ICoursePlanComputeReader
{
    /// <summary>GET /course-plan/recommendations. Loads the completion verdict; when not done returns it alone
    /// (the endpoint emits the locked payload). When done also loads: the catalog (pre-filtered to the caller's
    /// allowed course languages — resolveAllowedCourseLanguages + widen-if-&lt;10-candidates, Task-6 language-parity
    /// fold, FM-DOTNET-086 porting report §3), enrollments, preferred fields, and the caller's engine-matched career
    /// titles (extracted from user_career_profiles.careerMatches — report §4/§5) for the scorer's alignment
    /// bonus.</summary>
    Task<RecommendationsData> GetRecommendationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>GET /course-plan/eligibility. Null when the caller has no school (endpoint → { data:[] }); else the
    /// per-course eligibility entries.</summary>
    Task<IReadOnlyList<EligibilityEntry>?> GetEligibilityAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}

/// <summary>Recommendations load. When <see cref="Done"/> (allDone) is false the endpoint emits
/// { success:true, data:[], locked:true, completion:&lt;verdict&gt; }. Otherwise the scorer runs over
/// <see cref="Courses"/> (already language-filtered by the reader — see <see cref="ICoursePlanComputeReader"/>'s
/// docs) minus <see cref="EnrolledCourseIds"/> using <see cref="PreferredFieldsLower"/> and
/// <see cref="EngineCareersLower"/>.</summary>
public sealed record RecommendationsData(
    StudentCompletionVerdict Verdict,
    bool Done,
    IReadOnlyList<CourseRow> Courses,
    IReadOnlySet<string> EnrolledCourseIds,
    IReadOnlyList<string> PreferredFieldsLower,
    IReadOnlyList<string> EngineCareersLower);

/// <summary>A raw Course row (verbatim Prisma passthrough, schema field order). rating / recommendedScore are Decimal →
/// JSON STRING; the array columns are string[]; syllabus is jsonb; dates ISO-Z. <see cref="RatingNumber"/> is the same
/// rating as a double, only for the &gt; 4 scoring test (never emitted).</summary>
public sealed record CourseRow(
    string Id,
    string Title,
    string ShortDescription,
    string FullDescription,
    string Provider,
    string Instructor,
    string Category,
    string Subcategory,
    string Difficulty,
    int Duration,
    string DurationUnit,
    int EstimatedHours,
    string ThumbnailUrl,
    string VideoUrl,
    string CourseraUrl,
    string ExternalId,
    string Rating,
    double RatingNumber,
    int ReviewCount,
    int EnrollmentCount,
    bool Certificate,
    string Language,
    string Country,
    string Region,
    IReadOnlyList<string> Skills,
    IReadOnlyList<string> MatchingCompetencies,
    IReadOnlyList<string> CareerPaths,
    IReadOnlyList<string> LearningObjectives,
    IReadOnlyList<string> Prerequisites,
    JsonElement Syllabus,
    string RecommendedScore,
    string SourceUrl,
    bool IsActive,
    string? CreatedBy,
    string CreatedDate,
    string? UpdatedBy,
    string UpdatedAt);

/// <summary>One /eligibility entry (the endpoint's reduced shape: courseId, courseCode, eligible, missing codes).</summary>
public sealed record EligibilityEntry(
    string CourseId,
    string CourseCode,
    bool Eligible,
    IReadOnlyList<string> MissingCodes);
