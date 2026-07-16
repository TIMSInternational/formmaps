using FormMaps.Application.Auth;

namespace FormMaps.Application.Reports;

/// <summary>
/// Reads the evaluation-session report in two phases so the caller's ownership check can run
/// against the group's evaluatedUserId before any feedback is loaded (mirroring the legacy
/// resolve-group -> canAccessUser -> load-detail order).
/// </summary>
public interface IEvaluationReportReader
{
    /// <summary>
    /// Resolve the evaluation group by session id (no isActive filter). Returns null when the
    /// group does not exist (or is hidden by the caller's RLS session).
    /// </summary>
    Task<EvaluationGroupCore?> ResolveGroupAsync(
        RequestContext requestContext,
        string sessionId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Load the student name and active feedback rows and assemble the full report for an
    /// already-resolved and access-approved group.
    /// </summary>
    Task<EvaluationReport> ReadReportAsync(
        RequestContext requestContext,
        EvaluationGroupCore group,
        CancellationToken cancellationToken = default);
}
