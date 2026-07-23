using FormMaps.Application.Auth;

namespace FormMaps.Application.Pathways;

/// <summary>
/// The derived-pathways READ surface (FM-DOTNET-058). Runs under the caller's read-only RLS session, school-scoped by
/// the schoolId the endpoint already resolved. The no-school (null/empty schoolId) case is handled by the ENDPOINT
/// (400 "No school"), never here. Never 404s — an empty catalog yields { truncated:false, groups:[] }.
/// </summary>
public interface IPathwaysReader
{
    /// <summary>computePathways — load the active catalog (isActive=true AND status='active', ORDER BY code ASC) and
    /// derive root→leaf chains over the transitively-reduced prereq DAG, grouped by the first course's department.</summary>
    Task<PathwaysResult> ComputePathwaysAsync(
        RequestContext context, string schoolId, CancellationToken cancellationToken = default);
}
