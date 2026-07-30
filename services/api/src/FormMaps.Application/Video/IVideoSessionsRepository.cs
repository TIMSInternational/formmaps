using FormMaps.Application.Auth;

namespace FormMaps.Application.Video;

/// <summary>
/// Video-call session access (routes/video.ts). Reads/writes the SAME "counselor_sessions" table as
/// FormMaps.Application.Counselor's ICounselorSessionsRepository, filtered to topic="Video Call" rows
/// where relevant — kept as a sibling interface, not shared, because the two domains' query shapes
/// (video-call filtering vs. a counselor's full session list) are independently evolving. See the
/// Domain 7a design spec for why this isn't folded into Counselor.
/// </summary>
public interface IVideoSessionsRepository
{
    /// <summary>schools.videoCallsEnabled for a given school id. False if the school row is missing.
    /// <paramref name="context"/> is threaded through to every method (not just this one) and used to open
    /// an Identity-GUC session via IFormMapsDatabaseSessionFactory, same convention as
    /// ICounselorSessionsRepository — NOT RequestContext.System()/Bypass, since these are ordinary
    /// caller-scoped reads/writes, not a system-level operation.</summary>
    Task<bool> IsVideoEnabledForSchoolAsync(RequestContext context, string schoolId, CancellationToken cancellationToken = default);

    /// <summary>The caller's own video-call sessions (topic="Video Call", meetingLink != ""), where the
    /// caller is either counselorId or studentId. Desc by startTime, capped at 50 — matches legacy's
    /// fixed `take: 50` (no pagination on this route).</summary>
    Task<IReadOnlyList<VideoSessionRow>> ListForUserAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>Plain lookup by id — NO topic filter (legacy quirk: GET /sessions/:id and the end/start
    /// mutations all use prisma.counselorSession.findUnique, which doesn't scope to video-call rows).</summary>
    Task<VideoSessionRow?> GetByIdAsync(RequestContext context, string sessionId, CancellationToken cancellationToken = default);

    /// <summary>Lookup by meetingLink + topic="Video Call" (used only by POST /signature, which legacy
    /// resolves via findFirst on those two columns instead of an id).</summary>
    Task<VideoSessionRow?> FindByRoomNameAsync(RequestContext context, string roomName, CancellationToken cancellationToken = default);

    /// <summary>A prospective call participant's directory info, for POST /sessions's validation chain.</summary>
    Task<VideoParticipantCandidate?> FindParticipantCandidateAsync(RequestContext context, string userId, CancellationToken cancellationToken = default);

    /// <summary>True if an ACTIVE counselor_student_assignments row links counselorId → studentId.</summary>
    Task<bool> HasActiveCounselorAssignmentAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>Creates an ad-hoc call: status="video_active", topic="Video Call", a random
    /// `formmaps-{16 hex chars}` meetingLink, startTime=now, endTime=now+1h (all legacy-owned defaults —
    /// the repository generates them, mirroring how CounselorSessionsRepository.Now() self-stamps).</summary>
    Task<CreatedVideoSession> CreateAsync(RequestContext context, string counselorId, string studentId, CancellationToken cancellationToken = default);

    /// <summary>NotFound (missing) / Forbidden (caller not counselorId or studentId) / Ok (status set to
    /// "completed", completedAt+endTime stamped now).</summary>
    Task<SessionMutationOutcomeKind> EndAsync(RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default);

    /// <summary>NotFound / Forbidden / NotScheduled (status != "scheduled") / Ok (status set to
    /// "video_active", startTime restamped now). SessionName is non-null only when Kind == Ok.</summary>
    Task<(SessionMutationOutcomeKind Kind, string? SessionName)> StartAsync(
        RequestContext context, string sessionId, string callerId, CancellationToken cancellationToken = default);
}

public sealed record VideoSessionRow(
    string Id, string SessionName, string Status, string Topic, string Notes,
    string StartTime, string EndTime, string? CompletedAt,
    string CounselorId, string? CounselorName, string? CounselorEmail,
    string StudentId, string? StudentName, string? StudentEmail);

public sealed record VideoParticipantCandidate(string Id, string? Name, string? Email, string? SchoolId);

public sealed record CreatedVideoSession(string Id, string SessionName, string StartTime);

public enum SessionMutationOutcomeKind { NotFound, Forbidden, NotScheduled, Ok }
