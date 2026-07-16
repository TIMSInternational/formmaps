using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Reads a caller's own personality take-flow sessions (legacy checkAccess / getSession = getOwnedSession)
/// under read-only RLS. Both are self-scoped — no canAccessUser.
/// </summary>
public interface IPersonalitySessionReader
{
    /// <summary>The caller's active sessions (id + status), newest-first, for the access decision.</summary>
    Task<IReadOnlyList<PersonalitySessionStatus>> ReadAccessSessionsAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default);

    /// <summary>The caller's own active session by id (id/userId/isActive match); null =&gt; 404.</summary>
    Task<PersonalitySessionView?> GetOwnedSessionAsync(
        RequestContext context,
        string sessionId,
        string userId,
        CancellationToken cancellationToken = default);
}
