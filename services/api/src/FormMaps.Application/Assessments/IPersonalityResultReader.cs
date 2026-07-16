using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Read-only personality results reader (legacy personality-session-service.ts getResults /
/// getUserResults). Both reads run under the caller's read-only RLS session and return null when the
/// session is missing / not completed / has no resolvedType (the endpoint maps null to a uniform 404).
/// </summary>
public interface IPersonalityResultReader
{
    /// <summary>
    /// A specific completed session's results, gated on STRICT self-ownership: null unless the session
    /// exists, is owned by <paramref name="ownerUserId"/>, status is 'completed', and resolvedType is
    /// set (legacy getResults). No privileged cross-user access.
    /// </summary>
    Task<PersonalityResults?> ReadBySessionAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The newest completed + active session's results for a target user (legacy getUserResults).
    /// Access control (canAccessUser) is the endpoint's responsibility.
    /// </summary>
    Task<PersonalityResults?> ReadNewestForUserAsync(
        RequestContext context,
        string targetUserId,
        CancellationToken cancellationToken = default);
}
