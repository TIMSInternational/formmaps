using FormMaps.Application.Auth;

namespace FormMaps.Application.Assessments;

/// <summary>
/// Read-owner for LIA session access/detail/practice-questions (legacy checkAccess / getSession / the
/// practice-questions fetch inside getSession, services/lia/lia-session-service.ts). GetSessionAsync's
/// lazy expiry is delegated entirely to <see cref="ILiaSessionWriter.ReadWithLazyExpiryAsync"/> (Task 3's
/// writer) rather than duplicated here — a GET that always opened a writable transaction even when
/// nothing expired would be heavier than necessary, so this reader only escalates to the writer when its
/// own read detects a stale deadline. This mirrors legacy's own design: getSession calls the SAME shared
/// expireIfPastDeadline function that submitAnswer/startSession call, rather than a second copy of it.
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
