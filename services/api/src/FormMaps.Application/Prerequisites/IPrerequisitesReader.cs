using FormMaps.Application.Auth;

namespace FormMaps.Application.Prerequisites;

/// <summary>
/// The prerequisites READ surface (FM-DOTNET-057). All methods run under the caller's read-only RLS session and are
/// school-scoped by the schoolId the endpoint already resolved. The no-school (null/empty schoolId) case is handled by
/// the ENDPOINT (400 "No school"), never here. Student/course existence 404s are signalled via the result outcomes.
/// </summary>
public interface IPrerequisitesReader
{
    /// <summary>getPrerequisiteChain — BFS over the prereq graph (active catalog), depth-DESC STABLE order,
    /// heterogeneous credits (catalog=string, non-catalog=number 0). Null → 404 (course missing / wrong school).</summary>
    Task<PrerequisiteChainResult?> GetPrerequisiteChainAsync(
        RequestContext context, string schoolId, string courseId, CancellationToken cancellationToken = default);

    /// <summary>checkEligibility for one student+course (resolveCourse = id-in-school else exact code). Serves both
    /// /prerequisites/check (with eligible) and /prerequisites/missing (without). Outcome carries the 404 cases.</summary>
    Task<EligibilityResult> CheckEligibilityAsync(
        RequestContext context, string schoolId, string studentId, string courseIdOrCode,
        CancellationToken cancellationToken = default);

    /// <summary>computeEligibilityMap for a student across the active catalog (two-set: resolution=ALL catalog,
    /// enumeration=active+status='active'). The handler filters + projects. Outcome carries the student 404.</summary>
    Task<EligibleMapResult> ComputeEligibleAsync(
        RequestContext context, string schoolId, string studentId, CancellationToken cancellationToken = default);
}
