using System.Text.Json;

namespace FormMaps.Application.Graduation;

// Wire models for the graduation-plan ROUTES (issue #55 remainder): legacy routes/graduation-plan.ts and
// routes/counselor-graduation.ts, backed by services/graduationPlanService.ts + services/planWorkflowService.ts.
// The two POST /generate routes are NOT here — DECISION D1 keeps them on Node permanently (aiLimiter + Bedrock).

/// <summary>
/// <c>targetDto</c> (graduationPlanService.ts:30) — the SAVED target. Nine keys; <c>suggested</c> is always
/// false. Distinct from <see cref="SuggestedTarget"/>, which is a FOUR-key object, not this one with nulls:
/// legacy builds it as a separate literal (:54) and JSON.stringify simply has no id / fieldKey /
/// selectivityTier / templateKey / templateLabel property to drop.
/// </summary>
public sealed record SavedTargetRow(
    string Id,
    string? UniversityId,
    string? UniversityName,
    string Major,
    string FieldKey,
    string SelectivityTier,
    string TemplateKey);

/// <summary>
/// The non-persisted suggestion (graduationPlanService.ts:44-54).
///
/// <para><c>Major</c> is <see cref="object"/> and not <see cref="string"/> ON PURPOSE. Legacy computes
/// <c>careers[0] || (matches[0]?.programTitle as string | undefined) || null</c>: the first arm is a
/// <c>user_preferences.targetCareers</c> element (always a string, empty string being FALSY and therefore
/// skipped), but the second reads an arbitrary jsonb value out of
/// <c>user_career_profiles.careerMatches</c> — the <c>as string</c> is a compile-time assertion Prisma never
/// enforces, so a numeric or object <c>programTitle</c> reaches the client with THAT type. Carrying the raw
/// <see cref="JsonElement"/> reproduces the wire exactly instead of quietly stringifying it.</para>
/// </summary>
public sealed record SuggestedTarget(string? UniversityId, string? UniversityName, object? Major);

/// <summary>getTargetOrSuggestion's three outcomes. Both null =&gt; <c>data: null</c> with a 200.</summary>
public sealed record TargetOrSuggestion(SavedTargetRow? Saved, SuggestedTarget? Suggested);

/// <summary>The validated body of PUT /graduation-plan/target (graduation-plan.ts:37-45).</summary>
public sealed record SetTargetInput(string? UniversityId, string? UniversityName, string Major);

/// <summary>
/// <c>planDto</c> (graduationPlanService.ts:114). <c>GapReport</c> / <c>Warnings</c> are raw jsonb passed
/// through untouched (<c>?? []</c> when SQL-NULL). <c>TotalPlannedCredits</c> and item <c>Credits</c> ARE
/// coerced to JS numbers by legacy's <c>Number(...)</c>, unlike the Decimal strings on the rule-set tree.
/// </summary>
public sealed record GraduationPlanDto(
    string Id,
    string Status,
    string TemplateKey,
    string TemplateLabel,
    JsonElement GapReport,
    JsonElement Warnings,
    string? Rationale,
    double TotalPlannedCredits,
    string? SubmittedAt,
    string? ReviewNote,
    string CreatedDate,
    IReadOnlyList<GraduationPlanItemDto> Items);

public sealed record GraduationPlanItemDto(
    string CourseId,
    string CourseCode,
    string CourseName,
    double Credits,
    int GradeLevel,
    string? Term,
    string? Category,
    string? Reason,
    string Source,
    int SortOrder);

/// <summary>
/// submitPlan (planWorkflowService.ts:39). <c>HadDraft=false</c> is legacy's <c>PlanError("NO_DRAFT")</c>,
/// which the route's PLAN_ERROR_STATUS table (graduation-plan.ts:15) maps to 400.
/// </summary>
public sealed record SubmitPlanResult(bool HadDraft, GraduationPlanDto? Plan);

/// <summary>getSupplementalRecommendations (planWorkflowService.ts:176).</summary>
public sealed record SupplementalCourseDto(
    string Id,
    string Title,
    string? Provider,
    string? Category,
    double? Rating,
    int MatchScore,
    string? FillsGap,
    string Reason);

/// <summary>
/// The counselor read (counselor-graduation.ts:29-41). <c>Target</c> is null unless the row exists AND is
/// active, and it is a THREE-key projection — the counselor never sees fieldKey/selectivityTier/id.
/// </summary>
public sealed record CounselorPlanView(GraduationPlanDto? Plan, CounselorTargetProjection? Target);

public sealed record CounselorTargetProjection(string? UniversityName, string Major, string TemplateKey);

public enum ReviewPlanOutcome
{
    /// <summary>The decision was applied; <c>Plan</c> is the refreshed getCurrentPlan.</summary>
    Reviewed,

    /// <summary>reviewPlan returned null — no active proposed plan. Route: 404 "No proposed plan to review".</summary>
    NoProposedPlan,

    /// <summary>PlanError("NO_CURRENT_YEAR") on the approve path. Route: 422 with the code.</summary>
    NoCurrentYear,
}

/// <summary>
/// reviewPlan's result (planWorkflowService.ts:64). <c>MaterializedCount</c> is not on the wire — it is the
/// count interpolated into the student's approval notification (:125).
/// </summary>
public sealed record ReviewPlanResult(ReviewPlanOutcome Outcome, GraduationPlanDto? Plan, int MaterializedCount);
