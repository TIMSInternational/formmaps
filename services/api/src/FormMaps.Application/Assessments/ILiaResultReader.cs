using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Read-only LIA results reader (legacy services/lia/lia-results-service.ts getResults /
/// getUserResults). Both reads run under the caller's read-only RLS session.
/// </summary>
public interface ILiaResultReader
{
    /// <summary>
    /// A specific completed session's results, gated on STRICT self-ownership: returns null unless the
    /// session exists, is owned by <paramref name="ownerUserId"/>, and status is 'completed'
    /// (legacy getResults). No privileged cross-user access — the endpoint maps null to a uniform 404.
    /// </summary>
    Task<LiaResults?> ReadBySessionAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The newest completed + active session's results for a target user (legacy getUserResults).
    /// Access control (canAccessUser) is the endpoint's responsibility; returns null when the user has
    /// no completed session.
    /// </summary>
    Task<LiaResults?> ReadNewestForUserAsync(
        RequestContext context,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
