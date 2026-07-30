namespace FormMaps.Application.Video;

/// <summary>
/// Thin wrapper over the two Daily.co REST calls routes/video.ts's POST /signature makes. The first
/// (video calling is NOT globally on/off gated by whether the key is set — see Task 4) call MUST NEVER
/// throw: legacy wraps room creation in a try/catch that swallows BOTH the "already exists" API error
/// AND any network failure, falling back to a deterministic room URL either way. The second call has NO
/// such guard in legacy — a transport failure there is expected to bubble up to a generic 500.
/// </summary>
public interface IDailyClient
{
    /// <summary>False when DAILY_API_KEY is unset/blank — callers must check this BEFORE calling either
    /// method below and return 503 "Video calling is not configured" if false (matches legacy exactly).</summary>
    bool IsConfigured { get; }

    /// <summary>Idempotent room creation. Never throws.</summary>
    Task<string> EnsureRoomUrlAsync(string roomName, CancellationToken cancellationToken = default);

    /// <summary>May throw on transport failure — deliberately unguarded, matching legacy. Returns null if
    /// Daily.co's response has no "token" field (caller maps this to 502).</summary>
    Task<string?> CreateMeetingTokenAsync(
        string roomName, string userId, string userName, bool isOwner, CancellationToken cancellationToken = default);
}
