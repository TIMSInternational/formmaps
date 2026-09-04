using FormMaps.Application.Auth;

namespace FormMaps.Application.Graduation;

/// <summary>
/// The student-facing graduation-plan surface (legacy routes/graduation-plan.ts, mounted /api/v1/student).
/// Every method runs on the CALLER's own RLS session — the caller IS the student on all six routes, so the
/// own-row arm of the <c>student_graduation_targets</c> policy and the school arm of the
/// <c>graduation_plans</c> policy are both satisfied without any widening.
///
/// <para>The one exception is the notification fan-out, which is NOT here: see
/// <see cref="IGraduationNotificationWriter"/> for why it needs a System session and why that is a port of
/// legacy's <c>runAsSystem</c> rather than a convenience.</para>
/// </summary>
public interface IGraduationPlanRepository
{
    /// <summary>graduationPlanService.ts:40 getTargetOrSuggestion.</summary>
    Task<TargetOrSuggestion> GetTargetOrSuggestionAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>graduationPlanService.ts:57 setTarget — university normalization + upsert on studentId.</summary>
    Task<SavedTargetRow> SetTargetAsync(
        RequestContext context, string userId, string? schoolId, SetTargetInput input,
        CancellationToken cancellationToken = default);

    /// <summary>graduationPlanService.ts:130 getCurrentPlan. Null is a 200 with <c>data: null</c>.</summary>
    Task<GraduationPlanDto?> GetCurrentPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>planWorkflowService.ts:39 submitPlan — draft -&gt; proposed plus the counselor fan-out.</summary>
    Task<SubmitPlanResult> SubmitPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>graduationPlanService.ts:234 discardDraft. False =&gt; 404 "No draft to discard".</summary>
    Task<bool> DiscardDraftAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>planWorkflowService.ts:176 getSupplementalRecommendations. No AI on this path.</summary>
    Task<IReadOnlyList<SupplementalCourseDto>> GetSupplementalRecommendationsAsync(
        RequestContext context, string userId, CancellationToken cancellationToken = default);
}
