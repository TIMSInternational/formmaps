using FormMaps.Application.Auth;

namespace FormMaps.Application.ParentChildReads;

/// <summary>
/// Parent child-link-scoped reads — the two authenticated cross-user reads of routes/parent.ts (FM-DOTNET-079,
/// mounted /api/v1/parent). Both gated by an accepted+active StudentParentLink (parentUserId == caller). IDOR corpus
/// #1: a parent may read ONLY a child they are linked to.
///
/// progress: link → 403 "Not linked to this student"; student missing → 404 "Student not found"; else GPA / credit
/// progress / assessment badges — all read under the caller's Identity RLS session (NO runAsSystem, matching legacy).
/// course-plan: link → 404 "Student not found" (a stricter, existence-hiding gate); then the approved plan / target /
/// current courses are read under a SYSTEM (RLS-bypass) session, because a school-less parent's tenant-scoped RLS
/// cannot see those school-scoped rows (legacy runAsSystem).
/// </summary>
public interface IParentChildReader
{
    Task<ChildProgressResult> GetProgressAsync(
        RequestContext context, string parentUserId, string studentId, CancellationToken cancellationToken = default);

    Task<ChildCoursePlanResult> GetCoursePlanAsync(
        RequestContext context, string parentUserId, string studentId, CancellationToken cancellationToken = default);
}

// ---- progress ----

public sealed record ChildProgressResult(ChildProgressOutcome Outcome, ChildProgress? Data);

public enum ChildProgressOutcome
{
    NotLinked,      // → 403 "Not linked to this student"
    StudentNotFound, // → 404 "Student not found"
    Ok,
}

public sealed record ChildProgress(
    ChildStudentInfo Student,
    double? Gpa,
    bool IsOnTrack,
    ChildCreditProgress CreditProgress,
    ChildAssessments Assessments);

public sealed record ChildStudentInfo(string Id, string Name, int? GradeLevel);

/// <summary>earned = Σ Number(credits) (raw, NOT rounded); required = Number(totalCreditsRequired) or 120;
/// percentage = Math.round(earned / required * 100) with NO 100 cap (matching legacy).</summary>
public sealed record ChildCreditProgress(double Earned, double Required, int Percentage);

public sealed record ChildAssessments(
    bool PcaCompleted,
    int MilCompleted,
    int MilTotal,
    int MilAverageScore,
    int Evaluation360Total,
    int Evaluation360Completed);

// ---- course-plan ----

public sealed record ChildCoursePlanResult(bool Linked, ChildCoursePlan? Data);

public sealed record ChildCoursePlan(
    ChildTarget? Target,
    ChildApprovedPlan? ApprovedPlan,
    IReadOnlyList<ChildCurrentCourse> CurrentCourses);

/// <summary>Emitted only when the target row exists AND isActive (else null).</summary>
public sealed record ChildTarget(string? UniversityName, string Major);

/// <summary>approvedAt = the plan's reviewedAt (ISO-Z or null).</summary>
public sealed record ChildApprovedPlan(string? ApprovedAt, IReadOnlyList<ChildPlanItem> Items);

public sealed record ChildPlanItem(string CourseCode, string CourseName, double Credits, int GradeLevel, string? Term);

public sealed record ChildCurrentCourse(string CourseId, string? Term, string Status);
