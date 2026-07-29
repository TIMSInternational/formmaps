using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Read-owner for LIA session access/detail/practice-questions (legacy checkAccess / getSession / the
/// practice-questions fetch inside getSession, services/lia/lia-session-service.ts).
///
/// GetSessionAsync is an unconditional one-line delegation to
/// <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/> (Task 3's writer): EVERY call opens a
/// writable transaction and takes a <c>SELECT ... FOR UPDATE</c> row lock on the session — not only
/// when a stale deadline is actually found — because the ownership check and the possible expiry-write
/// must happen inside the SAME transaction, and legacy's own design keeps exactly one lazy-expiry code
/// path (getSession calls the SAME shared expireIfPastDeadline function that submitAnswer/startSession
/// call, rather than a second copy of it). Callers should be aware this means a polled GET to this
/// endpoint serializes against concurrent writers on the same session row for the duration of the
/// transaction, not just on the rare request that actually triggers a timeout.
///
/// Scope note: legacy checkAccess's third fallback branch (a completely separate legacy exam system —
/// PCAExamSession/LEGACY_MIL_TYPES — for students who completed an older exam format) is a different
/// subsystem, unrelated to this LIA port, and is deliberately NOT implemented here.
/// </summary>
public interface ILiaSessionReader
{
    Task<LiaCheckAccessResult> GetAccessAsync(
        RequestContext context,
        string userId,
        CancellationToken cancellationToken = default);

    /// <summary>Null = not found/not owned (uniform IDOR-safe outcome).</summary>
    Task<SessionDetail?> GetSessionAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default);

    /// <summary>Null = not found/not owned (uniform IDOR-safe outcome).</summary>
    Task<IReadOnlyList<ClientQuestion>?> GetPracticeQuestionsAsync(
        RequestContext context,
        string sessionId,
        string ownerUserId,
        CancellationToken cancellationToken = default);
}
