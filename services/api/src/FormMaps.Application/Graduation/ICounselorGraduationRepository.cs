using FormMaps.Application.Auth;

namespace FormMaps.Application.Graduation;

/// <summary>
/// The counselor-facing half (legacy routes/counselor-graduation.ts, mounted /api/v1/counselor). Two routes;
/// the third, POST .../generate, stays on Node under DECISION D1.
///
/// <para>The assignment gate is an APP-LAYER predicate and has to stay one. The
/// <c>counselor_student_assignments</c> policy (003-fk-users.sql:508) admits any row whose STUDENT is in the
/// caller's school, so RLS alone would let a same-school counselor read a colleague's caseload —
/// <c>"counselorId" = @counselor</c> is the only thing that scopes it. The RLS proof test deletes exactly that
/// predicate and asserts the read goes red.</para>
/// </summary>
public interface ICounselorGraduationRepository
{
    /// <summary>
    /// counselor-graduation.ts:16 ensureCounselorStudentAccess. False =&gt; 404 "Student not found", which is
    /// deliberately indistinguishable from a genuinely missing student (same shape as counselor-analytics).
    /// </summary>
    Task<bool> IsAssignedAsync(
        RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>counselor-graduation.ts:29-41 — getCurrentPlan plus the active-only target projection.</summary>
    Task<CounselorPlanView> GetPlanAsync(
        RequestContext context, string studentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// planWorkflowService.ts:64 reviewPlan. <paramref name="decision"/> is "approved" or "rejected" (the
    /// route rejects anything else with a 400 before reaching here). Approve materializes ONLY the items whose
    /// gradeLevel equals the student's current grade, carrying EACH ITEM'S OWN gradeLevel into
    /// student_course_plans — see the implementation for why that is not the same thing as the student's grade.
    /// </summary>
    Task<ReviewPlanResult> ReviewPlanAsync(
        RequestContext context, string counselorId, string studentId, string decision, string? note,
        CancellationToken cancellationToken = default);
}
